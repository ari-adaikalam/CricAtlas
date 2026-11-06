import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import type { Shot } from '@/domain/shots';
import { query } from './engine';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { loadPoints } from './points';
import { locatedOf, selectPoints, shotsOf } from '@/domain/pointFilter';
import { BATTER_CAUGHT, BATTER_OUT, scopeWhere } from './scope';

/** Scoring shots, and balls that dismissed the batter, with tracking, under the Format, Competition and Season choices. Position (0, 0) means no tracking, not a shot. */
export async function loadShots(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<Shot[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  // From the point file, filtered in JavaScript with no query engine; the SQL below is the fallback and the reference the file is checked against (web/scripts/verify-points.ts).
  const set = await loadPoints(playerId);
  if (set) return shotsOf(set, selectPoints(set, filters, ball));
  return loadShotsSql(playerId, filters, ball);
}

/** The same rows from the query engine. */
export async function loadShotsSql(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<Shot[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball);
  const sql = `select wagon_x as x, wagon_y as y, runs_off_bat as runs, ${BATTER_OUT} as "out", ${BATTER_CAUGHT} as caught, shot_played as shot, bowler, "over", ball_in_over as "ballInOver"
    from 'balls_by_batter.parquet'
    where ${where.join(' and ')} and (runs_off_bat > 0 or ${BATTER_OUT}) and wagon_x is not null and wagon_y is not null and not (wagon_x = 0 and wagon_y = 0)
    order by start_date, match_id, innings, delivery_number`;
  return query<Shot>([DATA_FILES.ballsByBatter], sql, params);
}

/**
 * Every ball with a position, dot balls too, under the Format, Competition and Season choices, for the Scoring zones tile (a strike rate needs the balls that
 * scored nothing). Position (0, 0) means no tracking. The shots loader above holds only scoring balls and dismissals.
 */
export async function loadLocatedBalls(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<Shot[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const set = await loadPoints(playerId);
  if (set) return locatedOf(set, selectPoints(set, filters, ball));
  return loadLocatedBallsSql(playerId, filters, ball);
}

/** The same rows from the query engine. */
export async function loadLocatedBallsSql(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<Shot[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball);
  const sql = `select wagon_x as x, wagon_y as y, runs_off_bat as runs, ${BATTER_OUT} as "out", ${BATTER_CAUGHT} as caught, shot_played as shot, bowler, "over", ball_in_over as "ballInOver"
    from 'balls_by_batter.parquet'
    where ${where.join(' and ')} and coalesce(wides, 0) = 0 and wagon_x is not null and wagon_y is not null and not (wagon_x = 0 and wagon_y = 0)`;
  return query<Shot>([DATA_FILES.ballsByBatter], sql, params);
}
