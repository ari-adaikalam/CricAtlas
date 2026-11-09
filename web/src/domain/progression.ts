// The Progression tiles (bowling) and Innings progression (batting): how a bowler's economy builds through a spell, and how often wickets fall, by the bowler's own ball number in an innings.
// Method decided with Ari on 2026-10-18: a running economy for the typical innings, with a band for the middle half.

/** The first balls of a spell the tile covers: 120 in Tests, 60 in ODIs, 24 in T20s and 20 in The Hundred. A scope that mixes formats uses the longest. */
export function progressionSpan(formats: ReadonlySet<string>, hundredOnly: boolean): number {
  if (formats.has('TEST')) return 120;
  if (formats.has('ODI')) return 60;
  return hundredOnly ? 20 : 24;
}

/** The balls of an innings the batting tile covers: 150 in Tests, 120 in ODIs, 60 in T20s and 50 in The Hundred. A scope that mixes formats uses the longest. */
export function battingSpan(formats: ReadonlySet<string>, hundredOnly: boolean): number {
  if (formats.has('TEST')) return 150;
  if (formats.has('ODI')) return 120;
  return hundredOnly ? 50 : 60;
}

/** The most balls of a spell any format uses, so a loader never reads further. */
export const PROGRESSION_SPAN_MAX = 150;

/** An economy point needs at least this many innings that reached the ball, so one long spell cannot draw the right end of the line. */
export const PROGRESSION_MINIMUM = 10;
export const PROGRESSION_BINS = 8;

/** One legal ball of an innings: its number in the bowler's spell, the runs charged up to and including it, and whether it took a wicket. */
export interface ProgressionBall { innings: string; ball: number; runs: number; wicket: boolean }

export interface EconomyPoint { ball: number; innings: number; median: number; low: number; high: number }
export interface WicketBin { from: number; to: number; balls: number; wickets: number; per100: number }

/** The value below which a share p of the values fall, by linear interpolation between the neighbours. */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const at = (sorted.length - 1) * p, lo = Math.floor(at), hi = Math.ceil(at);
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (at - lo);
}

/**
 * The running economy at each ball number, taken across the innings that reached it: the median is the line and the quartiles are the band. The economy of an
 * innings at ball k is its runs so far over k balls, scaled to an over of `ballsPerOver`. Balls beyond the span are not used.
 */
export function economyByBall(balls: readonly ProgressionBall[], span: number, ballsPerOver = 6, minimum = PROGRESSION_MINIMUM): EconomyPoint[] {
  const byBall = new Map<number, number[]>();
  for (const b of balls) if (b.ball >= 1 && b.ball <= span) { const list = byBall.get(b.ball) ?? []; list.push((b.runs / b.ball) * ballsPerOver); byBall.set(b.ball, list); }
  const out: EconomyPoint[] = [];
  for (let k = 1; k <= span; k++) {
    const values = (byBall.get(k) ?? []).sort((a, b) => a - b);
    if (values.length >= minimum) out.push({ ball: k, innings: values.length, median: quantile(values, 0.5), low: quantile(values, 0.25), high: quantile(values, 0.75) });
  }
  return out;
}

/** Wickets per 100 balls in eight bins of the spell, from all balls pooled. Edges are rounded so an odd span (60 balls in eight bins) still tiles it. */
export function wicketsByBin(balls: readonly ProgressionBall[], span: number, bins = PROGRESSION_BINS): WicketBin[] {
  const edges = Array.from({ length: bins + 1 }, (_, i) => Math.round((i * span) / bins));
  const out: WicketBin[] = Array.from({ length: bins }, (_, i) => ({ from: (edges[i] ?? 0) + 1, to: edges[i + 1] ?? span, balls: 0, wickets: 0, per100: 0 }));
  for (const b of balls) {
    if (b.ball < 1 || b.ball > span) continue;
    const bin = out.find((o) => b.ball >= o.from && b.ball <= o.to);
    if (bin) { bin.balls++; if (b.wicket) bin.wickets++; }
  }
  return out.map((o) => ({ ...o, per100: o.balls > 0 ? (100 * o.wickets) / o.balls : 0 }));
}
