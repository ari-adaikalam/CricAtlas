import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import { query } from './engine';
import type { DismissalData } from './bowlDismissals';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { loadPoints } from './points';
import { dismissalMapOf, selectPoints } from '@/domain/pointFilter';
import { scopeWhere } from './scope';

/**
 * A batter's dismissals under every filter, from the dismissals file (a run out at the non-striker's end is in it). Each has how it came, the batter's balls and
 * runs at the time, and the shot on the ball when the batter was on strike. A dismissal at the non-striker's end has no shot of the batter's and is counted apart.
 */
export async function loadBatDismissals(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<DismissalData> {
  const empty: DismissalData = { types: [], shots: [], wickets: [], formats: [], hundredOnly: false, nonStriker: 0 };
  if (!PLAYER_ID.test(playerId)) return empty;
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball, 'batter_id');
  const file = DATA_FILES.dismissalsByBatter;
  const rows = await query<{ type: string; shot: string | null; strike: boolean; balls: number | null; runs: number | null; format: string; hundred: boolean }>([file], `
    select wicket_type as type, shot_played as shot, coalesce(on_strike, true) as strike, "player out balls faced"::int as balls, "player out runs"::int as runs, format, tournament_key = 'hnd' as hundred
    from '${file}' where ${where.join(' and ')}`, params);
  const struck = rows.filter((r) => r.strike);
  const tally = <K extends string | null>(list: typeof rows, pick: (r: (typeof rows)[number]) => K): Array<[K, number]> => [...list.reduce((m, r) => m.set(pick(r), (m.get(pick(r)) ?? 0) + 1), new Map<K, number>())];
  return {
    types: tally(rows, (r) => r.type).map(([type, n]) => ({ type: type as string, n })),
    shots: tally(struck, (r) => r.shot).map(([shot, n]) => ({ shot, n })),
    wickets: rows.filter((r) => r.balls !== null && r.runs !== null).map((r) => ({ balls: Number(r.balls), runs: Number(r.runs) })),
    formats: [...new Set(rows.map((r) => r.format))],
    hundredOnly: rows.length > 0 && rows.every((r) => r.hundred),
    nonStriker: rows.length - struck.length,
  };
}

/**
 * A batter's dismissals with the line and length of the delivery that got them out, grouped, under every filter, and how many dismissals there were in all.
 * A run out at the non-striker's end is on a delivery to another batter, but its line and length are the ball that was bowled, so it is counted too.
 */
export async function loadDismissalMap(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<{ rows: Array<{ length: string; line: string; outs: number }>; all: number }> {
  if (!PLAYER_ID.test(playerId)) return { rows: [], all: 0 };
  // From the point file, with no query engine; the SQL below is the fallback and the reference the file is checked against (web/scripts/verify-points.ts).
  const set = await loadPoints(playerId);
  if (set) return dismissalMapOf(set, selectPoints(set, filters, ball));
  return loadDismissalMapSql(playerId, filters, ball);
}

/** The same rows from the query engine. */
export async function loadDismissalMapSql(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<{ rows: Array<{ length: string; line: string; outs: number }>; all: number }> {
  if (!PLAYER_ID.test(playerId)) return { rows: [], all: 0 };
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball, 'batter_id');
  const file = DATA_FILES.dismissalsByBatter;
  const [rows, total] = await Promise.all([
    query<{ length: string; line: string; outs: number }>([file], `select ball_length as length, ball_line as line, count(*)::int as outs from '${file}' where ${where.join(' and ')} and ball_length is not null and ball_line is not null group by 1, 2`, params),
    query<{ n: number }>([file], `select count(*)::int as n from '${file}' where ${where.join(' and ')}`, params),
  ]);
  return { rows, all: total[0]?.n ?? 0 };
}
