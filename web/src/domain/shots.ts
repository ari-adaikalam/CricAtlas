import { zoneOf } from './wagon';

/** One shot with tracking (a scoring shot, or a ball that dismissed the batter): where the ball ended up in the 363 by 363 data frame, and what it scored. */
export interface Shot {
  x: number;
  y: number;
  runs: number;
  /** The ball dismissed the batter. Drawn white, whatever the runs. */
  out: boolean;
  /** The dismissal was a catch (caught or caught and bowled). The wheel draws it in the air like a six; a run out and the rest stay on the ground. */
  caught?: boolean;
  shot: string | null;
  bowler: string | null;
  over: number;
  ballInOver: number;
}

export type ShotKind = 'run' | 'four' | 'six';

export const shotKind = (runs: number): ShotKind => (runs >= 6 ? 'six' : runs === 4 ? 'four' : 'run');

export interface ZoneTotal { runs: number; shots: number; fours: number; sixes: number }

/** Runs, shots, fours and sixes in each of the eight zones (index 1 to 8, index 0 unused), for the first `count` shots. */
export function zoneTotals(shots: readonly Shot[], count = shots.length): ZoneTotal[] {
  const totals: ZoneTotal[] = Array.from({ length: 9 }, () => ({ runs: 0, shots: 0, fours: 0, sixes: 0 }));
  const limit = Math.min(count, shots.length);
  for (let i = 0; i < limit; i++) {
    const s = shots[i];
    if (!s) continue;
    const zone = totals[zoneOf(s.x, s.y)];
    if (!zone) continue;
    zone.runs += s.runs; zone.shots += 1;
    if (s.runs === 4) zone.fours += 1;
    if (s.runs >= 6) zone.sixes += 1;
  }
  return totals;
}

/** A left-handed batter's shots sit on the true ground, so only the zone names change. */
export function handOf(battingStyle: string | null): 'R' | 'L' {
  return battingStyle !== null && /left/i.test(battingStyle) ? 'L' : 'R';
}
