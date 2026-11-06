import type { PlayerFilters } from '@/domain/filters';
import type { BatInnings, BowlInnings } from '@/domain/records';
import { query } from './engine';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { inningsScope } from './scope';

/** Every innings a batter played under the Format, Competition and Season choices (Super Overs are not in the table), one row each. */
export async function loadBatInnings(playerId: string, filters: PlayerFilters): Promise<BatInnings[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = inningsScope(playerId, filters);
  return query<BatInnings>([DATA_FILES.batInnings, DATA_FILES.matches], `
    select match_id::int as match_id, innings::int as innings, tournament_key, season, strftime(start_date, '%Y-%m-%d') as date, venue, team, opponent,
      runs::int as runs, balls::int as balls, fours::int as fours, sixes::int as sixes, is_out, balls_to_50::int as balls_to_50, balls_to_100::int as balls_to_100, chasing,
      (select case when b.opponent = m.team_1 then m.team_1_id else m.team_2_id end from '${DATA_FILES.matches}' m where m.match_id = b.match_id) as opponent_id
    from '${DATA_FILES.batInnings}' b where ${where.join(' and ')}`, params);
}

/** Every innings a bowler bowled in, under the same choices. */
export async function loadBowlInnings(playerId: string, filters: PlayerFilters): Promise<BowlInnings[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = inningsScope(playerId, filters);
  return query<BowlInnings>([DATA_FILES.bowlInnings, DATA_FILES.matches], `
    select match_id::int as match_id, innings::int as innings, format, tournament_key, season, strftime(start_date, '%Y-%m-%d') as date, venue, team, opponent,
      balls::int as balls, runs::int as runs, wickets::int as wickets, hat_tricks::int as hat_tricks, maidens::int as maidens, dots::int as dots, economy_counts,
      (select case when b.opponent = m.team_1 then m.team_1_id else m.team_2_id end from '${DATA_FILES.matches}' m where m.match_id = b.match_id) as opponent_id
    from '${DATA_FILES.bowlInnings}' b where ${where.join(' and ')}`, params);
}

/** The most runs a batter added with one partner in one partnership, or null when there is none. */
export async function loadBiggestPartnership(playerId: string, filters: PlayerFilters): Promise<number | null> {
  if (!PLAYER_ID.test(playerId)) return null;
  const { where, params } = inningsScope(playerId, filters);
  const rows = await query<{ runs: number | null }>([DATA_FILES.partnerships], `select max(runs)::int as runs from '${DATA_FILES.partnerships}' where ${where.join(' and ')}`, params);
  return rows[0]?.runs ?? null;
}
