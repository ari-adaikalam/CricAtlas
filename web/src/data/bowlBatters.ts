import type { BallFilters } from '@/domain/ballFilters';
import { orderGroup, type SplitCounts } from '@/domain/bowling';
import type { PlayerFilters } from '@/domain/filters';
import { query } from './engine';
import { BOWLER_WICKET } from './pitch';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

export interface BowlBatters { hand: SplitCounts[]; order: SplitCounts[] }

/**
 * A bowler's legal balls against right and left handers and against each part of the batting order, under every filter. A batter's position is the order
 * batters first appear in the innings, as striker or non-striker, among their team's batters (Ari, 2026-10-18). Two batters who first appear on the same ball
 * are the openers, and the striker is first.
 */
export async function loadBowlBatters(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<BowlBatters> {
  const empty: BowlBatters = { hand: [], order: [] };
  if (!PLAYER_ID.test(playerId)) return empty;
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  const mine = DATA_FILES.ballsByBowler, positions = DATA_FILES.positions;
  // The batting order of each innings the bowler bowled in comes from positions_by_bowler (worked out when the data is built), so no whole-match file is read.
  const rows = await query<{ hand: string; position: number; balls: number; conceded: number; wickets: number; dots: number }>([mine, positions], `
    with b as (select match_id, innings, striker, "batting style_striker" as style, runs_off_bat, wides, noballs, wicket_type, is_legal_delivery from '${mine}' where ${where.join(' and ')}),
    pos as (select match_id, innings, name, position from '${positions}')
    select case when style = 'right-hand bat' then 'right' when style = 'left-hand bat' then 'left' else 'unknown' end as hand, pos.position::int as position,
      count(*) filter (where is_legal_delivery)::int as balls, coalesce(sum(runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0)), 0)::int as conceded,
      coalesce(sum(case when ${BOWLER_WICKET.replaceAll('wicket_type', 'b.wicket_type')} then 1 else 0 end), 0)::int as wickets,
      count(*) filter (where is_legal_delivery and runs_off_bat = 0)::int as dots
    from b left join pos on pos.match_id = b.match_id and pos.innings = b.innings and pos.name = b.striker
    group by 1, 2`, params);
  const add = (map: Map<string, SplitCounts>, key: string, r: (typeof rows)[number]) => {
    const t = map.get(key) ?? { key, balls: 0, conceded: 0, wickets: 0, dots: 0 };
    t.balls += r.balls; t.conceded += r.conceded; t.wickets += r.wickets; t.dots += r.dots;
    map.set(key, t);
  };
  const hand = new Map<string, SplitCounts>(), order = new Map<string, SplitCounts>();
  for (const r of rows) { add(hand, r.hand, r); if (r.position !== null && r.position !== undefined) add(order, orderGroup(Number(r.position)), r); }
  return { hand: [...hand.values()], order: [...order.values()] };
}
