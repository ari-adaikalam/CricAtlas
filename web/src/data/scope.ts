import { PACE_STYLES, SPIN_STYLES, TYPE_LABELS } from '@/domain/bowlerType';
import { OPPONENT_ID, type BallFilters, type Combo, type View } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import { query } from './engine';
import { DATA_FILES } from './sources';

// Ball queries mirror the summary rows. A league is a match whose type is not Intl, and a T20I is a T20 match that is.
const FORMAT_WHERE: Record<PlayerFilters['format'], string> = {
  TEST: "format = 'TEST'",
  ODI: "format = 'ODI'",
  T20I: "format = 'T20' and type = 'Intl'",
  T20S: "format = 'T20'",
  LEAGUE: "type <> 'Intl'",
  INTERNATIONAL: "type = 'Intl'",
};

// Every text below is fixed. Nothing is built from the browser's input except numbers that were checked against the option lists.
const PHASE_WHERE: Record<string, string> = { powerplay: "phase = 'powerplay'", middle: "phase = 'middle'", death: "phase = 'death'", rest: "phase = 'rest'" };
const WICKETS_WHERE: Record<string, string> = { low: 'team_wickets_fallen <= 2', mid: 'team_wickets_fallen between 3 and 5', high: 'team_wickets_fallen >= 6' };

/** The batter was dismissed on this ball. Retirements are not dismissals. */
/** The batter was caught (caught or caught and bowled), which the wagon wheel draws in the air. */
export const BATTER_CAUGHT = "coalesce(player_dismissed = striker and wicket_type in ('caught', 'caught and bowled'), false)";
export const BATTER_OUT = "coalesce(player_dismissed = striker and wicket_type not in ('retired hurt', 'retired not out'), false)";

const teamColumn = (view: View): string => (view === 'bat' ? 'batting_team_id' : 'bowling_team_id');
const playerColumn = (view: View): string => (view === 'bat' ? 'striker_id' : 'bowler_id');
/** Balls faced leave wides out. Balls bowled are the legal deliveries. */
const ballCondition = (view: View): string => (view === 'bat' ? 'coalesce(wides, 0) = 0' : 'is_legal_delivery');

/**
 * The conditions for the Batter hand, the Bowler type and the opponent. The opponent is a player id that passed OPPONENT_ID, so it is safe to write into the text.
 * A batter's balls narrow to one bowler, a bowler's to one batter.
 */
export function sliceWhere(f: BallFilters, view: View): string[] {
  const where: string[] = [];
  if (view === 'bowl' && f.hand === 'right') where.push("\"batting style_striker\" = 'right-hand bat'");
  if (view === 'bowl' && f.hand === 'left') where.push("\"batting style_striker\" = 'left-hand bat'");
  if (view === 'bat') {
    // The bowler's first listed style. Every style written into the text comes from the fixed lists in bowlerType.ts.
    const first = `split_part("bowling style_bowler", ',', 1)`;
    const list = (styles: readonly string[]): string => styles.map((x) => `'${x}'`).join(', ');
    if (f.type === 'pace') where.push(`${first} in (${list(PACE_STYLES)})`);
    else if (f.type === 'spin') where.push(`${first} in (${list(SPIN_STYLES)})`);
    else if (f.type.startsWith('s:') && TYPE_LABELS.includes(f.type.slice(2))) where.push(`${first} = '${f.type.slice(2)}'`);
  }
  if (OPPONENT_ID.test(f.opponent)) where.push(`${view === 'bat' ? 'bowler_id' : 'striker_id'} = '${f.opponent}'`);
  return where;
}

/** The conditions for every ball filter: the opponent and hand, then Phase, Super Overs, Innings, Wickets down and Result. */
export function ballWhere(f: BallFilters, view: View, test: boolean): string[] {
  const where: string[] = sliceWhere(f, view);
  const band = /^band([0-4])$/.exec(f.phase);
  if (test && band) { const i = Number(band[1]); where.push(`"over" >= ${i * 20}`); if (i < 4) where.push(`"over" < ${(i + 1) * 20}`); }
  else if (!test && PHASE_WHERE[f.phase]) where.push(PHASE_WHERE[f.phase]!);
  if (!test) { if (f.superOvers === 'excluded') where.push('not is_super_over'); if (f.superOvers === 'only') where.push('is_super_over'); }
  const innings = /^[1-4]$/.test(f.innings) ? Number(f.innings) : null;
  if (innings !== null) where.push(`innings = ${innings}`);
  if (WICKETS_WHERE[f.wickets]) where.push(WICKETS_WHERE[f.wickets]!);
  const team = teamColumn(view);
  if (f.result === 'won') where.push(`match_winner_id = ${team}`);
  if (f.result === 'lost') where.push(`match_winner_id is not null and match_winner_id <> ${team}`);
  if (f.result === 'draw') where.push("match_outcome = 'draw'");
  return where;
}

