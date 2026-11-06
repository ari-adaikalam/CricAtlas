import type { PlayerFilters } from '@/domain/filters';
import type { StatBat, StatBowl } from '@/domain/fullStats';
import { query } from './engine';
import { PLAYER_ID } from './player';
import { inningsScope } from './scope';
import { DATA_FILES } from './sources';

// The rows Full stats groups. One row for each innings batted or bowled in, with the match context columns (tools/export.py), under the Format, Competition and Season choices.
const CONTEXT = `format, tournament_key, season, strftime(start_date, '%Y-%m-%d') as date, venue, team, opponent, venue_country, venue_continent, home_away,
  toss, result, team_bat_first, team_innings::int as team_innings, match_number::int as match_number, stage_class, stage_name, tournament_kind, filter_section, match_id::int as match_id, innings::int as innings`;

export async function loadStatBat(playerId: string, filters: PlayerFilters): Promise<StatBat[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = inningsScope(playerId, filters);
  return query<StatBat>([DATA_FILES.batInnings], `
    select ${CONTEXT}, runs::int as runs, balls::int as balls, fours::int as fours, sixes::int as sixes, is_out, position::int as position
    from '${DATA_FILES.batInnings}' where ${where.join(' and ')}`, params);
}

export async function loadStatBowl(playerId: string, filters: PlayerFilters): Promise<StatBowl[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = inningsScope(playerId, filters);
  return query<StatBowl>([DATA_FILES.bowlInnings], `
    select ${CONTEXT}, balls::int as balls, runs::int as runs, wickets::int as wickets
    from '${DATA_FILES.bowlInnings}' where ${where.join(' and ')}`, params);
}

export interface FieldingRow { year: number; format: string; type: string; kind: 'catch' | 'caught_and_bowled' | 'stumping' | 'run_out_direct' | 'run_out_shared'; n: number }

/** The catches, caught and bowleds, stumpings and run outs a player was credited with, counted by format and kind. */
export async function loadFielding(playerId: string, filters: PlayerFilters): Promise<FieldingRow[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = inningsScope(playerId, filters);
  return query<FieldingRow>([DATA_FILES.fielding], `
    select year(start_date)::int as year, format, "type", kind, count(*)::int as n from '${DATA_FILES.fielding}' where ${where.join(' and ')} group by 1, 2, 3, 4`, params);
}

/** The matches a player was in, with the date, the opponent and whether the award went to them. Fielding uses it for matches played, awards for the awards. */
export interface PlayedMatch { match_id: number; format: string; type: string; date: string; opponent: string; potm: boolean }
export async function loadPlayedMatches(playerId: string, filters: PlayerFilters): Promise<PlayedMatch[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = inningsScope(playerId, filters);
  return query<PlayedMatch>([DATA_FILES.playerMatches], `
    select match_id::int as match_id, format, "type", strftime(start_date, '%Y-%m-%d') as date, opponent, potm from '${DATA_FILES.playerMatches}' where ${where.join(' and ')}`, params);
}
