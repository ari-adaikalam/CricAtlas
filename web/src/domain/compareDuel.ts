import { HOW_OUT, howOut, type HowOutShare } from './dismissals';

// The Versus each other tiles of Compare players: only the balls where one of the two players batted while the other bowled. A duel has two directions, the first player batting
// against the second and the second against the first. Each innings of the batter in which the bowler bowled to them is one row.

export type Direction = 'ab' | 'ba';

export interface DuelInnings {
  dir: Direction;
  matchId: number;
  innings: number;
  date: string;
  format: string;
  tournament_key: string | null;
  /** Balls the batter faced from the bowler (wides are not faced). */
  balls: number;
  runs: number;
  fours: number;
  sixes: number;
  /** How the bowler got the batter out in this innings (a bowler's wicket: bowled, caught, lbw, stumped, caught and bowled, hit wicket), or null. */
  dismissal: string | null;
  /** Balls and runs in each phase (an overs band in Tests), keyed by the phase. */
  phases: Record<string, { balls: number; runs: number }>;
}

export interface DuelTotals {
  innings: number;
  balls: number;
  runs: number;
  outs: number;
  strikeRate: number | null;
  /** Runs per dismissal. */
  average: number | null;
  ballsPerWicket: number | null;
  /** Runs per ball bowled, times 6 (5 in The Hundred). */
  economy: number | null;
  fours: number;
  sixes: number;
  highScore: number | null;
  highScoreNotOut: boolean;
  /** The best innings of the bowler against the batter: dismissals (0 or 1) and runs. */
  best: { w: number; r: number } | null;
}

export const yearOfDuel = (x: Pick<DuelInnings, 'date'>): number => Number(x.date.slice(0, 4));

/** The figures of a set of duel innings, for the Head to head tile. */
export function duelTotals(xs: readonly DuelInnings[], perFive = false): DuelTotals {
  const balls = xs.reduce((a, x) => a + x.balls, 0), runs = xs.reduce((a, x) => a + x.runs, 0), outs = xs.filter((x) => x.dismissal !== null).length;
  // The highest score of the batter against the bowler: the most runs, a not out ahead of an out on the same score.
  const top = [...xs].sort((a, b) => b.runs - a.runs || Number(a.dismissal !== null) - Number(b.dismissal !== null))[0];
  // The bowler's best innings against the batter: a dismissal for the fewest runs, else the fewest runs.
  const bw = [...xs].sort((a, b) => Number(b.dismissal !== null) - Number(a.dismissal !== null) || a.runs - b.runs)[0];
  return {
    innings: xs.length, balls, runs, outs, strikeRate: balls ? (runs / balls) * 100 : null, average: outs ? runs / outs : null, ballsPerWicket: outs ? balls / outs : null,
    economy: balls ? (runs / balls) * (perFive ? 5 : 6) : null, fours: xs.reduce((a, x) => a + x.fours, 0), sixes: xs.reduce((a, x) => a + x.sixes, 0),
    highScore: top ? top.runs : null, highScoreNotOut: top ? top.dismissal === null : false, best: bw ? { w: bw.dismissal !== null ? 1 : 0, r: bw.runs } : null,
  };
}

/** The directions in the order the tiles show them: the one with more innings first. */
export function directionsByInnings(xs: readonly DuelInnings[]): Direction[] {
  const n = (d: Direction): number => xs.filter((x) => x.dir === d).length;
  return n('ba') > n('ab') ? ['ba', 'ab'] : ['ab', 'ba'];
}

/** Dismissals by type in one direction, in the legend order of the player page. The two kinds a bowler is not credited with are not here. */
export function duelDismissals(xs: readonly DuelInnings[]): HowOutShare[] {
  const counts = new Map<string, number>();
  for (const x of xs) if (x.dismissal !== null) counts.set(x.dismissal, (counts.get(x.dismissal) ?? 0) + 1);
  return howOut([...counts].map(([type, n]) => ({ type, n })));
}
export const DUEL_HOW: readonly string[] = HOW_OUT;

/** The strike rate of one direction in each year, null for a year with no ball. */
export function duelYears(xs: readonly DuelInnings[], years: readonly number[]): Array<number | null> {
  return years.map((y) => { const t = duelTotals(xs.filter((x) => yearOfDuel(x) === y)); return t.balls ? t.strikeRate : null; });
}

/** Strike rate and economy of one direction in a phase, with the balls. */
export function duelPhase(xs: readonly DuelInnings[], key: string, perFive = false): { balls: number; strikeRate: number | null; economy: number | null } {
  const balls = xs.reduce((a, x) => a + (x.phases[key]?.balls ?? 0), 0), runs = xs.reduce((a, x) => a + (x.phases[key]?.runs ?? 0), 0);
  return { balls, strikeRate: balls ? (runs / balls) * 100 : null, economy: balls ? (runs / balls) * (perFive ? 5 : 6) : null };
}

/** Every phase key that has a ball in the innings, in the order of an innings. */
export function duelPhaseKeys(xs: readonly DuelInnings[], order: (key: string) => number): string[] {
  return [...new Set(xs.flatMap((x) => Object.keys(x.phases)))].sort((a, b) => order(a) - order(b));
}
