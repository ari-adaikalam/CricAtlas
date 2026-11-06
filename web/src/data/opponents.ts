import type { BallFilters, View } from '@/domain/ballFilters';
import type { OpponentCell } from '@/domain/opponents';
import type { PlayerFilters } from '@/domain/filters';
import { query } from './engine';
import { BOWLER_WICKET } from './pitch';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

/**
 * Every opponent's balls by phase (an overs band in Tests), under every filter including the opponent one, so a chosen opponent leaves only that row.
 * A batter's balls leave out wides and his runs are off the bat. A bowler's balls are the legal ones and his runs are the ones charged to him. An opponent's
 * outs are the bowler's wickets, since run outs are not credited to the bowler. Control counts only the balls that were tracked.
 */
export async function loadOpponentCells(playerId: string, filters: PlayerFilters, ball: BallFilters, view: View): Promise<OpponentCell[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const key = filters.format === 'TEST' ? `'band' || least(("over" // 20)::int, 4)` : 'phase';
  const { where, params } = scopeWhere(playerId, filters, view, ball);
  const bat = view === 'bat';
  const file = bat ? DATA_FILES.ballsByBatter : DATA_FILES.ballsByBowler;
  const [id, name, style] = bat ? ['bowler_id', 'bowler', '"bowling style_bowler"'] : ['striker_id', 'striker', '"batting style_striker"'];
  where.push(`${id} is not null`);
  const counted = bat ? 'coalesce(wides, 0) = 0' : 'is_legal_delivery';
  const runs = bat ? 'runs_off_bat' : 'runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0)';
  return query<OpponentCell>([file], `
    select ${id} as id, any_value(${name}) as name, any_value(${style}) as style, ${key} as key,
      count(*) filter (where ${counted})::int as balls, coalesce(sum(${runs}) filter (where ${bat ? counted : 'true'}), 0)::int as runs,
      coalesce(sum(case when ${BOWLER_WICKET} then 1 else 0 end), 0)::int as outs,
      count(*) filter (where ${counted} and runs_off_bat = 0)::int as dots,
      count(*) filter (where ${counted} and shot_control is not null)::int as "controlKnown",
      count(*) filter (where ${counted} and shot_control = 'in control')::int as "inControl"
    from '${file}' where ${where.join(' and ')} group by ${id}, ${key}`, params);
}
