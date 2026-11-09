import { BANDS, lanesFor, LANES } from './pitch';
import type { Hand } from './wagon';

// The Shot control tile and the False shot trend: how often the batter was in control, by the line and length of the ball, and how the false shot rate moves from
// innings to innings. A false shot is a ball marked 'not in control' (a miss, an edge, a mistimed shot). Balls with no control reading are left out of both
// shares (Ari, 2026-10-18).

/** Balls faced with a line, a length and a control reading, grouped. */
export interface ControlRow { length: string; line: string; known: number; inControl: number }

export interface ControlCell { balls: number; share: number | null }

/** A grid of the six lengths (rows, full toss first) by the five lines (columns, in the batter's own view: a left-hander's lines are reversed). */
export function controlGrid(rows: readonly ControlRow[], hand: Hand): { lanes: readonly string[]; cells: ControlCell[][] } {
  const lanes = lanesFor(hand);
  const cells = BANDS.map((b) => lanes.map((l) => {
    const hit = rows.filter((r) => r.length === b.key && r.line === l.key);
    const known = hit.reduce((a, r) => a + r.known, 0), inControl = hit.reduce((a, r) => a + r.inControl, 0);
    return { balls: known, share: known > 0 ? inControl / known : null };
  }));
  return { lanes: lanes.map((l) => l.short), cells };
}

export const KNOWN_LINES = LANES.map((l) => l.key);

/** An innings needs this many balls with a control reading to have a false shot rate, so a short innings cannot draw a 0 or 100 percent bar. */
export const FALSE_SHOT_MINIMUM = 10;
export const FALSE_SHOT_INNINGS = 15;

export interface FalseShotInnings { known: number; falseShots: number; date: string; opponent: string }
export interface FalseShotPoint extends FalseShotInnings { rate: number }

/** The latest innings with enough balls, oldest first, each with its own false shot rate in percent, and the average of the shown innings from their own totals. */
export function falseShotTrend(innings: readonly FalseShotInnings[], limit = FALSE_SHOT_INNINGS): { points: FalseShotPoint[]; average: number | null } {
  const enough = innings.filter((i) => i.known >= FALSE_SHOT_MINIMUM).slice(-limit);
  const points = enough.map((i) => ({ ...i, rate: (100 * i.falseShots) / i.known }));
  const known = enough.reduce((a, i) => a + i.known, 0), falses = enough.reduce((a, i) => a + i.falseShots, 0);
  return { points, average: known > 0 ? (100 * falses) / known : null };
}
