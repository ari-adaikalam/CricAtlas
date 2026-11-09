import type { BallFilters } from '@/domain/ballFilters';
import type { BowlingSlice } from '@/domain/bowling';
import type { PlayerFilters } from '@/domain/filters';
import { query } from './engine';
import { BOWLER_WICKET } from './pitch';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

const CHARGED = 'runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0)';

/**
 * A bowler's numbers under every filter, as counts. Runs conceded are the runs off the bat plus wides and no-balls, the way the player summary counts them.
 * A let off is a dropped catch off a ball the bowler bowled where the batter was not out on it. Its runs after are what that batter scored from the
 * ball after the first such drop in that innings, counted once for a batter's innings and taken from every bowler, since the drop is what let the runs happen.
 */
export async function loadBowlingSlice(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<BowlingSlice> {
  const empty: BowlingSlice = { balls: 0, conceded: 0, wickets: 0, dots: 0, boundaries: 0, extras: 0, innings: 0, perInnings: [], letOffs: 0, letOffRuns: 0 };
  if (!PLAYER_ID.test(playerId)) return empty;
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  const w = where.join(' and ');
  const file = DATA_FILES.ballsByBowler;
  const [totals, perInnings, drops] = await Promise.all([
    query<{ balls: number; conceded: number; wickets: number; dots: number; boundaries: number; extras: number; innings: number }>([file], `
      select count(*) filter (where is_legal_delivery)::int as balls, coalesce(sum(${CHARGED}), 0)::int as conceded,
        coalesce(sum(case when ${BOWLER_WICKET} then 1 else 0 end), 0)::int as wickets,
        count(*) filter (where is_legal_delivery and runs_off_bat = 0)::int as dots,
        count(*) filter (where is_legal_delivery and ((runs_off_bat = 4 and not coalesce(non_boundary, false)) or runs_off_bat = 6))::int as boundaries,
        count(*) filter (where coalesce(wides, 0) > 0 or coalesce(noballs, 0) > 0)::int as extras,
        count(distinct (match_id, innings))::int as innings
      from '${file}' where ${w}`, params),
    query<{ wickets: number; runs: number }>([file], `
      select coalesce(sum(case when ${BOWLER_WICKET} then 1 else 0 end), 0)::int as wickets, coalesce(sum(${CHARGED}), 0)::int as runs
      from '${file}' where ${w} group by match_id, innings`, params),
    // The first ball in each batter's innings that the batter was dropped off, and the runs the batter scored after it (letoff_by_bowler, worked out when the data is built, so no whole-match file is read).
    query<{ n: number; runsAfter: number }>([file, DATA_FILES.letoff], `
      select d.n::int as n, coalesce(l.runs_after, 0)::int as "runsAfter"
      from (select match_id, innings, striker_id, min(delivery_number) as first, count(*) as n
            from '${file}' where ${w} and striker_id is not null and player_dismissed is null
              and coalesce(regexp_matches(ball_events, 'dropped catch'), false) group by match_id, innings, striker_id) d
      left join '${DATA_FILES.letoff}' l on l.match_id = d.match_id and l.innings = d.innings and l.striker_id = d.striker_id and l.delivery_number = d.first`, params),
  ]);
  const t = totals[0];
  const letOffRuns = drops.reduce((sum, d) => sum + d.runsAfter, 0);
  return {
    balls: t?.balls ?? 0, conceded: t?.conceded ?? 0, wickets: t?.wickets ?? 0, dots: t?.dots ?? 0, boundaries: t?.boundaries ?? 0, extras: t?.extras ?? 0, innings: t?.innings ?? 0,
    perInnings, letOffs: drops.reduce((a, d) => a + d.n, 0), letOffRuns,
  };
}
