import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import { PROGRESSION_SPAN_MAX, type ProgressionBall } from '@/domain/progression';
import { query } from './engine';
import { BOWLER_WICKET } from './pitch';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

export interface BowlProgression { balls: ProgressionBall[]; formats: string[]; hundredOnly: boolean }

/**
 * Every legal ball a bowler bowled in the first balls of an innings (up to the longest span, 150), under every filter, with its number in the bowler's own spell and the runs charged to
 * the bowler up to and including it (wides and no-balls bowled before it count). A ball with no filter match is not in the spell, so the filters narrow the spell itself.
 */
export async function loadBowlProgression(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<BowlProgression> {
  const empty: BowlProgression = { balls: [], formats: [], hundredOnly: false };
  if (!PLAYER_ID.test(playerId)) return empty;
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  const file = DATA_FILES.ballsByBowler;
  const rows = await query<{ innings: string; ball: number; runs: number; wicket: boolean; format: string; hundred: boolean }>([file], `
    select innings, ball, runs, wicket, format, hundred from (
      select match_id::varchar || '-' || innings::varchar as innings,
        sum(case when is_legal_delivery then 1 else 0 end) over w as ball,
        sum(runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0)) over w as runs,
        ${BOWLER_WICKET} as wicket, is_legal_delivery as legal, format, tournament_key = 'hnd' as hundred
      from '${file}' where ${where.join(' and ')}
      window w as (partition by match_id, innings order by delivery_number)
    ) where legal and ball <= ${PROGRESSION_SPAN_MAX}`, params);
  return {
    balls: rows.map((r) => ({ innings: r.innings, ball: Number(r.ball), runs: Number(r.runs), wicket: !!r.wicket })),
    formats: [...new Set(rows.map((r) => r.format))],
    hundredOnly: rows.length > 0 && rows.every((r) => r.hundred),
  };
}
