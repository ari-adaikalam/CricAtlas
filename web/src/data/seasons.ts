import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import type { YearCounts } from '@/domain/seasons';
import { query } from './engine';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

/** A batter's runs, balls, innings and dismissals in each calendar year of the match date, under every filter. */
export async function loadSeasons(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<YearCounts[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball);
  where.push('coalesce(wides, 0) = 0');
  const out = scopeWhere(playerId, filters, 'bat', ball, 'batter_id');
  const [balls, outs] = await Promise.all([
    query<{ year: number; runs: number; balls: number; innings: number }>([DATA_FILES.ballsByBatter], `
      select extract(year from start_date)::int as year, sum(runs_off_bat)::int as runs, count(*)::int as balls, count(distinct (match_id, innings))::int as innings
      from 'balls_by_batter.parquet' where ${where.join(' and ')} group by 1 order by 1`, params),
    query<{ year: number; n: number }>([DATA_FILES.dismissalsByBatter], `
      select extract(year from start_date)::int as year, count(*)::int as n from 'dismissals_by_batter.parquet' where ${out.where.join(' and ')} group by 1`, out.params),
  ]);
  return balls.map((b) => ({ ...b, dismissals: outs.find((o) => o.year === b.year)?.n ?? 0 }));
}
