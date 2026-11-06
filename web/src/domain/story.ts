import type { BallFile } from './ballByBall';
import { overStats, cumulative } from './analysis';
import type { InningsCard, MatchBundle } from './match';
import { ballLabel } from './matchDetails';

/**
 * The numbers behind The story tiles of the Match Analysis: Win probability, Par score and the Chase tracker. They are worked out from the ball
 * files of the two innings (and the par file of the match), so they agree with the scorecard. Win probability and the projected finish are the tracked values only and are never estimated.
 */

/** The share of the balls of a match that must carry the win probability for its chart to be drawn (Ari, 2026-10-16). */
export const WIN_MIN = 0.9;

export interface WinPoint {
  /** Position along the whole match, from the first ball of the first innings. */
  x: number;
  /** The chance that the side that batted first wins, 0 to 100. The second innings is flipped. */
  p: number;
  innings: 1 | 2;
  wicket: boolean;
  /** "Over 12.3" style label of the ball. */
  label: string;
  /** The score of the innings after the ball, "98/3". */
  score: string;
}

/** The share of the balls of the two main innings that have a win probability. */
export function winCoverage(files: ReadonlyMap<number, BallFile>, innings: readonly InningsCard[]): number {
  let n = 0, have = 0;
  for (const i of innings.slice(0, 2)) {
    const f = files.get(i.n);
    if (!f) return 0;
    n += f.d.length;
    have += f.wp.filter((v) => v >= 0).length;
  }
  return n > 0 ? have / n : 0;
}

/** One point for each ball of the two innings, with the win chance of the side that batted first. */
export function winSeries(b: MatchBundle, innings: readonly InningsCard[], files: ReadonlyMap<number, BallFile>): WinPoint[] {
  const out: WinPoint[] = [];
  let x = 0;
  innings.slice(0, 2).forEach((inn, k) => {
    const f = files.get(inn.n);
    if (!f) return;
    let score = 0, wickets = 0, last = -1;
    for (let i = 0; i < f.d.length; i++) {
      score += f.rb[i]! + f.wd[i]! + f.nb[i]! + f.by[i]! + f.lb[i]! + f.pe[i]!;
      wickets += f.w[i]!;
      const wp = f.wp[i]!;
      // A ball with no value keeps the chance before it (a few balls are left out), and one before any value has none to show.
      const p = wp >= 0 ? (k === 0 ? wp : 100 - wp) : last;
      if (p >= 0) last = p;
      x += 1;
      if (p < 0) continue;
      out.push({ x, p, innings: (k + 1) as 1 | 2, wicket: f.w[i]! > 0, label: `${b.match.kind === 'hundred' ? 'Ball' : 'Over'} ${ballLabel(b, f.ov[i]!, f.sb[i] ?? null)}`, score: `${score}/${wickets}` });
    }
  });
  return out;
}

export interface ChaseRow {
  /** Over (or set of five balls) just finished, from 1. */
  over: number;
  score: number;
  wickets: number;
  needed: number;
  ballsLeft: number;
  /** Runs per over (per 5 balls in The Hundred) needed from here, or null with no ball left. */
  required: number | null;
  /** Runs per over (per 5 balls) so far. */
  current: number;
  /** 10 minus the wickets that fell. */
  inHand: number;
}

export interface Chase { target: number; scheduledBalls: number; revised: boolean; perOver: number; rows: ChaseRow[] }

/**
 * The chase of the second innings at the end of every over: runs needed (target less the score), balls left (the scheduled balls less the legal balls bowled), the rate needed and the rate so far,
 * and the wickets in hand. A revised target uses its own overs. Null when the match had no chase (one innings, or no target).
 */
export function chaseOf(b: MatchBundle, first: InningsCard, second: InningsCard, file: BallFile): Chase | null {
  const hundred = b.match.kind === 'hundred';
  const perOver = hundred ? 5 : b.match.ballsPerOver || 6;
  const target = second.targetRuns ?? first.runs + 1;
  const overs = second.targetOvers ?? b.match.scheduledOvers ?? (hundred ? 20 : null);
  if (target <= 0 || overs === null) return null;
  const scheduled = hundred ? (second.targetOvers ? second.targetOvers * 5 : 100) : Math.round(overs * perOver);
  const stats = overStats(file);
  const cum = cumulative(stats);
  const rows: ChaseRow[] = [];
  let wickets = 0, legal = 0;
  const byOver = new Map<number, number>();
  for (let i = 0; i < file.d.length; i++) if (file.lg[i] === 1) byOver.set(file.ov[i]!, (byOver.get(file.ov[i]!) ?? 0) + 1);
  stats.forEach((s, k) => {
    wickets += s.wickets;
    legal += byOver.get(k) ?? 0;
    const score = cum[k + 1]!;
    const left = Math.max(0, scheduled - legal);
    rows.push({
      over: k + 1, score, wickets, needed: Math.max(0, target - score), ballsLeft: left,
      required: left > 0 ? Math.max(0, target - score) / (left / perOver) : null,
      current: legal > 0 ? score / (legal / perOver) : 0, inHand: Math.max(0, 10 - wickets),
    });
  });
  return { target, scheduledBalls: scheduled, revised: second.targetOvers !== null && second.targetOvers !== undefined && second.targetOvers !== (b.match.scheduledOvers ?? second.targetOvers), perOver, rows };
}

export interface ParData { v: 1; n: number; scope: 'tournament' | 'format'; p25: number[]; p50: number[]; p75: number[] }

export interface ParSeries {
  /** The score after each over, starting with 0 before the first. */
  actual: number[];
  /** The projected final score after each over (the last ball of the over that has one), starting with null before the first. */
  projected: Array<number | null>;
  band: { low: number[]; mid: number[]; high: number[] };
  n: number;
  scope: 'tournament' | 'format';
}

/** The first innings against its band. The projected finish is the tracked value and is left out for an over with none. */
export function parSeries(file: BallFile, par: ParData): ParSeries {
  const stats = overStats(file);
  const actual = cumulative(stats);
  const proj: Array<number | null> = stats.map(() => null);
  for (let i = 0; i < file.d.length; i++) if (file.ps && file.ps[i]! >= 0) proj[file.ov[i]!] = file.ps[i]!;
  return { actual, projected: [null, ...proj], band: { low: [0, ...par.p25], mid: [0, ...par.p50], high: [0, ...par.p75] }, n: par.n, scope: par.scope };
}
