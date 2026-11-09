import type { BallFilters } from '@/domain/ballFilters';
import type { FalseShotInnings } from '@/domain/control';
import { FALSE_SHOT_INNINGS } from '@/domain/control';
import type { PlayerFilters } from '@/domain/filters';
import type { Shot } from '@/domain/shots';
import { query } from './engine';
import { BOWLER_CAUGHT, BOWLER_WICKET } from './pitch';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';
import { loadPoints } from './points';
import { bowlLocatedOf, bowlShotsOf, falseShotInningsOf, selectPoints } from '@/domain/pointFilter';

/**
 * Every ball with a position that a bowler delivered, dot balls too, under every filter. Runs are off the bat, and a wicket is one credited to the bowler. The Ring tile
 * reads these. A ball with position (0, 0) has no tracking. The shot field holds the shot label and the bowler field holds the batter's name, since a tip names the opponent.
 */
export async function loadBowlLocated(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<Shot[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  // From the bowler's point file, with no query engine; the SQL below is the fallback and the reference (web/scripts/verify-points.ts).
  const set = await loadPoints(playerId, 'ptb');
  if (set) return bowlLocatedOf(set, selectPoints(set, filters, ball, 'bowl'));
  return loadBowlLocatedSql(playerId, filters, ball);
}

/** The same rows from the query engine. */
export async function loadBowlLocatedSql(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<Shot[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  const file = DATA_FILES.ballsByBowler;
  return query<Shot>([file], `
    select wagon_x as x, wagon_y as y, runs_off_bat as runs, ${BOWLER_WICKET} as "out", ${BOWLER_CAUGHT} as caught, shot_played as shot, striker as bowler, "over", ball_in_over as "ballInOver"
    from '${file}' where ${where.join(' and ')} and (is_legal_delivery or ${BOWLER_WICKET}) and wagon_x is not null and wagon_y is not null and not (wagon_x = 0 and wagon_y = 0)`, params);
}

export interface BowlShots { right: Shot[]; left: Shot[]; scoring: number }

/**
 * The scoring balls and the wickets a bowler took, with their position, split by the batting hand of the batter. A batter with no recorded hand is in neither list.
 * `scoring` is all the scoring balls and wickets, tracked or not, for the coverage note.
 */
export async function loadBowlShots(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<BowlShots> {
  if (!PLAYER_ID.test(playerId)) return { right: [], left: [], scoring: 0 };
  const set = await loadPoints(playerId, 'ptb');
  if (set) return bowlShotsOf(set, selectPoints(set, filters, ball, 'bowl'));
  return loadBowlShotsSql(playerId, filters, ball);
}

/** The same rows from the query engine. */
export async function loadBowlShotsSql(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<BowlShots> {
  const empty: BowlShots = { right: [], left: [], scoring: 0 };
  if (!PLAYER_ID.test(playerId)) return empty;
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  // A wicket credited on a delivery that was not legal (a stumping off a wide) counts; other balls must be legal.
  where.push(`(is_legal_delivery or ${BOWLER_WICKET})`, `(runs_off_bat > 0 or ${BOWLER_WICKET})`);
  const file = DATA_FILES.ballsByBowler;
  const rows = await query<Shot & { hand: string | null; tracked: boolean }>([file], `
    select wagon_x as x, wagon_y as y, runs_off_bat as runs, ${BOWLER_WICKET} as "out", ${BOWLER_CAUGHT} as caught, shot_played as shot, striker as bowler, "over", ball_in_over as "ballInOver",
      case when "batting style_striker" = 'right-hand bat' then 'R' when "batting style_striker" = 'left-hand bat' then 'L' else null end as hand,
      wagon_x is not null and wagon_y is not null and not (wagon_x = 0 and wagon_y = 0) as tracked
    from '${file}' where ${where.join(' and ')} order by start_date, match_id, innings, delivery_number`, params);
  const tracked = rows.filter((r) => r.tracked);
  return { right: tracked.filter((r) => r.hand === 'R'), left: tracked.filter((r) => r.hand === 'L'), scoring: rows.length };
}

/** The latest innings a bowler bowled with a control reading on at least some balls, oldest first, with the false shots he induced. The domain applies the minimum. */
export async function loadBowlFalseShotInnings(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<FalseShotInnings[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const set = await loadPoints(playerId, 'ptb');
  if (set) return falseShotInningsOf(set, selectPoints(set, filters, ball, 'bowl'));
  return loadBowlFalseShotInningsSql(playerId, filters, ball);
}

/** The same rows from the query engine. */
export async function loadBowlFalseShotInningsSql(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<FalseShotInnings[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  where.push('is_legal_delivery', 'shot_control is not null');
  const file = DATA_FILES.ballsByBowler;
  const rows = await query<FalseShotInnings>([file], `
    select count(*)::int as known, count(*) filter (where shot_control = 'not in control')::int as "falseShots", strftime(max(start_date), '%Y-%m-%d') as date, any_value(batting_team) as opponent
    from '${file}' where ${where.join(' and ')} group by match_id, innings order by max(start_date) desc, match_id desc, innings desc limit ${FALSE_SHOT_INNINGS * 4}`, params);
  return rows.reverse();
}
