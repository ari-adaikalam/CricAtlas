import { DEFAULT_BALL_FILTERS, type BallFilterKey, type BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import type { BowlFormInnings, FormInnings } from '@/domain/profile';
import { BOWLER_WICKET } from './pitch';
import { query } from './engine';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { BATTER_OUT, inningsScope, scopeWhere } from './scope';

/** The last ten innings in any format, oldest first, with the team bowled against. */
export async function loadForm(playerId: string): Promise<FormInnings[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  // A batter is out in an innings if the dismissals file has them there. That includes a run out at the non-striker's end,
  // which is on a ball with another striker and so is not in the batter's own ball file.
  const rows = await query<{ runs: number; out: boolean; opponent: string; match_id: number; opponent_id: string | null }>([DATA_FILES.ballsByBatter, DATA_FILES.dismissalsByBatter], `
    select i.runs, o.match_id is not null as "out", i.opponent, i.match_id::int as match_id, i.opponent_id
    from (select match_id, innings, sum(runs_off_bat)::int as runs, any_value(bowling_team) as opponent, any_value(bowling_team_id) as opponent_id, max(start_date) as day
          from 'balls_by_batter.parquet' where striker_id = ? and coalesce(wides, 0) = 0 and not is_super_over group by match_id, innings) i
    left join (select distinct match_id, innings from 'dismissals_by_batter.parquet' where batter_id = ?) o using (match_id, innings)
    order by i.day desc, i.match_id desc, i.innings desc limit 10`, [playerId, playerId]);
  return rows.reverse().map((r) => ({ runs: r.runs, notOut: !r.out, opponent: r.opponent, opponentId: r.opponent_id, matchId: r.match_id }));
}

/** The last ten innings bowled in any format, oldest first, with the team bowled against. Super Overs are left out, as in every career figure. */
export async function loadBowlForm(playerId: string): Promise<BowlFormInnings[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const rows = await query<BowlFormInnings & { match_id: number; opponent_id: string | null }>([DATA_FILES.ballsByBowler], `
    select sum(case when ${BOWLER_WICKET} then 1 else 0 end)::int as wickets, sum(runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0))::int as runs, any_value(batting_team) as opponent, any_value(batting_team_id) as opponent_id, match_id::int as match_id
    from 'balls_by_bowler.parquet' where bowler_id = ? and not is_super_over group by match_id, innings
    having count(*) filter (where is_legal_delivery) > 0
    order by max(start_date) desc, match_id desc, innings desc limit 10`, [playerId]);
  return rows.reverse().map((r) => ({ wickets: r.wickets, runs: r.runs, opponent: r.opponent, opponentId: r.opponent_id, matchId: r.match_id }));
}

/** Player of the match awards in every format. Cricsheet records the award by name. */
export async function loadAwards(name: string): Promise<number> {
  const rows = await query<{ n: number }>([DATA_FILES.matches], `select count(*)::int as n from 'matches.parquet' where player_of_match = ? or player_of_match_2 = ?`, [name, name]);
  return rows[0]?.n ?? 0;
}

/** A batter's balls under every filter: the numbers behind Key numbers. Counts only, so a rate is always worked out from totals. */
export interface BattingSlice {
  balls: number;
  runs: number;
  innings: number;
  dismissals: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  highScore: number;
  dots: number;
  controlled: number;
  /** Balls that carry a control label. */
  labelled: number;
  mostRuns: { shot: string; runs: number } | null;
  mostOut: { shot: string; outs: number } | null;
  /** Balls faced where a catch was dropped or a run out or stumping chance was missed, and the runs scored after the first one in each innings. */
  letOffs: number;
  letOffRuns: number;
  /** Balls that scored or dismissed the batter, and how many of them have a position on the ground. The wagon wheel's coverage. */
  scoring: number;
  scoringTracked: number;
  /** Balls faced with each tracked shot label, for the Shot select. */
  shotBalls: Array<{ shot: string; balls: number }>;
}

export async function loadBattingSlice(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<BattingSlice> {
  const empty: BattingSlice = { balls: 0, runs: 0, innings: 0, dismissals: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0, highScore: 0, dots: 0, controlled: 0, labelled: 0, mostRuns: null, mostOut: null, letOffs: 0, letOffRuns: 0, scoring: 0, scoringTracked: 0, shotBalls: [] };
  if (!PLAYER_ID.test(playerId)) return empty;
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball);
  where.push('coalesce(wides, 0) = 0');
  const w = where.join(' and ');
  const dismissed = scopeWhere(playerId, filters, 'bat', ball, 'batter_id');
  // An innings counts when the batter came to the crease, even with no ball faced (Ari, 2026-10-18), so with no ball filter the count comes from the innings table, which
  // is what the profile table counts. With a ball filter an innings is one the filtered balls are in, or one where a dismissal passes the filter (a run out at the
  // non-striker's end), since an innings without a ball can match no ball filter.
  const unfiltered = (Object.keys(DEFAULT_BALL_FILTERS) as BallFilterKey[]).every((k) => ball[k] === DEFAULT_BALL_FILTERS[k]);
  const scope = inningsScope(playerId, filters);
  const [shots, innings, dismissals, letOffs, counted] = await Promise.all([
    query<{ shot: string | null; runs: number; outs: number; fours: number; sixes: number; dots: number; balls: number; controlled: number; labelled: number; scoring: number; scoringTracked: number }>([DATA_FILES.ballsByBatter], `
      select shot_played as shot, sum(runs_off_bat)::int as runs, sum(case when ${BATTER_OUT} then 1 else 0 end)::int as outs,
        sum(case when runs_off_bat = 4 and not coalesce(non_boundary, false) then 1 else 0 end)::int as fours,
        sum(case when runs_off_bat = 6 then 1 else 0 end)::int as sixes,
        sum(case when runs_off_bat = 0 then 1 else 0 end)::int as dots, count(*)::int as balls,
        sum(case when shot_control = 'in control' then 1 else 0 end)::int as controlled,
        sum(case when shot_control is not null then 1 else 0 end)::int as labelled,
        sum(case when runs_off_bat > 0 or ${BATTER_OUT} then 1 else 0 end)::int as scoring,
        sum(case when (runs_off_bat > 0 or ${BATTER_OUT}) and wagon_x is not null and wagon_y is not null and not (wagon_x = 0 and wagon_y = 0) then 1 else 0 end)::int as "scoringTracked"
      from 'balls_by_batter.parquet' where ${w} group by shot_played`, params),
    query<{ innings: number; fifties: number; hundreds: number; high: number }>([DATA_FILES.ballsByBatter], `
      select count(*)::int as innings, count(*) filter (where r >= 50 and r < 100)::int as fifties, count(*) filter (where r >= 100)::int as hundreds, coalesce(max(r), 0)::int as high
      from (select sum(runs_off_bat) as r from 'balls_by_batter.parquet' where ${w} group by match_id, innings)`, params),
    query<{ n: number }>([DATA_FILES.dismissalsByBatter], `select count(*)::int as n from 'dismissals_by_batter.parquet' where ${dismissed.where.join(' and ')}`, dismissed.params),
    // A let off is a ball the batter faced and survived with a dropped catch, a run out chance or a stumping chance in its ball events. Runs after are
    // counted once for an innings, from the ball after its first let off to the end of the filtered balls, so two let offs never count a run twice.
    query<{ n: number; after: number }>([DATA_FILES.ballsByBatter], `
      with b as (select match_id, innings, delivery_number, runs_off_bat, ${BATTER_OUT} as dismissed,
                        coalesce(regexp_matches(ball_events, 'dropped catch|run out chance|stumping chance'), false) as chance
                 from 'balls_by_batter.parquet' where ${w}),
           first as (select match_id, innings, min(delivery_number) as d from b where chance and not dismissed group by 1, 2)
      select (select count(*) from b where chance and not dismissed)::int as n,
             coalesce(sum(case when b.delivery_number > first.d then b.runs_off_bat else 0 end), 0)::int as after
      from b join first using (match_id, innings)`, params),
    unfiltered
      ? query<{ n: number }>([DATA_FILES.batInnings], `select count(*)::int as n from '${DATA_FILES.batInnings}' where ${scope.where.join(' and ')}`, scope.params)
      : query<{ n: number }>([DATA_FILES.ballsByBatter, DATA_FILES.dismissalsByBatter], `
          select count(*)::int as n from (
            select match_id, innings from 'balls_by_batter.parquet' where ${w} group by match_id, innings
            union select match_id, innings from 'dismissals_by_batter.parquet' where ${dismissed.where.join(' and ')})`, [...params, ...dismissed.params]),
  ]);
  const add = (pick: (r: (typeof shots)[number]) => number): number => shots.reduce((a, r) => a + pick(r), 0);
  const named = shots.filter((r): r is typeof r & { shot: string } => r.shot !== null);
  const top = <K extends 'runs' | 'outs'>(key: K) => named.reduce<(typeof named)[number] | null>((best, r) => (r[key] > (best?.[key] ?? 0) || (best !== null && r[key] === best[key] && r[key] > 0 && r.shot < best.shot) ? r : best), null);
  // A tie goes to the shot that comes first alphabetically: the rows of a group-by come back in a different order on each run, and the first one used to win (found by verify-recorded.ts).
  const runs = top('runs'), outs = top('outs');
  return {
    balls: add((r) => r.balls), runs: add((r) => r.runs), innings: counted[0]?.n ?? 0, dismissals: dismissals[0]?.n ?? 0, fours: add((r) => r.fours), sixes: add((r) => r.sixes),
    fifties: innings[0]?.fifties ?? 0, hundreds: innings[0]?.hundreds ?? 0, highScore: innings[0]?.high ?? 0, dots: add((r) => r.dots), controlled: add((r) => r.controlled), labelled: add((r) => r.labelled),
    letOffs: letOffs[0]?.n ?? 0, letOffRuns: letOffs[0]?.after ?? 0,
    scoring: add((r) => r.scoring), scoringTracked: add((r) => r.scoringTracked),
    mostRuns: runs ? { shot: runs.shot, runs: runs.runs } : null, mostOut: outs ? { shot: outs.shot, outs: outs.outs } : null,
    shotBalls: named.map((r) => ({ shot: r.shot, balls: r.balls })),
  };
}
