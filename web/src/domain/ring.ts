import type { Shot } from './shots';
import { boundaryFraction, insideRing } from './wagon';

// The Ring tile: where the runs came from by distance. The bands are cut with the one wagon rule (domain/wagon): inside the 30 yard ring, then outside it up to
// 0.75 of the way to the boundary, then 0.75 to the boundary, then beyond it (Ari, 2026-10-18). Distance is never shown in metres.

export interface RingBand { key: string; label: string; balls: number; runs: number; strikeRate: number | null; share: number }

export const RING_BANDS = [
  { key: 'inside', label: 'Inside the ring' },
  { key: 'ringToMid', label: 'Ring to halfway' },
  { key: 'midToRope', label: 'Halfway to the boundary' },
  { key: 'beyond', label: 'Beyond the boundary' },
] as const;

/** The edges of the outer bands, as a share of the way to the boundary. */
export const MID_DISTANCE = 0.75;

export function bandOf(x: number, y: number): number {
  if (insideRing(x, y)) return 0;
  const f = boundaryFraction(x, y);
  return f < MID_DISTANCE ? 1 : f < 1 ? 2 : 3;
}

/** The four bands, in order, from every ball with a position (dot balls included, so a strike rate is runs over balls). A share is of all the runs. */
export function ringBands(balls: readonly Shot[]): { bands: RingBand[]; insideShare: number; runs: number } {
  const counts = RING_BANDS.map(() => ({ balls: 0, runs: 0 }));
  for (const s of balls) { const c = counts[bandOf(s.x, s.y)]!; c.balls += 1; c.runs += s.runs; }
  const total = counts.reduce((a, c) => a + c.runs, 0);
  const bands = RING_BANDS.map((b, i) => ({ key: b.key, label: b.label, balls: counts[i]!.balls, runs: counts[i]!.runs, strikeRate: counts[i]!.balls > 0 ? (100 * counts[i]!.runs) / counts[i]!.balls : null, share: total > 0 ? counts[i]!.runs / total : 0 }));
  return { bands, insideShare: bands[0]!.share, runs: total };
}
