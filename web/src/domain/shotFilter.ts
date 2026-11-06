import { insideRing } from './wagon';
import type { Shot } from './shots';

// The Shot select of the wagon wheel and the Sixes tile: the tracked labels as they come, no mapping.
// The most common ones in the player's balls are listed, and the rest sit under Other shots. Decided with Ari on 2026-10-18.

/** How many labels the Shot select lists before Other shots. */
export const TOP_LABELS = 9;

/** The tracked labels start in lower case. The app shows them in sentence case. */
export const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export interface ShotBalls { shot: string; balls: number }

/** The most common labels among a player's balls, most common first. Ties go in alphabetical order so the list never shuffles. */
export function topLabels(counts: readonly ShotBalls[], limit = TOP_LABELS): string[] {
  return [...counts].sort((a, b) => b.balls - a.balls || a.shot.localeCompare(b.shot)).slice(0, limit).map((c) => c.shot);
}

export interface ShotOption { value: string; label: string; count: number }

/**
 * The choices, with how many of the chart's shots each one holds, so an empty choice can be greyed. Values: empty is all shots,
 * `s:` one label, `other` every label not listed. A shot with no label counts under All shots only.
 */
export function shotOptions(top: readonly string[], shots: readonly Shot[]): ShotOption[] {
  const count = (pick: (s: Shot) => boolean): number => shots.reduce((a, s) => a + (pick(s) ? 1 : 0), 0);
  return [
    { value: '', label: 'All shots', count: shots.length },
    ...top.map((l) => ({ value: `s:${l}`, label: sentence(l), count: count((s) => s.shot === l) })),
    { value: 'other', label: 'Other shots', count: count((s) => s.shot !== null && !top.includes(s.shot)) },
  ];
}

/** The shots a choice keeps. */
export function inShotChoice(shots: readonly Shot[], value: string, top: readonly string[]): Shot[] {
  if (value.startsWith('s:')) { const l = value.slice(2); return shots.filter((s) => s.shot === l); }
  if (value === 'other') return shots.filter((s) => s.shot !== null && !top.includes(s.shot));
  return [...shots];
}

export type Ring = 'any' | 'inside' | 'outside';
export const RING_OPTIONS: ReadonlyArray<{ value: Ring; label: string }> = [{ value: 'any', label: 'Anywhere' }, { value: 'inside', label: 'Inside the ring' }, { value: 'outside', label: 'Outside the ring' }];

/** Where the ball went, from the raw position and the one ring rule in domain/wagon. */
export function inRing(shots: readonly Shot[], ring: Ring): Shot[] {
  if (ring === 'any') return [...shots];
  return shots.filter((s) => insideRing(s.x, s.y) === (ring === 'inside'));
}