interface Scope { where: string[]; params: Array<string | number> }

/** The conditions and parameters for a player's balls under the Format, Competition and Season choices, and the ball filters when given. */
export function scopeWhere(playerId: string, filters: PlayerFilters, view: View = 'bat', ball?: BallFilters, column: string = playerColumn(view)): Scope {
  const where = [`${column} = ?`, FORMAT_WHERE[filters.format]];
  const params: Array<string | number> = [playerId];
  if (filters.competition) { where.push('tournament_key = ?'); params.push(filters.competition); }
  if (filters.season) { where.push('season = ?'); params.push(filters.season); }
  if (ball) where.push(...ballWhere(ball, view, filters.format === 'TEST'));
  return { where, params };
}

/** The condition for a Format choice, for any table that has `format` and `type` columns (the ball files, the matches file and the Records tables). */
export const formatWhere = (format: PlayerFilters['format']): string => FORMAT_WHERE[format];

/** The conditions for a table with one row for each innings (the Records tables): the same Format, Competition and Season as the ball files, on the player column. */
export function inningsScope(playerId: string, filters: PlayerFilters): Scope {
  const where = ['player_id = ?', FORMAT_WHERE[filters.format]];
  const params: Array<string | number> = [playerId];
  if (filters.competition) { where.push('tournament_key = ?'); params.push(filters.competition); }
  if (filters.season) { where.push('season = ?'); params.push(filters.season); }
  return { where, params };
}

/** How many balls there are for every combination of the ball filters, for the scope. One small table drives the blocking and the ball count. */
export async function loadCombos(playerId: string, filters: PlayerFilters, view: View, ball: BallFilters): Promise<Combo[]> {
  const { where, params } = scopeWhere(playerId, filters, view);
  where.push(...sliceWhere(ball, view), ballCondition(view));
  const file = view === 'bat' ? DATA_FILES.ballsByBatter : DATA_FILES.ballsByBowler;
  const team = teamColumn(view);
  return query<Combo>([file], `
    select phase, least(("over" // 20)::int, 4) as band, is_super_over as "superOver", innings::int as innings,
      case when team_wickets_fallen <= 2 then 'low' when team_wickets_fallen <= 5 then 'mid' else 'high' end as wickets,
      case when match_outcome = 'draw' then 'draw' when match_winner_id is null then 'other' when match_winner_id = ${team} then 'won' else 'lost' end as result,
      count(*)::int as balls
    from '${file}' where ${where.join(' and ')} group by all`, params);
}

export interface Opponent { id: string; name: string; style: string | null; balls: number }

/**
 * The bowlers a batter faced, or the batters a bowler bowled to, with their style and the balls, most balls first. It reads the same balls as the page
 * except for the opponent filter itself, so the list never narrows to the one chosen.
 */
export async function loadOpponents(playerId: string, filters: PlayerFilters, view: View, ball: BallFilters): Promise<Opponent[]> {
  const { where, params } = scopeWhere(playerId, filters, view, { ...ball, opponent: '' });
  where.push(ballCondition(view));
  const file = view === 'bat' ? DATA_FILES.ballsByBatter : DATA_FILES.ballsByBowler;
  const [id, name, style] = view === 'bat' ? ['bowler_id', 'bowler', '"bowling style_bowler"'] : ['striker_id', 'striker', '"batting style_striker"'];
  return query<Opponent>([file], `
    select ${id} as id, any_value(${name}) as name, any_value(${style}) as style, count(*)::int as balls
    from '${file}' where ${where.join(' and ')} and ${id} is not null group by ${id} order by balls desc, name limit 500`, params);
}

/**
 * Balls faced against each first style, under the same balls as the page except for the Bowler type itself, so each type option shows
 * what it would hold and an empty one can be greyed. The opponent is left in: a chosen bowler has one style.
 */
export async function loadStyleCounts(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<Map<string, number>> {
  const { where, params } = scopeWhere(playerId, filters, 'bat', { ...ball, type: 'all' });
  where.push(ballCondition('bat'));
  const rows = await query<{ style: string | null; balls: number }>([DATA_FILES.ballsByBatter], `
    select split_part("bowling style_bowler", ',', 1) as style, count(*)::int as balls
    from '${DATA_FILES.ballsByBatter}' where ${where.join(' and ')} group by 1`, params);
  return new Map(rows.filter((r) => r.style).map((r) => [r.style!.trim(), r.balls]));
}
