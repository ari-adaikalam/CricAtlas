import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import type { PhaseCounts } from '@/domain/phases';
import { query } from './engine';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

/**
 * A batter's balls by phase, under every filter (the Phase filter too, so a chosen phase leaves one column). Tests have no phase, so their
 * balls are grouped by overs band. A ball with no phase outside Tests is a Super Over ball and is left out, since a Super Over has no phases.
 */
export async function loadPhases(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<PhaseCounts[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const key = filters.format === 'TEST' ? `'band' || least(("over" // 20)::int, 4)` : 'phase';
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball);
  where.push('coalesce(wides, 0) = 0', `${key} is not null`);
  const dismissed = scopeWhere(playerId, filters, 'bat', ball, 'batter_id');
  dismissed.where.push(`${key} is not null`);
  const [balls, outs] = await Promise.all([
    query<Omit<PhaseCounts, 'dismissals'>>([DATA_FILES.ballsByBatter], `
      select ${key} as key, count(*)::int as balls, sum(runs_off_bat)::int as runs,
        sum(case when runs_off_bat = 0 then 1 else 0 end)::int as dots,
        sum(case when (runs_off_bat = 4 and not coalesce(non_boundary, false)) or runs_off_bat = 6 then 1 else 0 end)::int as boundaries,
        sum(case when runs_off_bat = 1 then 1 else 0 end)::int as ones, sum(case when runs_off_bat = 2 then 1 else 0 end)::int as twos,
        sum(case when runs_off_bat = 3 then 1 else 0 end)::int as threes, sum(case when runs_off_bat = 4 then 1 else 0 end)::int as fours,
        sum(case when runs_off_bat = 6 then 1 else 0 end)::int as sixes
      from 'balls_by_batter.parquet' where ${where.join(' and ')} group by 1`, params),
    query<{ key: string; n: number }>([DATA_FILES.dismissalsByBatter], `select ${key} as key, count(*)::int as n from 'dismissals_by_batter.parquet' where ${dismissed.where.join(' and ')} group by 1`, dismissed.params),
  ]);
  return balls.map((b) => ({ ...b, dismissals: outs.find((o) => o.key === b.key)?.n ?? 0 }));
}
