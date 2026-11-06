import colours from '../data/teamColours.json';
import shorts from '../data/teamShorts.json';
import { GOLD, SKY, liftForDark, separation } from './colours';

// The generated team emblem: no real logo is used. Three styles exist: E stumps, B roundel, D split disc.
// The style is chosen here, not in the page (Ari, 2026-10-20: the switch is for the owner only): change DEFAULT_EMBLEM, or set localStorage.emblem to E, B or D in one browser to try another.

export type EmblemStyle = 'E' | 'B' | 'D';
export const DEFAULT_EMBLEM: EmblemStyle = 'B';
export const EMBLEM_KEY = 'emblem';

const COLOURS: Record<string, readonly string[] | undefined> = colours;
const SHORTS: Record<string, string | undefined> = shorts;

export interface EmblemFacts { name: string; short: string; c1: string; c2: string; c3: string }

const NEUTRAL = ['#3A3A3A', '#8A8A8A', '#CFCFCF'] as const;

/** The letters and colours of a team. A team the table lacks gets a neutral emblem with its initials, so nothing is ever blank. */
export function emblemFacts(team: string): EmblemFacts {
  const c = COLOURS[team] ?? NEUTRAL;
  const letters = SHORTS[team] ?? team.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]!.toUpperCase()).join('');
  return { name: team, short: letters, c1: c[0]!, c2: c[1]!, c3: c[2]! };
}

/** The ink on a colour, as the mockup's emblems choose it: dark on a light colour, white on a dark one. */
export function emblemInk(hex: string): '#141414' | '#FFFFFF' {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? '#141414' : '#FFFFFF';
}

export interface SidePaint { fill: string; ink: '#141414' | '#FFFFFF' }

/**
 * The colours two sides are drawn with on one page: each side's primary colour, lifted to read on the dark panel. When the two look
 * alike to someone with normal or colour-blind sight (a separation under 10) the second side moves to its secondary colour, and when that is still too close to the fixed gold, then sky.
 */
export function pairPaint(first: string, second: string): [SidePaint, SidePaint] {
  const a = liftForDark(emblemFacts(first).c1);
  const facts = emblemFacts(second);
  let b = liftForDark(facts.c1);
  const tooClose = (x: string): boolean => separation(a, x) < 10;
  if (tooClose(b)) b = liftForDark(facts.c2);
  if (tooClose(b)) b = separation(a, SKY) >= separation(a, GOLD) ? SKY : GOLD;
  const paint = (fill: string): SidePaint => ({ fill, ink: emblemInk(fill) });
  return [paint(a), paint(b)];
}
