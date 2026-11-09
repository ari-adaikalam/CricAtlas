import { describePhase, phaseOrder, SOURCE_SEGMENTS, type PhaseFormat, type SourceRow } from './phases';
import type { SummaryRow } from './batting';

export interface BowlingTotals {
  /** Legal balls bowled. */
  balls: number;
  runs: number;
  wickets: number;
  /** Runs per wicket, or null with no wickets. */
  average: number | null;
}

const n = (value: number | null): number => value ?? 0;

/** Adds up the bowling columns of summary rows. */
export function bowlingTotals(rows: readonly SummaryRow[]): BowlingTotals {
  let balls = 0, runs = 0, wickets = 0;
  for (const r of rows) { balls += n(r.balls_bowled); runs += n(r.runs_conceded); wickets += n(r.wickets); }
  return { balls, runs, wickets, average: wickets > 0 ? runs / wickets : null };
}

export type RoleKind = 'bat' | 'bowl' | 'all';

/** Which analysis view the player's role points to. The matching button is red on the profile, and both are red for an allrounder. */
export function roleKind(playingRole: string | null): RoleKind {
  const role = (playingRole ?? '').toLowerCase();
  if (role.includes('allrounder')) return 'all';
  if (role.includes('bowler')) return 'bowl';
  return 'bat';
}

// Bowling Key numbers: derived from counts. Economy is runs per six-ball over, and runs per five-ball over (an over of The Hundred) when the balls are all The Hundred's.

export interface BowlingSlice {
  /** Legal balls bowled. */
  balls: number;
  /** Runs charged to the bowler: off the bat, wides and no-balls. */
  conceded: number;
  wickets: number;
  dots: number;
  boundaries: number;
  /** Wides and no-balls bowled. */
  extras: number;
  innings: number;
  /** Wickets and runs in each innings bowled, for the best figures and the five-wicket hauls. */
  perInnings: ReadonlyArray<{ wickets: number; runs: number }>;
  letOffs: number;
  letOffRuns: number;
}

export interface BowlingRates {
  average: number | null;
  economy: number | null;
  ballsPerWicket: number | null;
  dotShare: number | null;
  boundaryShare: number | null;
  best: { wickets: number; runs: number } | null;
  fiveWickets: number;
}

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((100 * part) / whole) : null);

/** Best figures are the most wickets in an innings and, on a tie, the fewest runs. An innings with no wicket is not a best. */
export function bestFigures(innings: ReadonlyArray<{ wickets: number; runs: number }>): { wickets: number; runs: number } | null {
  let best: { wickets: number; runs: number } | null = null;
  for (const i of innings) if (i.wickets > 0 && (!best || i.wickets > best.wickets || (i.wickets === best.wickets && i.runs < best.runs))) best = i;
  return best;
}

export function bowlingRates(s: BowlingSlice, ballsPerOver = 6): BowlingRates {
  return {
    average: s.wickets > 0 ? s.conceded / s.wickets : null,
    economy: s.balls > 0 ? (s.conceded / s.balls) * ballsPerOver : null,
    ballsPerWicket: s.wickets > 0 ? s.balls / s.wickets : null,
    dotShare: pct(s.dots, s.balls),
    boundaryShare: pct(s.boundaries, s.balls),
    best: bestFigures(s.perInnings),
    fiveWickets: s.perInnings.filter((i) => i.wickets >= 5).length,
  };
}

/** Overs in cricket notation: 25 balls is 4.1. */
export const oversOf = (balls: number): string => `${Math.floor(balls / 6)}${balls % 6 ? `.${balls % 6}` : ''}`;

/** A bowler's balls in one phase (an overs band in Tests). Balls are legal deliveries. Conceded and dots are counted the way the Key numbers count them. */
export interface BowlPhaseCounts { key: string; balls: number; conceded: number; wickets: number; dots: number; boundaries: number }

export interface BowlPhaseColumn {
  key: string;
  name: string;
  overs: string | null;
  balls: number;
  economy: number | null;
  /** Economy against the whole slice. Negative is better for the bowler. */
  difference: number | null;
  wickets: number;
  dotShare: number | null;
  boundaryShare: number | null;
}

