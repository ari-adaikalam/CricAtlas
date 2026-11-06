import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import { FORM_INNINGS, type InningsLine } from '@/domain/form';
import { query } from './engine';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

/**
 * A batter's latest innings under every filter, oldest first. An innings is the balls the batter faced in it that pass the filters, and it
 * ended in a dismissal if the dismissals file has one for the batter in that innings that passes them too (a run out at the non-striker's end counts).
 */
export async function loadInnings(playerId: string, filters: PlayerFilters, ball: BallFilters, limit = FORM_INNINGS): Promise<InningsLine[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball);
  where.push('coalesce(wides, 0) = 0');
  const out = scopeWhere(playerId, filters, 'bat', ball, 'batter_id');
  const rows = await query<{ matchId: number; innings: number; runs: number; balls: number; out: boolean; date: string; opponent: string }>(
    [DATA_FILES.ballsByBatter, DATA_FILES.dismissalsByBatter], `
    select i.match_id as "matchId", i.innings::int as innings, i.runs, i.balls, o.match_id is not null as "out", strftime(i.day, '%Y-%m-%d') as date, i.opponent
    from (select match_id, innings, sum(runs_off_bat)::int as runs, count(*)::int as balls, max(start_date) as day, any_value(bowling_team) as opponent
          from 'balls_by_batter.parquet' where ${where.join(' and ')} group by match_id, innings) i
    left join (select distinct match_id, innings from 'dismissals_by_batter.parquet' where ${out.where.join(' and ')}) o using (match_id, innings)
    order by i.day desc, i.match_id desc, i.innings desc limit ${Math.max(1, Math.min(60, Math.floor(limit)))}`, [...params, ...out.params]);
  return rows.reverse().map((r) => ({ ...r, matchId: Number(r.matchId) }));
}
