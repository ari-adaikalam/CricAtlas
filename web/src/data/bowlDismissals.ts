import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import { query } from './engine';
import { BOWLER_WICKET } from './pitch';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

/** The numbers behind a Dismissals tile, for a bowler's wickets or a batter's dismissals. */
export interface DismissalData {
  types: Array<{ type: string; n: number }>;
  shots: Array<{ shot: string | null; n: number }>;
  /** The balls faced and runs scored by each batter the bowler got out, one entry per wicket. */
  wickets: Array<{ balls: number; runs: number }>;
  formats: string[];
  hundredOnly: boolean;
  /** Dismissals at the non-striker's end (run outs), which have no shot of the batter's. Always 0 for a bowler. */
  nonStriker: number;
}
export type BowlDismissals = DismissalData;

/** A bowler's wickets under every filter: how each came, the shot the batter was playing, and the batter's balls and runs at the time. */
export async function loadBowlDismissals(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<BowlDismissals> {
  const empty: BowlDismissals = { types: [], shots: [], wickets: [], formats: [], hundredOnly: false, nonStriker: 0 };
  if (!PLAYER_ID.test(playerId)) return empty;
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  where.push(BOWLER_WICKET);
  const file = DATA_FILES.ballsByBowler;
  const rows = await query<{ type: string; shot: string | null; balls: number | null; runs: number | null; format: string; hundred: boolean }>([file], `
    select wicket_type as type, shot_played as shot, "player out balls faced"::int as balls, "player out runs"::int as runs, format, tournament_key = 'hnd' as hundred
    from '${file}' where ${where.join(' and ')}`, params);
  const count = <K extends string | null>(pick: (r: (typeof rows)[number]) => K): Map<K, number> => rows.reduce((m, r) => m.set(pick(r), (m.get(pick(r)) ?? 0) + 1), new Map<K, number>());
  return {
    types: [...count((r) => r.type)].map(([type, n]) => ({ type: type as string, n })),
    shots: [...count((r) => r.shot)].map(([shot, n]) => ({ shot, n })),
    wickets: rows.filter((r) => r.balls !== null && r.runs !== null).map((r) => ({ balls: Number(r.balls), runs: Number(r.runs) })),
    formats: [...new Set(rows.map((r) => r.format))],
    hundredOnly: rows.length > 0 && rows.every((r) => r.hundred),
    nonStriker: 0,
  };
}
