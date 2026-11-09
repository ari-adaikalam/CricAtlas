import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import type { ShotMixCell } from '@/domain/shotMix';
import { query } from './engine';
import { BATTER_OUT } from './scope';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

/**
 * A batter's tracked balls by shot label and phase (an overs band in Tests), under every filter: balls faced, runs off the bat, the times the batter was
 * out on the ball, and the control readings. Balls with no shot label are not here. A ball with no phase (a Super Over ball) has a null key.
 */
export async function loadShotMix(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<ShotMixCell[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const key = filters.format === 'TEST' ? `'band' || least(("over" // 20)::int, 4)` : 'phase';
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball);
  where.push('coalesce(wides, 0) = 0', 'shot_played is not null');
  const file = DATA_FILES.ballsByBatter;
  return query<ShotMixCell>([file], `
    select shot_played as shot, ${key} as key, count(*)::int as balls, coalesce(sum(runs_off_bat), 0)::int as runs,
      coalesce(sum(case when ${BATTER_OUT} then 1 else 0 end), 0)::int as outs,
      count(*) filter (where shot_control is not null)::int as "controlKnown", count(*) filter (where shot_control = 'in control')::int as "inControl"
    from '${file}' where ${where.join(' and ')} group by 1, 2`, params);
}