/**
 * The Phases columns for a bowler, in phase order, for the phases that have balls. The economy is per six-ball over, or per five-ball over in The Hundred.
 * The difference is against the same balls over all phases, rounded the way it is shown (two places) so the sign matches the screen.
 */
export function bowlPhaseColumns(rows: readonly BowlPhaseCounts[], format: PhaseFormat, hundred = false): BowlPhaseColumn[] {
  const per = hundred ? 5 : 6;
  const total = rows.reduce((a, r) => ({ balls: a.balls + r.balls, conceded: a.conceded + r.conceded }), { balls: 0, conceded: 0 });
  const overall = total.balls > 0 ? (total.conceded / total.balls) * per : null;
  return [...rows].filter((r) => r.balls > 0).sort((a, b) => phaseOrder(a.key) - phaseOrder(b.key)).map((r) => {
    const economy = (r.conceded / r.balls) * per;
    return {
      key: r.key, ...describePhase(r.key, format, hundred), balls: r.balls, economy,
      difference: overall === null ? null : Math.round(economy * 100) / 100 - Math.round(overall * 100) / 100,
      wickets: r.wickets, dotShare: pct(r.dots, r.balls), boundaryShare: pct(r.boundaries, r.balls),
    };
  });
}

/** A bowler's phase counts with the runs by kind of ball: balls that went for exactly one, two, three, four and six off the bat, and the wides and no-balls charged. */
export interface BowlSourceCounts extends BowlPhaseCounts { ones: number; twos: number; threes: number; fours: number; sixes: number; extras: number }

const EXTRAS_COLOUR = '#FF9F43';

/**
 * The Runs conceded tile: an Overall row and a row for each phase with runs, split into singles, twos, threes, fours, sixes and extras. Extras are the wides and
 * no-balls charged to the bowler, the same as Key numbers. Byes and leg-byes are not the bowler's and are in no kind, and neither are balls that scored five or
 * seven off the bat (overthrows), so they are left out of the shares.
 */
export function bowlRunSources(rows: readonly BowlSourceCounts[], format: PhaseFormat, hundred = false): SourceRow[] {
  const row = (key: string, name: string, c: Pick<BowlSourceCounts, 'ones' | 'twos' | 'threes' | 'fours' | 'sixes' | 'extras'>): SourceRow => {
    const parts = [
      ...SOURCE_SEGMENTS.map((s) => ({ label: s.label, colour: s.colour, balls: c[s.key], runs: c[s.key] * s.runsPerBall })),
      { label: 'Extras', colour: EXTRAS_COLOUR, balls: c.extras, runs: c.extras },
    ];
    const total = parts.reduce((a, p) => a + p.runs, 0);
    return { key, name, runs: total, segments: parts.map((p) => ({ ...p, share: total > 0 ? p.runs / total : 0 })) };
  };
  const sum = (pick: (r: BowlSourceCounts) => number): number => rows.reduce((a, r) => a + pick(r), 0);
  const overall = row('overall', 'Overall', { ones: sum((r) => r.ones), twos: sum((r) => r.twos), threes: sum((r) => r.threes), fours: sum((r) => r.fours), sixes: sum((r) => r.sixes), extras: sum((r) => r.extras) });
  if (overall.runs === 0) return [];
  const ordered = [...rows].filter((r) => r.balls > 0).sort((a, b) => phaseOrder(a.key) - phaseOrder(b.key));
  return [overall, ...ordered.map((r) => row(r.key, describePhase(r.key, format, hundred).name, r)).filter((r) => r.runs > 0)];
}

// The Length by phase tile: the mix of lengths a bowler bowled in each phase, as shares of the balls with a tracked length.

export interface LengthCount { key: string; length: string; n: number }

/** The six lengths in pitch order. The main and second colours are the team pair, and the others stay fixed (the mockup's purple, white, grey and pale sky). */
export const LENGTH_ORDER = ['full toss', 'yorker', 'full', 'good length', 'short of a good length', 'short'] as const;
const LENGTH_LABEL: Record<string, string> = { 'full toss': 'Full toss', yorker: 'Yorker', full: 'Full', 'good length': 'Good length', 'short of a good length': 'Short of good', short: 'Short' };

