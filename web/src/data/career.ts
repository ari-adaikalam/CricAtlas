import type { BatInnings, BowlInnings, FieldCount } from '@/domain/career';
import { query } from './engine';
import { BOWLER_WICKET } from './pitch';
import { DATA_FILES } from './sources';
import { PLAYER_ID } from './player';

export interface CareerDetail { bat: BatInnings[]; field: FieldCount[]; bowl: BowlInnings[] }

const empty = (): CareerDetail => ({ bat: [], field: [], bowl: [] });

/**
 * What the player summary cannot hold, for the profile tables: every innings with its runs and whether the batter was out (for the high score), the
 * catches and stumpings, and every innings bowled with its wickets and runs (for the best figures and the hauls). Each row says which match group it is in.
 * A catch is a caught dismissal credited to a fielder who was not a substitute, and a caught and bowled counts to the bowler. A stumping goes to the fielder.
 */
export async function loadCareerDetail(playerId: string): Promise<CareerDetail> {
  if (!PLAYER_ID.test(playerId)) return empty();
  const [bat, caught, caughtAndBowled, bowl] = await Promise.all([
    query<{ format: string; league: boolean; key: string | null; runs: number; out: boolean }>([DATA_FILES.ballsByBatter, DATA_FILES.dismissalsByBatter], `
      select i.format, i.league, i.key, i.runs, d.match_id is not null as "out"
      from (select match_id, innings, any_value(format) as format, any_value(type) <> 'Intl' as league, any_value(tournament_key) as key, sum(runs_off_bat)::int as runs
            from 'balls_by_batter.parquet' where striker_id = ? and coalesce(wides, 0) = 0 group by match_id, innings) i
      left join (select distinct match_id, innings from 'dismissals_by_batter.parquet' where batter_id = ?) d using (match_id, innings)`, [playerId, playerId]),
    query<{ format: string; league: boolean; key: string | null; catches: number; stumpings: number }>([DATA_FILES.wicketFielders, DATA_FILES.wickets, DATA_FILES.matches], `
      select m.format, m."type" <> 'Intl' as league, m.tournament_key as key,
        count(*) filter (where w.wicket_type = 'caught')::int as catches, count(*) filter (where w.wicket_type = 'stumped')::int as stumpings
      from 'wicket_fielders.parquet' f
      join 'wickets.parquet' w using (match_id, innings, delivery_number, wicket_number)
      join 'matches.parquet' m using (match_id)
      where f.fielder_id = ? and not coalesce(f.substitute, false) group by all`, [playerId]),
    query<{ format: string; league: boolean; key: string | null; n: number }>([DATA_FILES.ballsByBowler], `
      select any_value(format) as format, any_value(type) <> 'Intl' as league, tournament_key as key, count(*)::int as n
      from 'balls_by_bowler.parquet' where bowler_id = ? and wicket_type = 'caught and bowled' group by tournament_key, type, format`, [playerId]),
    query<{ matchId: number; format: string; league: boolean; key: string | null; wickets: number; runs: number; wides: number; noBalls: number }>([DATA_FILES.ballsByBowler], `
      select match_id as "matchId", any_value(format) as format, any_value(type) <> 'Intl' as league, any_value(tournament_key) as key,
        sum(case when ${BOWLER_WICKET} then 1 else 0 end)::int as wickets, sum(runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0))::int as runs,
        count(*) filter (where coalesce(wides, 0) > 0)::int as wides, count(*) filter (where coalesce(noballs, 0) > 0)::int as "noBalls"
      from 'balls_by_bowler.parquet' where bowler_id = ? group by match_id, innings`, [playerId]),
  ]);
  const field: FieldCount[] = caught.map((c) => ({ format: c.format, league: c.league, key: c.key, catches: c.catches, stumpings: c.stumpings }));
  for (const c of caughtAndBowled) field.push({ format: c.format, league: c.league, key: c.key, catches: c.n, stumpings: 0 });
  return { bat, field, bowl: bowl.map((b) => ({ ...b, matchId: Number(b.matchId) })) };
}
