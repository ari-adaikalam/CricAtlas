import type { PlayerFilters } from '@/domain/filters';
import type { TrophyEdition } from '@/domain/trophies';
import { query } from './engine';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { formatWhere } from './scope';

/**
 * Every edition of a major tournament or league the player was in, oldest first, under the Format and Competition choices. The Season choice is applied by the caller
 * (domain/trophies.ts, inSeason), because a merged edition can span two seasons and is found by any of them.
 */
export async function loadTrophies(playerId: string, filters: PlayerFilters): Promise<TrophyEdition[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const where = ['player_id = ?', formatWhere(filters.format)];
  const params: Array<string | number> = [playerId];
  if (filters.competition) { where.push('tournament_key = ?'); params.push(filters.competition); }
  return query<TrophyEdition>([DATA_FILES.trophies], `
    select tournament_key, tournament_name, season_label, team, seasons, result
    from '${DATA_FILES.trophies}' where ${where.join(' and ')} order by first_date, edition`, params);
}
