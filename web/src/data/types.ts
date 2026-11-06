import type { BallFilters } from '@/domain/ballFilters';
import type { ShotTypeCounts, TypeCounts } from '@/domain/bowlerType';
import type { PlayerFilters } from '@/domain/filters';
import { query } from './engine';
import { BOWLER_WICKET } from './pitch';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

/** A batter's balls faced, runs off the bat and dismissals by the bowler's first listed style, under every filter. A bowler with no style has a null style. */
export async function loadTypeCounts(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<TypeCounts[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball);
  where.push('coalesce(wides, 0) = 0');
  const file = DATA_FILES.ballsByBatter;
  return query<TypeCounts>([file], `
    select nullif(trim(split_part("bowling style_bowler", ',', 1)), '') as style, count(*)::int as balls, coalesce(sum(runs_off_bat), 0)::int as runs,
      coalesce(sum(case when ${BOWLER_WICKET} then 1 else 0 end), 0)::int as outs
    from '${file}' where ${where.join(' and ')} group by 1`, params);
}

/** A batter's balls faced and runs off the bat by shot label and the bowler's first style, under every filter. Only balls with a shot label (tracked) are counted. */
export async function loadShotTypeCounts(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<ShotTypeCounts[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball);
  where.push('coalesce(wides, 0) = 0', 'shot_played is not null');
  const file = DATA_FILES.ballsByBatter;
  return query<ShotTypeCounts>([file], `
    select nullif(trim(split_part("bowling style_bowler", ',', 1)), '') as style, shot_played as shot, count(*)::int as balls, coalesce(sum(runs_off_bat), 0)::int as runs
    from '${file}' where ${where.join(' and ')} group by 1, 2`, params);
}
