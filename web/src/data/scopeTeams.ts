import type { View } from '@/domain/ballFilters';
import type { ScopeTeam } from '@/domain/colours';
import type { PlayerFilters } from '@/domain/filters';
import { query } from './engine';
import { PLAYER_ID } from './player';
import { DATA_FILES } from './sources';
import { scopeWhere } from './scope';

/**
 * The teams a player appeared for under the Format, Competition and Season choices, with the matches for each. Only the scope is used, never the ball filters,
 * so choosing an opponent or a phase cannot change the colour.
 */
export async function loadScopeTeams(playerId: string, filters: PlayerFilters, view: View): Promise<ScopeTeam[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, view);
  const file = view === 'bat' ? DATA_FILES.ballsByBatter : DATA_FILES.ballsByBowler;
  const team = view === 'bat' ? 'batting_team' : 'bowling_team';
  return query<ScopeTeam>([file], `
    select ${team} as team, count(distinct match_id)::int as matches
    from '${file}' where ${where.join(' and ')} and ${team} is not null group by 1 order by 2 desc`, params);
}
