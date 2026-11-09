import type { PlayerFilters } from '@/domain/filters';
import type { BatPartnership, BowlPartnership } from '@/domain/partnerships';
import { query } from './engine';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';
import { inningsScope } from './scope';

/**
 * Every batting partnership of the player under the Format, Competition and Season choices, the biggest first: the most runs, then the fewest balls, then the latest. A partnership is
 * a pair of batters between two wickets (or between a wicket and a batter retiring), and its runs are every run the team scored while they were in.
 */
export async function loadBatPartnerships(playerId: string, filters: PlayerFilters): Promise<BatPartnership[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = inningsScope(playerId, filters);
  return query<BatPartnership>([DATA_FILES.partnerships, DATA_FILES.players, DATA_FILES.matches], `
    select p.match_id::int as match_id, p.innings::int as innings, p.wicket_number::int as wicket_number, pl.name as partner, strftime(p.start_date, '%Y-%m-%d') as date, p.venue, p.opponent,
      p.runs::int as runs, p.balls::int as balls, p.mine_runs::int as mine_runs, p.partner_runs::int as partner_runs, not coalesce(p.ended, false) as unbroken,
      (select case when p.opponent = m.team_1 then m.team_1_id else m.team_2_id end from '${DATA_FILES.matches}' m where m.match_id = p.match_id) as opponent_id
    from '${DATA_FILES.partnerships}' p join '${DATA_FILES.players}' pl on pl.player_id = p.partner_id
    where ${where.map((w) => `p.${w}`).join(' and ')}
    order by p.runs desc, p.balls asc, p.start_date desc, p.match_id desc`, params);
}

/**
 * Every bowling partnership of the player, the best first: the most wickets, then the most wickets per over (the fewest balls), then the latest. A partnership is two bowlers bowling in
 * turn in one innings for long enough to count (10 overs in Tests, 8 in ODIs, 4 in T20, 20 balls in The Hundred), worked out when the data is built.
 */
export async function loadBowlPartnerships(playerId: string, filters: PlayerFilters): Promise<BowlPartnership[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = inningsScope(playerId, filters);
  return query<BowlPartnership>([DATA_FILES.tandems, DATA_FILES.players, DATA_FILES.matches], `
    select p.match_id::int as match_id, p.innings::int as innings, pl.name as partner, strftime(p.start_date, '%Y-%m-%d') as date, p.venue, p.opponent, p.balls::int as balls, p.runs::int as runs,
      p.wickets::int as wickets, p.mine_wickets::int as mine_wickets, p.partner_wickets::int as partner_wickets, p.tournament_key = 'hnd' as hundred,
      (select case when p.opponent = m.team_1 then m.team_1_id else m.team_2_id end from '${DATA_FILES.matches}' m where m.match_id = p.match_id) as opponent_id
    from '${DATA_FILES.tandems}' p join '${DATA_FILES.players}' pl on pl.player_id = p.partner_id
    where ${where.map((w) => `p.${w}`).join(' and ')}
    order by p.wickets desc, p.balls asc, p.start_date desc, p.match_id desc`, params);
}
