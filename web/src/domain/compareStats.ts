import { battingLine, bowlingLine, type BatLine, type BowlLine, type StatBat, type StatBowl } from './fullStats';

// The numbers of the Compare players tiles: the rows of left value, label and right value, who leads each one, and the series the charts draw. Everything here is pure: the data comes
// from the same innings rows the Full stats tables use, so a number agrees with the player's own page.

export interface Cell { v: number | null; s: string }
export interface CompareRow { label: string; a: Cell; b: Cell; /** A lower number is better (bowling average, economy, strike rate, ducks). */ low?: boolean }
export type Lead = 'a' | 'b' | '';

const WHOLE = new Intl.NumberFormat('en');

/** A number and how it is written: a dash for no value, thousands separators for a whole number, `digits` decimals otherwise. */
export function cell(v: number | null | undefined, digits?: number): Cell {
  if (v === null || v === undefined || Number.isNaN(v)) return { v: null, s: '-' };
  return { v, s: digits === undefined ? WHOLE.format(v) : v.toFixed(digits) };
}

/** Who leads a row: the higher number, or the lower one where lower is better. Nobody leads when a number is missing or the two are level. */
export function leader(row: Pick<CompareRow, 'a' | 'b' | 'low'>): Lead {
  const { v: x } = row.a, { v: y } = row.b;
  if (x === null || y === null || x === y) return '';
  return (row.low ? x < y : x > y) ? 'a' : 'b';
}

/** What a player's side of the comparison holds for the filters chosen: the batting and bowling lines, the matches played, the fielding and the awards. */
export interface Side {
  bat: BatLine;
  bowl: BowlLine;
  played: number;
  catches: number;
  stumpings: number;
  potm: number;
  /** The best figures in a match (wickets and runs over both innings) and the matches with ten wickets or more. */
  bestMatch: { w: number; r: number } | null;
  tenWicketMatches: number;
}

/** Wickets and runs of each match, from the spells: the best match and the number of matches with ten wickets or more. */
export function matchFigures(bowl: readonly StatBowl[]): { best: { w: number; r: number } | null; tens: number } {
  const by = new Map<number, { w: number; r: number }>();
  for (const x of bowl) { const m = by.get(x.match_id) ?? { w: 0, r: 0 }; by.set(x.match_id, { w: m.w + x.wickets, r: m.r + x.runs }); }
  let best: { w: number; r: number } | null = null, tens = 0;
  for (const m of by.values()) {
    if (m.w >= 10) tens += 1;
    if (best === null || m.w > best.w || (m.w === best.w && m.r < best.r)) best = m;
  }
  return { best, tens };
}

export function sideOf(bat: readonly StatBat[], bowl: readonly StatBowl[], played: number, field: { catches: number; stumpings: number }, potm: number, perFive: boolean): Side {
  const mf = matchFigures(bowl);
  return { bat: battingLine(bat), bowl: bowlingLine(bowl, perFive), played, catches: field.catches, stumpings: field.stumpings, potm, bestMatch: mf.best, tenWicketMatches: mf.tens };
}

const hs = (l: BatLine): Cell => ({ v: l.hs, s: l.hs === null ? '-' : `${l.hs}${l.hsNotOut ? '*' : ''}` });
const figures = (w: number | null, r: number | null): Cell => ({ v: w, s: w === null ? '-' : `${w}/${r}` });

/** The twelve rows of the Batting tile. */
export function battingRows(a: BatLine, b: BatLine): CompareRow[] {
  return [
    { label: 'Innings', a: cell(a.inns), b: cell(b.inns) }, { label: 'Runs scored', a: cell(a.runs), b: cell(b.runs) }, { label: 'Balls faced', a: cell(a.bf), b: cell(b.bf) },
    { label: 'Highest score', a: hs(a), b: hs(b) }, { label: 'Average', a: cell(a.avg, 2), b: cell(b.avg, 2) }, { label: 'Not outs', a: cell(a.no), b: cell(b.no) },
    { label: 'Strike rate', a: cell(a.sr, 2), b: cell(b.sr, 2) }, { label: 'Hundreds', a: cell(a.hundreds), b: cell(b.hundreds) }, { label: 'Fifties', a: cell(a.fifties), b: cell(b.fifties) },
    { label: 'Ducks', a: cell(a.ducks), b: cell(b.ducks), low: true }, { label: 'Fours', a: cell(a.fours), b: cell(b.fours) }, { label: 'Sixes', a: cell(a.sixes), b: cell(b.sixes) },
  ];
}

/** The twelve rows of the Bowling tile. `perFive` is The Hundred, whose economy is per 5 balls. */
export function bowlingRows(a: Side, b: Side, perFive: boolean): CompareRow[] {
  const x = a.bowl, y = b.bowl;
  return [
    { label: 'Innings', a: cell(x.inns), b: cell(y.inns) }, { label: 'Balls bowled', a: cell(x.balls), b: cell(y.balls) }, { label: 'Runs conceded', a: cell(x.runs), b: cell(y.runs) },
    { label: 'Wickets', a: cell(x.wkts), b: cell(y.wkts) },
    { label: 'Best figures, innings', a: figures(x.bbiW, x.bbiR), b: figures(y.bbiW, y.bbiR) },
    { label: 'Best figures, match', a: figures(a.bestMatch?.w ?? null, a.bestMatch?.r ?? null), b: figures(b.bestMatch?.w ?? null, b.bestMatch?.r ?? null) },
    { label: 'Average', a: cell(x.avg, 2), b: cell(y.avg, 2), low: true }, { label: perFive ? 'Economy per 5 balls' : 'Economy', a: cell(x.econ, 2), b: cell(y.econ, 2), low: true },
    { label: 'Strike rate', a: cell(x.sr, 1), b: cell(y.sr, 1), low: true },
    { label: 'Four wicket hauls', a: cell(x.four), b: cell(y.four) }, { label: 'Five wicket hauls', a: cell(x.five), b: cell(y.five) }, { label: 'Ten wicket matches', a: cell(a.tenWicketMatches), b: cell(b.tenWicketMatches) },
  ];
}

