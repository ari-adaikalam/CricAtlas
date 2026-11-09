import type { BallFilters } from '@/domain/ballFilters';
import type { BowlSourceCounts, LengthCount } from '@/domain/bowling';
import type { PlayerFilters } from '@/domain/filters';
import { query } from './engine';
import { BOWLER_WICKET } from './pitch';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

/**
 * A bowler's balls by phase, with the runs by kind of ball for the Runs conceded tile, under every filter (the Phase filter too, so a chosen phase leaves one column). Tests have no phase, so their balls are
 * grouped by overs band. Runs conceded and dots are counted as the Key numbers count them. A ball with no phase outside Tests is a Super Over ball and is left out.
 */
export async function loadBowlPhases(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<BowlSourceCounts[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const key = filters.format === 'TEST' ? `'band' || least(("over" // 20)::int, 4)` : 'phase';
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  where.push(`${key} is not null`);
  const file = DATA_FILES.ballsByBowler;
  return query<BowlSourceCounts>([file], `
    select ${key} as key, count(*) filter (where is_legal_delivery)::int as balls,
      coalesce(sum(runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0)), 0)::int as conceded,
      coalesce(sum(case when ${BOWLER_WICKET} then 1 else 0 end), 0)::int as wickets,
      count(*) filter (where is_legal_delivery and runs_off_bat = 0)::int as dots,
      count(*) filter (where is_legal_delivery and ((runs_off_bat = 4 and not coalesce(non_boundary, false)) or runs_off_bat = 6))::int as boundaries,
      count(*) filter (where runs_off_bat = 1)::int as ones, count(*) filter (where runs_off_bat = 2)::int as twos, count(*) filter (where runs_off_bat = 3)::int as threes,
      count(*) filter (where runs_off_bat = 4)::int as fours, count(*) filter (where runs_off_bat = 6)::int as sixes,
      coalesce(sum(coalesce(wides, 0) + coalesce(noballs, 0)), 0)::int as extras
    from '${file}' where ${where.join(' and ')} group by 1`, params);
}

/** A bowler's legal balls by phase and tracked length (the six tracked lengths), under every filter. Balls with no length are not counted. */
export async function loadLengthByPhase(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<{ rows: LengthCount[]; bowled: number }> {
  if (!PLAYER_ID.test(playerId)) return { rows: [], bowled: 0 };
  const key = filters.format === 'TEST' ? `'band' || least(("over" // 20)::int, 4)` : 'phase';
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  where.push(`${key} is not null`, 'is_legal_delivery');
  const file = DATA_FILES.ballsByBowler;
  const w = where.join(' and ');
  const [rows, total] = await Promise.all([
    query<LengthCount>([file], `select ${key} as key, ball_length as length, count(*)::int as n from '${file}' where ${w} and ball_length is not null group by 1, 2`, params),
    query<{ bowled: number }>([file], `select count(*)::int as bowled from '${file}' where ${w}`, params),
  ]);
  return { rows, bowled: total[0]?.bowled ?? 0 };
}
