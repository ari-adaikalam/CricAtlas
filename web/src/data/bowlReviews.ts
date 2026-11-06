import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import type { ReviewGroup } from '@/domain/reviews';
import { query } from './engine';
import { BOWLER_WICKET } from './pitch';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { scopeWhere } from './scope';

/**
 * The reviews on a bowler's deliveries under every filter, grouped by who asked (the bowler's side or the batting side), the decision, whether it was lost on the umpire's
 * call, and whether the ball was a wicket for the bowler. A review is on the delivery it is attached to, so the filters pick it by the ball. Matches with no review
 * records have none, which is the same as no reviews, so the tile says so.
 */
export async function loadBowlReviews(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<ReviewGroup[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bowl', ball);
  const balls = DATA_FILES.ballsByBowler, reviews = DATA_FILES.reviews;
  return query<ReviewGroup>([balls, reviews], `
    select case when r.review_by = b.bowling_team then 'bowling' else 'batting' end as side, r.decision as decision, coalesce(r.umpires_call, false) as "umpiresCall",
      b.wicket as wicket, count(*)::int as n
    from (select match_id, innings, delivery_number, batting_team, bowling_team, coalesce(${BOWLER_WICKET}, false) as wicket
          from '${balls}' where ${where.join(' and ')}) b
    join '${reviews}' r on r.match_id = b.match_id and r.innings = b.innings and r.delivery_number = b.delivery_number
    where r.review_by = b.bowling_team or r.review_by = b.batting_team
    group by all`, params);
}
