import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import type { PitchRuns } from '@/domain/runsFilter';
import type { PitchRow } from '@/domain/pitch';
import { query } from './engine';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';
import { loadPoints } from './points';
import { pitchOf, selectPoints } from '@/domain/pointFilter';

export interface PitchData { rows: PitchRow[]; bowled: number; tracked: number }

// Wickets credited to a bowler. Run outs and retirements are not.
/** A wicket credited to the bowler that was a catch. */
export const BOWLER_CAUGHT = "coalesce(wicket_type in ('caught', 'caught and bowled'), false)";
export const BOWLER_WICKET = "coalesce(wicket_type in ('bowled', 'caught', 'lbw', 'stumped', 'caught and bowled', 'hit wicket'), false)";

/**
 * Legal balls a bowler delivered, grouped by tracked length and line. Wides and no-balls are not balls bowled, so they are not on the map.
 * A wicket wins over the runs on the ball. Dots are balls with nothing off the bat, scoring is 1 to 3 or 5 runs, and runs are off the bat.
 */
/** The Runs choice as a condition. Every text is fixed, and a wicket wins over the runs on the ball. */
const RUNS_WHERE: Record<PitchRuns, string | null> = {
  all: null,
  dot: `not (${BOWLER_WICKET}) and runs_off_bat = 0`,
  '13': `not (${BOWLER_WICKET}) and runs_off_bat between 1 and 3`,
  '1': `not (${BOWLER_WICKET}) and runs_off_bat = 1`,
  '2': `not (${BOWLER_WICKET}) and runs_off_bat = 2`,
  '3': `not (${BOWLER_WICKET}) and runs_off_bat = 3`,
  '4': `not (${BOWLER_WICKET}) and runs_off_bat = 4`,
  '6': `not (${BOWLER_WICKET}) and runs_off_bat >= 6`,
  wicket: BOWLER_WICKET,
};

export async function loadPitch(playerId: string, filters: PlayerFilters, ball: BallFilters, runs: PitchRuns = 'all'): Promise<PitchData> {
  if (!PLAYER_ID.test(playerId)) return { rows: [], bowled: 0, tracked: 0 };
  // From the bowler's point file, with no query engine; the SQL below is the fallback and the reference (web/scripts/verify-points.ts).
  const set = await loadPoints(playerId, 'ptb');
  if (set) return pitchOf(set, selectPoints(set, filters, ball, 'bowl'), runs);
  return loadPitchSql(playerId, filters, ball, runs);
}

/** The same rows from the query engine. */
export async function loadPitchSql(playerId: string, filters: PlayerFilters, ball: BallFilters, runs: PitchRuns = 'all'): Promise<PitchData> {
  if (!PLAYER_ID.test(playerId)) return { rows: [], bowled: 0, tracked: 0 };
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  // A wicket credited on a delivery that was not legal (a stumping off a wide) is a wicket and not a ball bowled, except when the Runs choice is Wicket, which lists the wickets themselves.
  where.push(`(is_legal_delivery or ${BOWLER_WICKET})`);
  const condition = RUNS_WHERE[runs];
  if (condition) where.push(condition);
  const w = where.join(' and ');
  const counts = runs === 'wicket' ? 'true' : 'is_legal_delivery';
  const rows = await query<PitchRow>([DATA_FILES.ballsByBowler], `
    select ball_length as length, ball_line as line,
      count(*) filter (where ${counts})::int as balls,
      sum(case when ${counts} and not (${BOWLER_WICKET}) and runs_off_bat = 0 then 1 else 0 end)::int as dots,
      sum(case when ${counts} and not (${BOWLER_WICKET}) and runs_off_bat in (1, 2, 3, 5) then 1 else 0 end)::int as scoring,
      sum(case when ${counts} and not (${BOWLER_WICKET}) and runs_off_bat = 4 then 1 else 0 end)::int as fours,
      sum(case when ${counts} and not (${BOWLER_WICKET}) and runs_off_bat >= 6 then 1 else 0 end)::int as sixes,
      sum(case when ${BOWLER_WICKET} then 1 else 0 end)::int as wickets,
      sum(case when ${counts} then runs_off_bat else 0 end)::int as runs,
      sum(case when ${counts} and shot_control = 'in control' then 1 else 0 end)::int as "inControl",
      sum(case when ${counts} and shot_control is not null then 1 else 0 end)::int as "controlKnown"
    from 'balls_by_bowler.parquet'
    where ${w} and ball_length is not null and ball_line is not null
    group by all`, params);
  const total = await query<{ bowled: number }>([DATA_FILES.ballsByBowler], `select (count(*) filter (where ${counts}))::int as bowled from 'balls_by_bowler.parquet' where ${w}`, params);
  const kept = rows.filter((r) => r.balls > 0 || r.wickets > 0);
  return { rows: kept, bowled: total[0]?.bowled ?? 0, tracked: kept.reduce((a, r) => a + r.balls, 0) };
}
