import { DEFAULT_BALL_FILTERS } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import { orderGroup } from '@/domain/bowling';
import type { ReviewGroup } from '@/domain/reviews';
import { query } from './engine';
import { PLAYER_ID } from './player';
import { BOWLER_WICKET } from './pitch';
import { BATTER_OUT, scopeWhere } from './scope';
import { DATA_FILES } from './sources';

// Full stats splits that need the balls: the phases, the bowler types and batter hands, the batting order a bowler bowled to, the shot placement, Super Overs and reviews. Each ball table is
// grouped into one row for each innings and group (as the innings tables are), so the same columns and the same code work out the figures. Super Overs are left out except in their own table.

/** An innings in one group (a phase, a bowler type, ...) of a batter's balls. */
export interface BallBat { match_id: number; innings: number; date: string; season: string; format: string; tournament_key: string | null; key: string; runs: number; balls: number; fours: number; sixes: number; is_out: boolean }
export interface BallBowl { match_id: number; innings: number; date: string; season: string; format: string; tournament_key: string | null; key: string; balls: number; runs: number; wickets: number }

const FOURS = '(runs_off_bat = 4 and not coalesce(non_boundary, false))';
const CONTEXT = `min(strftime(start_date, '%Y-%m-%d')) as date, any_value(season) as season, any_value(format) as format, any_value(tournament_key) as tournament_key`;

export type BatBy = 'phase' | 'style';
export type BowlBy = 'phase' | 'hand' | 'order';

/** The group a ball belongs to. Tests have no phase, so their balls are grouped by overs band. */
const phaseKey = (tests: boolean): string => (tests ? `'band' || least(("over" // 20)::int, 4)` : 'phase');
const keyOf = (by: BatBy | BowlBy, tests: boolean): string => {
  if (by === 'phase') return phaseKey(tests);
  if (by === 'style') return `nullif(trim(split_part("bowling style_bowler", ',', 1)), '')`;
  return `case when "batting style_striker" = 'right-hand bat' then 'right' when "batting style_striker" = 'left-hand bat' then 'left' else null end`;
};

export async function loadBatBalls(playerId: string, filters: PlayerFilters, by: BatBy): Promise<BallBat[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const tests = filters.format === 'TEST';
  const key = keyOf(by, tests);
  const { where, params } = scopeWhere(playerId, filters, 'bat', DEFAULT_BALL_FILTERS);
  const dismissed = scopeWhere(playerId, filters, 'bat', DEFAULT_BALL_FILTERS, 'batter_id');
  where.push('coalesce(wides, 0) = 0', `${key} is not null`);
  dismissed.where.push(`${key} is not null`);
  const [balls, outs] = await Promise.all([
    query<Omit<BallBat, 'is_out'>>([DATA_FILES.ballsByBatter], `
      select match_id::int as match_id, innings::int as innings, ${key} as key, ${CONTEXT}, sum(runs_off_bat)::int as runs, count(*)::int as balls,
        sum(case when ${FOURS} then 1 else 0 end)::int as fours, sum(case when runs_off_bat = 6 then 1 else 0 end)::int as sixes
      from '${DATA_FILES.ballsByBatter}' where ${where.join(' and ')} group by 1, 2, 3`, params),
    query<{ match_id: number; innings: number; key: string }>([DATA_FILES.dismissalsByBatter], `
      select distinct match_id::int as match_id, innings::int as innings, ${key} as key from '${DATA_FILES.dismissalsByBatter}' where ${dismissed.where.join(' and ')}`, dismissed.params),
  ]);
  const out = new Set(outs.map((o) => `${o.match_id}|${o.innings}|${o.key}`));
  return balls.map((b) => ({ ...b, is_out: out.has(`${b.match_id}|${b.innings}|${b.key}`) }));
}

