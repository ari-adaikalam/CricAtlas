import type { PlayerFilters } from '@/domain/filters';
import type { PlayerMatch } from '@/domain/streaks';
import { query } from './engine';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { inningsScope } from './scope';

/** Every match the player was in under the Format, Competition and Season choices, with the result for the player's team and whether the award went to the player. */
export async function loadPlayerMatches(playerId: string, filters: PlayerFilters): Promise<PlayerMatch[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = inningsScope(playerId, filters);
  return query<PlayerMatch>([DATA_FILES.playerMatches], `
    select match_id::int as match_id, strftime(start_date, '%Y-%m-%d') as date, result, potm
    from '${DATA_FILES.playerMatches}' where ${where.join(' and ')}`, params);
}
