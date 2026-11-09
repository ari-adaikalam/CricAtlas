import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import { PROGRESSION_SPAN_MAX, type ProgressionBall } from '@/domain/progression';
import { query } from './engine';
import { BATTER_OUT } from './scope';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

export interface BatProgression { balls: ProgressionBall[]; formats: string[]; hundredOnly: boolean; innings: number }

/**
 * Every ball a batter faced in the first balls of an innings (up to the longest span, 150), under every filter, with its number among the balls the batter faced
 * (a wide is not a ball faced) and the runs off the bat up to and including it. The filters narrow the innings itself, so a Phase filter renumbers the balls.
 */
export async function loadBatProgression(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<BatProgression> {
  const empty: BatProgression = { balls: [], formats: [], hundredOnly: false, innings: 0 };
  if (!PLAYER_ID.test(playerId)) return empty;
  const { where, params } = scopeWhere(playerId, filters, 'bat', ball);
  where.push('coalesce(wides, 0) = 0');
  const file = DATA_FILES.ballsByBatter;
  const rows = await query<{ innings: string; ball: number; runs: number; wicket: boolean; format: string; hundred: boolean }>([file], `
    select innings, ball, runs, wicket, format, hundred from (
      select match_id::varchar || '-' || innings::varchar as innings, row_number() over w as ball, sum(runs_off_bat) over w as runs,
        ${BATTER_OUT} as wicket, format, tournament_key = 'hnd' as hundred
      from '${file}' where ${where.join(' and ')}
      window w as (partition by match_id, innings order by delivery_number)
    ) where ball <= ${PROGRESSION_SPAN_MAX}`, params);
  return {
    balls: rows.map((r) => ({ innings: r.innings, ball: Number(r.ball), runs: Number(r.runs), wicket: !!r.wicket })),
    formats: [...new Set(rows.map((r) => r.format))],
    hundredOnly: rows.length > 0 && rows.every((r) => r.hundred),
    innings: new Set(rows.map((r) => r.innings)).size,
  };
}
