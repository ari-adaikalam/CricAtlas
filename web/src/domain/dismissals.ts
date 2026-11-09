import { BANDS, lanesFor } from './pitch';
import type { Hand } from './wagon';
// The Dismissal types tile of the bowling view: how the bowler's wickets came, which shot the batter was playing, and how far into the innings the batter was.
// Run outs and retirements are not wickets for the bowler, so none of them is here.

export const HOW_OUT = ['Caught', 'Bowled', 'LBW', 'Stumped', 'Other'] as const;
export type HowOut = (typeof HOW_OUT)[number];

const GROUP: Record<string, HowOut> = { caught: 'Caught', 'caught and bowled': 'Caught', bowled: 'Bowled', lbw: 'LBW', stumped: 'Stumped', 'hit wicket': 'Other' };

export type HowOutShare = Share & { label: HowOut }

/** Wickets by how they came. Caught and bowled counts as Caught. Kinds with no wicket are kept at zero so the legend keeps its order. */
export function howOut(rows: ReadonlyArray<{ type: string; n: number }>): HowOutShare[] {
  const counts = new Map<HowOut, number>(HOW_OUT.map((l) => [l, 0]));
  for (const r of rows) { const l = GROUP[r.type]; if (l) counts.set(l, (counts.get(l) ?? 0) + r.n); }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return HOW_OUT.map((label) => { const wickets = counts.get(label) ?? 0; return { label, wickets, share: total > 0 ? wickets / total : 0 }; });
}

// The batter's side: how a batter got out. Run outs count here (they are the batter's dismissal), and stumped and hit wicket and the rare kinds are Other.
export const BATTER_HOW_OUT = ['Caught', 'Bowled', 'LBW', 'Run out', 'Other'] as const;
const BATTER_GROUP: Record<string, string> = { caught: 'Caught', 'caught and bowled': 'Caught', bowled: 'Bowled', lbw: 'LBW', 'run out': 'Run out' };

export interface Share { label: string; wickets: number; share: number }

/** Dismissals of a batter by how they came, in the legend order. Any kind that is not caught, bowled, lbw or run out is Other. */
export function batterHowOut(rows: ReadonlyArray<{ type: string; n: number }>): Share[] {
  const counts = new Map<string, number>(BATTER_HOW_OUT.map((l) => [l, 0]));
  for (const r of rows) { const l = BATTER_GROUP[r.type] ?? 'Other'; counts.set(l, (counts.get(l) ?? 0) + r.n); }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return BATTER_HOW_OUT.map((label) => { const wickets = counts.get(label) ?? 0; return { label, wickets, share: total > 0 ? wickets / total : 0 }; });
}

export interface ShotRow { shot: string | null; wickets: number }

/** The five shots the batter was playing most often when out, then the wickets with no shot label as a Not recorded row. The tracked labels are used as they come. */
export function outPlaying(rows: ReadonlyArray<{ shot: string | null; n: number }>, top = 5): ShotRow[] {
  const labelled = rows.filter((r) => r.shot).map((r) => ({ shot: r.shot, wickets: r.n })).sort((a, b) => b.wickets - a.wickets || String(a.shot).localeCompare(String(b.shot)));
  const missing = rows.filter((r) => !r.shot).reduce((a, r) => a + r.n, 0);
  return [...labelled.slice(0, top), ...(missing > 0 ? [{ shot: null, wickets: missing }] : [])];
}

/**
 * The size of a ball bin for the batter's balls faced: 20 for Tests, 12 for ODIs, 6 for T20s and 5 for The Hundred. A scope that mixes formats uses the bins of the
 * longest format in it (Ari, 2026-10-18).
 */
export function ballBinSize(formats: ReadonlySet<string>, hundredOnly: boolean): number {
  if (formats.has('TEST')) return 20;
  if (formats.has('ODI')) return 12;
  return hundredOnly ? 5 : 6;
}

export interface Bin { label: string; from: number; to: number | null; count: number }

/** Ten bins of `size` and one open ended bin, counting each value once. Labels read '0-5' and '60+'. */
export function histogram(values: readonly number[], size: number, bins = 10): Bin[] {
  const out: Bin[] = Array.from({ length: bins + 1 }, (_, i) => i < bins
    ? { label: `${i * size}-${i * size + size - 1}`, from: i * size, to: i * size + size - 1, count: 0 }
    : { label: `${bins * size}+`, from: bins * size, to: null, count: 0 });
  for (const v of values) { const i = Math.min(bins, Math.max(0, Math.floor(v / size))); out[i]!.count++; }
  return out;
}

// The Dismissal map of the batting view: where the batter was out, by the line and length of the delivery that got them out.

/** Dismissals with a line and a length, grouped. */
export interface MapRow { length: string; line: string; outs: number }

/**
 * A grid of the six lengths (rows, full toss first) by the five lines (columns, the batter's own view, so a left-hander's are reversed) with the dismissals in each
 * cell, and the largest cell for the colour scale. Rows with a line or length outside the known set are dropped.
 */
export function dismissalMapGrid(rows: readonly MapRow[], hand: Hand): { lanes: readonly string[]; cells: number[][]; max: number; total: number } {
  const lanes = lanesFor(hand);
  const cells = BANDS.map((b) => lanes.map((l) => rows.filter((r) => r.length === b.key && r.line === l.key).reduce((a, r) => a + r.outs, 0)));
  const flat = cells.flat();
  return { lanes: lanes.map((l) => l.short), cells, max: Math.max(0, ...flat), total: flat.reduce((a, b) => a + b, 0) };
}