/**
 * One row for each phase with balls, then a Whole innings row, each split into the six lengths. A segment is a share of the balls in the row that have a length.
 * A row with no tracked ball is left out. The segment's `runs` field carries the ball count, since the row is a mix of balls and not of runs.
 */
export function lengthByPhase(rows: readonly LengthCount[], format: PhaseFormat, hundred: boolean, colours: { main: string; second: string }): SourceRow[] {
  const fill = [ '#B79CFF', colours.second, colours.main, '#FFFFFF', '#5E6168', '#B9E3FA' ];
  const row = (key: string, name: string, counts: Map<string, number>): SourceRow => {
    const total = LENGTH_ORDER.reduce((a, l) => a + (counts.get(l) ?? 0), 0);
    return { key, name, runs: total, segments: LENGTH_ORDER.map((l, i) => { const balls = counts.get(l) ?? 0; return { label: LENGTH_LABEL[l] ?? l, colour: fill[i] ?? '#fff', balls, runs: balls, share: total > 0 ? balls / total : 0 }; }) };
  };
  const byPhase = new Map<string, Map<string, number>>();
  const whole = new Map<string, number>();
  for (const r of rows) {
    const m = byPhase.get(r.key) ?? new Map<string, number>();
    m.set(r.length, (m.get(r.length) ?? 0) + r.n);
    byPhase.set(r.key, m);
    whole.set(r.length, (whole.get(r.length) ?? 0) + r.n);
  }
  const phases = [...byPhase].sort(([a], [b]) => phaseOrder(a) - phaseOrder(b)).map(([key, m]) => row(key, describePhase(key, format, hundred).name, m)).filter((r) => r.runs > 0);
  const all = row('whole', 'Whole innings', whole);
  return all.runs > 0 ? [...phases, all] : [];
}

// The Batters tile: a bowler's results against right and left handers, and against each part of the batting order.

export interface SplitCounts { key: string; balls: number; conceded: number; wickets: number; dots: number }
export interface SplitRow extends SplitCounts { name: string; economy: number | null; average: number | null; dotShare: number | null }

export const ORDER_GROUPS = [
  { key: 'open', name: 'Openers (1 to 2)', from: 1, to: 2 },
  { key: 'top', name: 'Top order (3 to 5)', from: 3, to: 5 },
  { key: 'middle', name: 'Middle order (6 to 8)', from: 6, to: 8 },
  { key: 'tail', name: 'Tail (9 to 11)', from: 9, to: 11 },
] as const;

/** The part of the batting order a position belongs to. A twelfth position (a substitute or a long innings in a short side) counts with the tail. */
export function orderGroup(position: number): string {
  return ORDER_GROUPS.find((g) => position >= g.from && position <= g.to)?.key ?? 'tail';
}

const HAND_NAMES: Record<string, string> = { right: 'Right-handers', left: 'Left-handers', unknown: 'Hand not known' };

/** Rows with balls, in the given order of keys, with the economy, average and dot share worked out from the counts. */
export function splitRows(rows: readonly SplitCounts[], names: Readonly<Record<string, string>>, order: readonly string[], ballsPerOver = 6): SplitRow[] {
  return order.flatMap((key) => {
    const r = rows.find((x) => x.key === key);
    if (!r || r.balls === 0) return [];
    return [{ ...r, name: names[key] ?? key, economy: (r.conceded / r.balls) * ballsPerOver, average: r.wickets > 0 ? r.conceded / r.wickets : null, dotShare: Math.round((100 * r.dots) / r.balls) }];
  });
}

export const handRows = (rows: readonly SplitCounts[], per = 6): SplitRow[] => splitRows(rows, HAND_NAMES, ['right', 'left', 'unknown'], per);
export const orderRows = (rows: readonly SplitCounts[], per = 6): SplitRow[] => splitRows(rows, Object.fromEntries(ORDER_GROUPS.map((g) => [g.key, g.name])), ORDER_GROUPS.map((g) => g.key), per);
