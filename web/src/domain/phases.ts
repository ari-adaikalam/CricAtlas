import { BAND_LABELS } from './ballFilters';

// The Phases tile: one column for each phase of an innings (an overs band in Tests), with the strike rate, how it compares with the
// whole slice, the average, dot balls, boundary balls and the balls faced. Everything is worked out from counts.

export interface PhaseCounts {
  /** phase (powerplay, middle, death, rest) or band0 to band4 in Tests. */
  key: string;
  balls: number;
  runs: number;
  dots: number;
  /** Balls hit for four or six. */
  boundaries: number;
  dismissals: number;
  /** Balls that scored exactly one, two, three, four and six runs off the bat. */
  ones: number;
  twos: number;
  threes: number;
  fours: number;
  sixes: number;
}

export type PhaseFormat = 'test' | 't20' | 'odi';

export interface PhaseColumn {
  key: string;
  name: string;
  /** The overs the phase usually covers. The Powerplay of an odd match can differ, so this is a description, not a rule. */
  overs: string | null;
  balls: number;
  strikeRate: number | null;
  /** Strike rate against the whole slice, in runs per 100 balls. */
  difference: number | null;
  average: number | null;
  dotShare: number | null;
  boundaryShare: number | null;
}

const NAMES: Record<string, string> = { powerplay: 'Powerplay', middle: 'Middle overs', death: 'Death overs', rest: 'Rest of innings' };
const OVERS: Record<PhaseFormat, Record<string, string>> = {
  test: {},
  t20: { powerplay: 'Overs 1 to 6', middle: 'Overs 7 to 15', death: 'Overs 16 to 20', rest: 'Balls 26 to 100' },
  odi: { powerplay: 'Overs 1 to 10', middle: 'Overs 11 to 40', death: 'Overs 41 to 50' },
};
const ORDER = ['powerplay', 'middle', 'death', 'rest', 'band0', 'band1', 'band2', 'band3', 'band4'];

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((100 * part) / whole) : null);

/** The column name and the overs it usually covers, shared by the batting and bowling Phases tiles. */
export function describePhase(key: string, format: PhaseFormat, hundredPowerplay = false): { name: string; overs: string | null } {
  const band = /^band(\d)$/.exec(key);
  return {
    name: band ? BAND_LABELS[Number(band[1])] ?? key : NAMES[key] ?? key,
    overs: band ? null : key === 'powerplay' && hundredPowerplay ? 'Balls 1 to 25' : OVERS[format][key] ?? null,
  };
}

/** Phases in the order of an innings, the overs bands of Tests after them. */
export const phaseOrder = (key: string): number => ORDER.indexOf(key);

/**
 * The columns, in phase order, for the phases that have balls. `all` is the whole slice, so a column's difference is against the same balls.
 * The Hundred's Powerplay says Balls 1 to 25.
 */
export function phaseColumns(rows: readonly PhaseCounts[], format: PhaseFormat, hundredPowerplay = false): PhaseColumn[] {
  const total = rows.reduce((a, r) => ({ balls: a.balls + r.balls, runs: a.runs + r.runs }), { balls: 0, runs: 0 });
  const overall = total.balls > 0 ? (total.runs / total.balls) * 100 : null;
  return [...rows].filter((r) => r.balls > 0).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)).map((r) => {
    const strikeRate = r.balls > 0 ? (r.runs / r.balls) * 100 : null;
    return {
      key: r.key,
      ...describePhase(r.key, format, hundredPowerplay),
      balls: r.balls,
      strikeRate,
      difference: strikeRate !== null && overall !== null ? Math.round(strikeRate) - Math.round(overall) : null,
      average: r.dismissals > 0 ? r.runs / r.dismissals : null,
      dotShare: pct(r.dots, r.balls),
      boundaryShare: pct(r.boundaries, r.balls),
    };
  });
}

// The Run sources tile: how the runs split between singles, twos, threes, fours and sixes, overall and in each phase.

export const SOURCE_SEGMENTS = [
  { key: 'ones', label: 'Singles', runsPerBall: 1, colour: '#C9CDD3' },
  { key: 'twos', label: 'Twos', runsPerBall: 2, colour: '#fff' },
  { key: 'threes', label: 'Threes', runsPerBall: 3, colour: '#B79CFF' },
  { key: 'fours', label: 'Fours', runsPerBall: 4, colour: '#56B4E9' },
  { key: 'sixes', label: 'Sixes', runsPerBall: 6, colour: '#B9E3FA' },
] as const;

export interface SourceSegment { label: string; colour: string; balls: number; runs: number; share: number }
export interface SourceRow { key: string; name: string; /** The team the row is for, when it is one (the Match page), so its emblem can head the row. */ team?: string; runs: number; segments: SourceSegment[] }

function sourceRow(key: string, name: string, counts: Pick<PhaseCounts, 'ones' | 'twos' | 'threes' | 'fours' | 'sixes'>): SourceRow {
  const parts = SOURCE_SEGMENTS.map((s) => ({ label: s.label, colour: s.colour, balls: counts[s.key], runs: counts[s.key] * s.runsPerBall }));
  const total = parts.reduce((a, p) => a + p.runs, 0);
  return { key, name, runs: total, segments: parts.map((p) => ({ ...p, share: total > 0 ? p.runs / total : 0 })) };
}

/**
 * An Overall row from every phase, then a row for each phase with runs, in phase order. A share is the runs from that kind of ball over the runs
 * from all five kinds. Balls scoring five or seven runs (overthrows) are in no kind, so they are left out of the shares.
 */
export function runSources(rows: readonly PhaseCounts[], format: PhaseFormat, hundredPowerplay = false): SourceRow[] {
  const sum = (pick: (r: PhaseCounts) => number): number => rows.reduce((a, r) => a + pick(r), 0);
  const overall = sourceRow('overall', 'Overall', { ones: sum((r) => r.ones), twos: sum((r) => r.twos), threes: sum((r) => r.threes), fours: sum((r) => r.fours), sixes: sum((r) => r.sixes) });
  if (overall.runs === 0) return [];
  const names = new Map(phaseColumns(rows, format, hundredPowerplay).map((c) => [c.key, c.name]));
  const ordered = [...rows].filter((r) => r.balls > 0).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  return [overall, ...ordered.map((r) => sourceRow(r.key, names.get(r.key) ?? r.key, r)).filter((r) => r.runs > 0)];
}
