import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import { FORM_INNINGS, type BowlInningsLine } from '@/domain/form';
import { query } from './engine';
import { BOWLER_WICKET } from './pitch';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

/**
 * A bowler's latest innings under every filter, oldest first. An innings is the deliveries the bowler bowled in it that pass the filters. Runs are the
 * ones charged to the bowler (off the bat, wides and no-balls), balls are the legal deliveries, and an innings with no legal ball is left out.
 */
export async function loadBowlInnings(playerId: string, filters: PlayerFilters, ball: BallFilters, limit = FORM_INNINGS): Promise<BowlInningsLine[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  const file = DATA_FILES.ballsByBowler;
  const rows = await query<{ matchId: number; innings: number; runs: number; balls: number; wickets: number; date: string; opponent: string }>([file], `
    select match_id as "matchId", innings::int as innings,
      sum(runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0))::int as runs, (count(*) filter (where is_legal_delivery))::int as balls,
      sum(case when ${BOWLER_WICKET} then 1 else 0 end)::int as wickets, strftime(max(start_date), '%Y-%m-%d') as date, any_value(batting_team) as opponent
    from '${file}' where ${where.join(' and ')} group by match_id, innings
    having count(*) filter (where is_legal_delivery) > 0
    order by max(start_date) desc, match_id desc, innings desc limit ${Math.max(1, Math.min(60, Math.floor(limit)))}`, params);
  return rows.reverse().map((r) => ({ ...r, matchId: Number(r.matchId) }));
}
