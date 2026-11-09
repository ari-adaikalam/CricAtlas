import type { Hand } from './wagon';

// Pitch map logic: the dataset's length and line labels as bands and lanes, and the counts for each cell.
// Both come from the tracked labels as they are. Nothing is merged or guessed, so a ball with no length or line is not on the map.

export interface Band { key: string; label: string; full: string; from: number; to: number }

/** Metres from the batter's stumps. The distances are a drawing aid: the data has the band, not where the ball pitched. Full toss has no bounce. */
export const BANDS: readonly Band[] = [
  { key: 'full toss', label: 'Full toss', full: 'Full toss', from: 0, to: 1 },
  { key: 'yorker', label: 'Yorker', full: 'Yorker', from: 1, to: 2.4 },
  { key: 'full', label: 'Full', full: 'Full', from: 2.4, to: 4.2 },
  { key: 'good length', label: 'Good', full: 'Good length', from: 4.2, to: 6.4 },
  { key: 'short of a good length', label: 'Short of good', full: 'Short of a good length', from: 6.4, to: 8.9 },
  { key: 'short', label: 'Short', full: 'Short', from: 8.9, to: 12.5 },
];

export interface Lane { key: string; label: string; short: string }

/** Left to right as a right-hander sees them, off side on the left. */
export const LANES: readonly Lane[] = [
  { key: 'wide outside offstump', label: 'Wide outside off', short: 'Wide off' },
  { key: 'outside offstump', label: 'Outside off', short: 'Off' },
  { key: 'on the stumps', label: 'On the stumps', short: 'Stumps' },
  { key: 'down leg', label: 'Down the leg side', short: 'Down leg' },
  { key: 'wide down leg', label: 'Wide down leg', short: 'Wide leg' },
];

/** Lanes in screen order. A left-hander has the off side on the right, so the order reverses. */
export const lanesFor = (hand: Hand): readonly Lane[] => (hand === 'L' ? [...LANES].reverse() : LANES);

/** One row of the grouped query: all balls with the same length and line. */
export interface PitchRow { length: string; line: string; balls: number; dots: number; scoring: number; fours: number; sixes: number; wickets: number; runs: number; inControl: number; controlKnown: number }

export interface Cell extends PitchRow { band: number; lane: number }

/** Cells with balls, as band and lane positions in the LANES order (not mirrored). Rows with a label outside the known set are dropped. */
export function cellsFrom(rows: readonly PitchRow[]): Cell[] {
  const out: Cell[] = [];
  for (const row of rows) {
    const band = BANDS.findIndex((b) => b.key === row.length);
    const lane = LANES.findIndex((l) => l.key === row.line);
    if (band >= 0 && lane >= 0 && row.balls > 0) out.push({ ...row, band, lane });
  }
  return out;
}

export interface Summary { balls: number; dots: number; fours: number; sixes: number; runs: number; wickets: number; inControl: number; controlKnown: number }

const empty = (): Summary => ({ balls: 0, dots: 0, fours: 0, sixes: 0, runs: 0, wickets: 0, inControl: 0, controlKnown: 0 });

function add(into: Summary, c: Summary): void {
  into.balls += c.balls; into.dots += c.dots; into.fours += c.fours; into.sixes += c.sixes;
  into.runs += c.runs; into.wickets += c.wickets; into.inControl += c.inControl; into.controlKnown += c.controlKnown;
}

/** One summary per band, in BANDS order, and the total row. */
export function summarise(cells: readonly Cell[]): { bands: Summary[]; total: Summary } {
  const bands = BANDS.map(empty);
  const total = empty();
  for (const c of cells) { const b = bands[c.band]; if (b) add(b, c); add(total, c); }
  return { bands, total };
}

/** Share of balls in control among balls with a control label, or null when none has one. */
export const controlShare = (s: Pick<Summary, 'inControl' | 'controlKnown'>): number | null =>
  s.controlKnown > 0 ? Math.round((100 * s.inControl) / s.controlKnown) : null;

/** The outcome classes of the dots, in the order a cell lists them. A wicket wins over runs. */
export function outcomeCounts(c: Pick<Cell, 'balls' | 'dots' | 'scoring' | 'fours' | 'sixes' | 'wickets'>): { wicket: number; six: number; four: number; run: number; dot: number } {
  return { wicket: c.wickets, six: c.sixes, four: c.fours, run: c.scoring, dot: c.dots };
}

// The Line and length results tile: what happened on each line and length, as the batter sees the lines (a right-hander's view, off side on the left).

export type LandingMode = 'dots' | 'boundaries' | 'rpb';
export interface LandingCell { balls: number; value: number | null }

/** Six lengths by five lines. A cell holds the share of dot balls or of balls hit for four or six (0 to 1), or the runs off the bat per ball. Empty cells have no value. */
export function landingGrid(rows: readonly PitchRow[], mode: LandingMode): LandingCell[][] {
  const cells = cellsFrom(rows);
  return BANDS.map((_, b) => LANES.map((__, l) => {
    const hit = cells.filter((c) => c.band === b && c.lane === l);
    const balls = hit.reduce((a, c) => a + c.balls, 0);
    if (balls === 0) return { balls: 0, value: null };
    const sum = (pick: (c: Cell) => number): number => hit.reduce((a, c) => a + pick(c), 0);
    const value = mode === 'dots' ? sum((c) => c.dots) / balls : mode === 'boundaries' ? (sum((c) => c.fours) + sum((c) => c.sixes)) / balls : sum((c) => c.runs) / balls;
    return { balls, value };
  }));
}

/** Refined pitch map: how many paths are drawn together in one batch and how long the whole draw takes. A small sample is drawn in small batches and a big one in bigger batches, so the draw is
 * never long (at most 18 batches, 0.05 of a second each, plus 0.3 of a second: about a second and a quarter). */
export function batchPlan(arcs: number): { batch: number; seconds: number } {
  const MAX_BATCHES = 18, BATCH_SECONDS = 0.05;
  const batch = Math.max(1, Math.ceil(arcs / MAX_BATCHES));
  const seconds = Math.min(1.6, Math.max(0.7, 0.3 + Math.ceil(arcs / batch) * BATCH_SECONDS));
  return { batch, seconds };
}