export async function loadBowlBalls(playerId: string, filters: PlayerFilters, by: BowlBy): Promise<BallBowl[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const tests = filters.format === 'TEST';
  const { where, params } = scopeWhere(playerId, filters, 'bowl', DEFAULT_BALL_FILTERS);
  const mine = DATA_FILES.ballsByBowler;
  const wicket = `case when ${BOWLER_WICKET} then 1 else 0 end`;
  if (by === 'order') {
    // The batting order of each innings comes from positions_by_bowler. Positions are grouped as in the Batters tile.
    const rows = await query<BallBowl & { position: number | null }>([mine, DATA_FILES.positions], `
      with b as (select match_id, innings, striker, start_date, season, format, tournament_key, runs_off_bat, wides, noballs, wicket_type, is_legal_delivery from '${mine}' where ${where.join(' and ')}),
      pos as (select match_id, innings, name, position from '${DATA_FILES.positions}')
      select b.match_id::int as match_id, b.innings::int as innings, pos.position::int as position, min(strftime(b.start_date, '%Y-%m-%d')) as date, any_value(b.season) as season, any_value(b.format) as format,
        any_value(b.tournament_key) as tournament_key, count(*) filter (where b.is_legal_delivery)::int as balls,
        coalesce(sum(b.runs_off_bat + coalesce(b.wides, 0) + coalesce(b.noballs, 0)), 0)::int as runs,
        coalesce(sum(case when ${BOWLER_WICKET.replaceAll('wicket_type', 'b.wicket_type')} then 1 else 0 end), 0)::int as wickets
      from b left join pos on pos.match_id = b.match_id and pos.innings = b.innings and pos.name = b.striker
      group by 1, 2, 3`, params);
    const map = new Map<string, BallBowl>();
    for (const r of rows) {
      if (r.position === null || r.position === undefined) continue;
      const key = orderGroup(Number(r.position));
      const id = `${r.match_id}|${r.innings}|${key}`;
      const have = map.get(id);
      if (have) { have.balls += r.balls; have.runs += r.runs; have.wickets += r.wickets; } else map.set(id, { match_id: r.match_id, innings: r.innings, date: r.date, season: r.season, format: r.format, tournament_key: r.tournament_key, key, balls: r.balls, runs: r.runs, wickets: r.wickets });
    }
    return [...map.values()];
  }
  const key = keyOf(by, tests);
  where.push(`${key} is not null`);
  return query<BallBowl>([mine], `
    select match_id::int as match_id, innings::int as innings, ${key} as key, ${CONTEXT}, count(*) filter (where is_legal_delivery)::int as balls,
      sum(runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0))::int as runs, sum(${wicket})::int as wickets
    from '${mine}' where ${where.join(' and ')} group by 1, 2, 3`, params);
}

/** Super Overs: the only table that counts them. One row for each format of the balls batted and bowled. */
export interface SuperBat { format: string; type: string; innings: number; balls: number; runs: number; outs: number; boundaries: number }
export interface SuperBowl { format: string; type: string; innings: number; balls: number; runs: number; wickets: number }
export async function loadSuperBat(playerId: string, filters: PlayerFilters): Promise<SuperBat[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bat');
  where.push('is_super_over', 'coalesce(wides, 0) = 0');
  return query<SuperBat>([DATA_FILES.ballsByBatter], `
    select format, "type", count(distinct match_id::varchar || '|' || innings::varchar)::int as innings, count(*)::int as balls, sum(runs_off_bat)::int as runs,
      sum(case when ${BATTER_OUT} then 1 else 0 end)::int as outs, sum(case when ${FOURS} or runs_off_bat = 6 then 1 else 0 end)::int as boundaries
    from '${DATA_FILES.ballsByBatter}' where ${where.join(' and ')} group by 1, 2`, params);
}
export async function loadSuperBowl(playerId: string, filters: PlayerFilters): Promise<SuperBowl[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, 'bowl');
  where.push('is_super_over');
  return query<SuperBowl>([DATA_FILES.ballsByBowler], `
    select format, "type", count(distinct match_id::varchar || '|' || innings::varchar)::int as innings, count(*) filter (where is_legal_delivery)::int as balls,
      sum(runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0))::int as runs, sum(case when ${BOWLER_WICKET} then 1 else 0 end)::int as wickets
    from '${DATA_FILES.ballsByBowler}' where ${where.join(' and ')} group by 1, 2`, params);
}

/** The reviews on the player's deliveries, by format (same meaning as the Reviews tiles: who asked, and the verdict). */
export interface FormatReviews { format: string; type: string; groups: ReviewGroup[] }
export async function loadReviewsByFormat(playerId: string, filters: PlayerFilters, kind: 'bat' | 'bowl'): Promise<FormatReviews[]> {
  if (!PLAYER_ID.test(playerId)) return [];
  const { where, params } = scopeWhere(playerId, filters, kind, DEFAULT_BALL_FILTERS);
  const balls = kind === 'bat' ? DATA_FILES.ballsByBatter : DATA_FILES.ballsByBowler, reviews = DATA_FILES.reviews;
  const wicket = kind === 'bat' ? BATTER_OUT : `coalesce(${BOWLER_WICKET}, false)`;
  const rows = await query<ReviewGroup & { format: string; type: string }>([balls, reviews], `
    select b.format as format, b."type" as "type", case when r.review_by = b.bowling_team then 'bowling' else 'batting' end as side, r.decision as decision,
      coalesce(r.umpires_call, false) as "umpiresCall", b.wicket as wicket, count(*)::int as n
    from (select match_id, innings, delivery_number, batting_team, bowling_team, format, "type", ${wicket} as wicket from '${balls}' where ${where.join(' and ')}) b
    join '${reviews}' r on r.match_id = b.match_id and r.innings = b.innings and r.delivery_number = b.delivery_number
    where r.review_by = b.bowling_team or r.review_by = b.batting_team
    group by all`, params);
  const map = new Map<string, FormatReviews>();
  for (const r of rows) {
    const id = `${r.format}|${r.type}`;
    const have = map.get(id) ?? { format: r.format, type: r.type, groups: [] };
    have.groups.push({ side: r.side, decision: r.decision, umpiresCall: r.umpiresCall, wicket: r.wicket, n: r.n });
    map.set(id, have);
  }
  return [...map.values()];
}
