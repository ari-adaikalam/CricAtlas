import type { PlayerFilters } from '@/domain/filters';
import type { PaceFact, PaceSide } from '@/domain/milestones';
import { query } from './engine';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { formatWhere } from './scope';

/**
 * A player's landmarks and the five quickest to each, in the page's Format and Competition (Season does not apply). The rank is among players of the same gender,
 * by fewest innings, then balls, then the earlier date, worked out here from one small table of every player's first innings at or past each landmark.
 */
export async function loadPace(playerId: string, filters: PlayerFilters, side: PaceSide): Promise<PaceFact[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const file = DATA_FILES.milestonePace;
  return query<PaceFact>([DATA_FILES.milestonePace, DATA_FILES.players], `
    with p as (
      select landmark, player_id, innings_n, balls, start_date from '${file}'
      where scope_format = ? and tournament_key = ? and side = ? and gender = (select any_value(gender) from '${file}' where player_id = ?)),
    r as (select *, (rank() over (partition by landmark order by innings_n, balls, start_date))::int as rank from p)
    select r.landmark::int as landmark, r.player_id, pl.name, r.innings_n::int as innings_n, r.rank, strftime(r.start_date, '%Y-%m-%d') as date, pl."first international year"::int as first_year
    from r join '${DATA_FILES.players}' pl on pl.player_id = r.player_id
    where r.rank <= 5 or r.player_id = ?`, [filters.format, filters.competition ?? '', side, playerId, playerId]);
}

/** The matches in the scope where the player was named Player of the match, with how many matches the player had played in the scope by then. Read from the player's own match list. */
export async function loadAwardMatches(playerId: string, filters: PlayerFilters): Promise<Array<{ date: string; matchNo: number }>> {
  if (!PLAYER_ID.test(playerId)) return [];
  const where = [formatWhere(filters.format)];
  const params: Array<string | number> = [playerId];
  if (filters.competition) { where.push('tournament_key = ?'); params.push(filters.competition); }
  return query<{ date: string; matchNo: number }>([DATA_FILES.playerMatches], `
    with mine as (
      select match_id, start_date, potm, (row_number() over (order by start_date, match_id))::int as no
      from '${DATA_FILES.playerMatches}' where player_id = ? and ${where.join(' and ')})
    select strftime(start_date, '%Y-%m-%d') as date, no as "matchNo" from mine where potm order by start_date, match_id`, params);
}
