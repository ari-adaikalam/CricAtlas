import type { BallFilters } from '@/domain/ballFilters';
import type { ControlRow, FalseShotInnings } from '@/domain/control';
import { FALSE_SHOT_INNINGS } from '@/domain/control';
import type { PlayerFilters } from '@/domain/filters';
import { query } from './engine';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';
import { loadPoints } from './points';
import { controlRowsOf, falseShotInningsOf, selectPoints } from '@/domain/pointFilter';

/** A batter's balls faced that have a line, a length and a control reading, grouped by line and length, under every filter. */
export async function loadControlRows(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<ControlRow[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  // From the point file, with no query engine; the SQL below is the fallback and the reference the file is checked against (web/scripts/verify-points.ts).
  const set = await loadPoints(playerId);
  if (set) return controlRowsOf(set, selectPoints(set, filters, ball));
  return loadControlRowsSql(playerId, filters, ball);
}

/** The same rows from the query engine. */
export async function loadControlRowsSql(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<ControlRow[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball);
  where.push('coalesce(wides, 0) = 0', 'ball_line is not null', 'ball_length is not null', 'shot_control is not null');
  const file = DATA_FILES.ballsByBatter;
  return query<ControlRow>([file], `
    select ball_length as length, ball_line as line, count(*)::int as known, count(*) filter (where shot_control = 'in control')::int as "inControl"
    from '${file}' where ${where.join(' and ')} group by 1, 2`, params);
}

/** The latest innings with a control reading on at least some balls, oldest first, with the false shots in each. The minimum is applied by the domain. */
export async function loadFalseShotInnings(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<FalseShotInnings[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const set = await loadPoints(playerId);
  if (set) return falseShotInningsOf(set, selectPoints(set, filters, ball));
  return loadFalseShotInningsSql(playerId, filters, ball);
}

/** The same rows from the query engine. */
export async function loadFalseShotInningsSql(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<FalseShotInnings[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball);
  where.push('coalesce(wides, 0) = 0', 'shot_control is not null');
  const file = DATA_FILES.ballsByBatter;
  const rows = await query<FalseShotInnings>([file], `
    select count(*)::int as known, count(*) filter (where shot_control = 'not in control')::int as "falseShots", strftime(max(start_date), '%Y-%m-%d') as date, any_value(bowling_team) as opponent
    from '${file}' where ${where.join(' and ')} group by match_id, innings order by max(start_date) desc, match_id desc, innings desc limit ${FALSE_SHOT_INNINGS * 4}`, params);
  return rows.reverse();
}
