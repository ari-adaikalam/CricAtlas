import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import type { BowlYearCounts } from '@/domain/seasons';
import { query } from './engine';
import { BOWLER_WICKET } from './pitch';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

/** A bowler's wickets, runs conceded, legal balls and innings in each calendar year of the match date, under every filter. */
export async function loadBowlSeasons(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<BowlYearCounts[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  const file = DATA_FILES.ballsByBowler;
  return query<BowlYearCounts>([file], `
    select extract(year from start_date)::int as year, coalesce(sum(case when ${BOWLER_WICKET} then 1 else 0 end), 0)::int as wickets,
      coalesce(sum(runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0)), 0)::int as conceded,
      (count(*) filter (where is_legal_delivery))::int as balls, count(distinct (match_id, innings))::int as innings
    from '${file}' where ${where.join(' and ')} group by 1 having count(*) filter (where is_legal_delivery) > 0 order by 1`, params);
}