export interface Scoreboard { rows: Array<CompareRow & { lead: Lead }>; a: number; b: number; level: number }

/** The Scoreboard: the main categories for the filters, who leads each, and how many each player leads. A category where neither player has a number is left out, and one with a number for only one is not decided. */
export function scoreboard(a: Side, b: Side): Scoreboard {
  const all: CompareRow[] = [
    { label: 'Matches', a: cell(a.played), b: cell(b.played) }, { label: 'Runs', a: cell(a.bat.runs), b: cell(b.bat.runs) }, { label: 'Average', a: cell(a.bat.avg, 2), b: cell(b.bat.avg, 2) },
    { label: 'Strike rate', a: cell(a.bat.sr, 1), b: cell(b.bat.sr, 1) }, { label: '100s', a: cell(a.bat.hundreds), b: cell(b.bat.hundreds) }, { label: '50s', a: cell(a.bat.fifties), b: cell(b.bat.fifties) },
    { label: 'Sixes', a: cell(a.bat.sixes), b: cell(b.bat.sixes) }, { label: 'Wickets', a: cell(a.bowl.wkts), b: cell(b.bowl.wkts) },
    { label: 'Bowl avg', a: cell(a.bowl.avg, 2), b: cell(b.bowl.avg, 2), low: true }, { label: 'Economy', a: cell(a.bowl.econ, 2), b: cell(b.bowl.econ, 2), low: true },
    { label: 'Catches', a: cell(a.catches), b: cell(b.catches) }, { label: 'Player of the match', a: cell(a.potm), b: cell(b.potm) },
  ];
  const rows = all.filter((r) => r.a.v !== null || r.b.v !== null).map((r) => ({ ...r, lead: leader(r) }));
  const la = rows.filter((r) => r.lead === 'a').length, lb = rows.filter((r) => r.lead === 'b').length;
  return { rows, a: la, b: lb, level: rows.length - la - lb };
}

// ---- Series -----------------------------------------------------------------------------------------

export type YearMeasure = 'Runs' | 'Average' | 'Strike rate' | 'Wickets';
export const YEAR_MEASURES: readonly YearMeasure[] = ['Runs', 'Average', 'Strike rate', 'Wickets'];

const yearOf = (date: string): number => Number(date.slice(0, 4));

/** The calendar years either player has innings in, oldest first. */
export function yearsOf(...sets: ReadonlyArray<ReadonlyArray<{ date: string }>>): number[] {
  return [...new Set(sets.flatMap((s) => s.map((x) => yearOf(x.date))))].sort((a, b) => a - b);
}

/** One player's number for a year, or null when there is nothing to show: runs and average and strike rate need an innings that year, wickets need a spell. */
export function yearValue(bat: readonly StatBat[], bowl: readonly StatBowl[], year: number, measure: YearMeasure): number | null {
  const b = bat.filter((x) => yearOf(x.date) === year), w = bowl.filter((x) => yearOf(x.date) === year);
  if (measure === 'Wickets') return w.length ? w.reduce((n, x) => n + x.wickets, 0) : null;
  if (!b.length) return null;
  const l = battingLine(b);
  return measure === 'Runs' ? l.runs : measure === 'Average' ? l.avg : l.sr;
}

/** Total runs after each innings, innings in date order: the line of Runs by innings. */
export function cumulativeRuns(bat: readonly StatBat[]): number[] {
  let total = 0;
  return [...bat].sort((x, y) => x.date.localeCompare(y.date) || x.match_id - y.match_id || x.innings - y.innings).map((x) => (total += x.runs));
}

/** How many innings a series needed to reach a total, or null when it never did. */
export const inningsToReach = (series: readonly number[], runs: number): number | null => { const k = series.findIndex((v) => v >= runs); return k < 0 ? null : k + 1; };

/** The five highest scores (a not out is marked by the row) and the two best spells, for the Best performances tile. */
export function bestPerformances(bat: readonly StatBat[], bowl: readonly StatBowl[]): { bat: StatBat[]; bowl: StatBowl[] } {
  return {
    bat: [...bat].sort((x, y) => y.runs - x.runs || x.balls - y.balls).slice(0, 5),
    bowl: [...bowl].filter((x) => x.wickets > 0).sort((x, y) => y.wickets - x.wickets || x.runs - y.runs).slice(0, 2),
  };
}

export const SITUATIONS = ['Batting first', 'Chasing', 'In a win', 'In a loss'] as const;
// Batting first is the team batting in innings 1 of the match, chasing is the team batting second (in a Test, the side that went in second).
const inSituation = (x: StatBat, k: number): boolean => (k === 0 ? x.team_bat_first === true : k === 1 ? x.team_bat_first === false : k === 2 ? x.result === 'won' : x.result === 'lost');

/** The batting line of a player in each situation of the Innings and results tile: batting first, chasing, in a win and in a loss. */
export function situationLines(bat: readonly StatBat[]): BatLine[] {
  return SITUATIONS.map((_, k) => battingLine(bat.filter((x) => inSituation(x, k))));
}
