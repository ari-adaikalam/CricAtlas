import type { SummaryRow } from '@/domain/batting';
import { query } from './engine';
import { DATA_FILES } from './sources';

export interface Player {
  player_id: string;
  name: string;
  'full name': string | null;
  gender: string | null;
  country: string | null;
  'batting style': string | null;
  'bowling style': string | null;
  'playing role': string | null;
  'first international year': number | null;
  'last international year': number | null;
  'image url': string | null;
}

/** Player ids are 8 hex characters. Anything else is rejected before it reaches a query. */
export const PLAYER_ID = /^[0-9a-f]{8}$/;

export async function loadPlayer(playerId: string): Promise<Player | null> {
  if (!PLAYER_ID.test(playerId)) return null;
  const rows = await query<Player>([DATA_FILES.players], 'select player_id, name, "full name", gender, country, "batting style", "bowling style", "playing role", "first international year", "last international year", "image url" from \'players.parquet\' where player_id = ?', [playerId]);
  return rows[0] ?? null;
}

export async function loadSummary(playerId: string): Promise<SummaryRow[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  return query<SummaryRow>([DATA_FILES.summary], "select * from 'player_summary.parquet' where player_id = ? order by format, tournament_key, season", [playerId]);
}
