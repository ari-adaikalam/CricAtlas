// Colours from the team colour table. Only colour values, never a logo.
import table from '../data/teamColours.json';

const COLOURS: Record<string, readonly string[] | undefined> = table;

/** A team's primary and secondary colour from the table, or null when it has no such team. */
export function teamPalette(team: string | null | undefined): { primary: string; secondary: string } | null {
  const set = team ? COLOURS[team] : undefined;
  return set && set[0] ? { primary: set[0], secondary: set[1] ?? set[0] } : null;
}

/** The primary colour of a team, or null when the table has no such team. */
export function teamColour(team: string | null | undefined): string | null {
  return team ? COLOURS[team]?.[0] ?? null : null;
}

/**
 * What sits behind a player's photo and under their initials: their country's colour, with ink that reads on it (Ari, 2026-10-19). Photos are cut out, so this colour shows
 * around the player. A country the table does not have gets nothing, and the circle keeps the brand gradient of the stylesheet.
 */
export function photoBackdrop(country: string | null | undefined): { background: string; color: '#111' | '#fff' } | undefined {
  const colour = teamColour(country);
  return colour ? { background: colour, color: inkFor(colour) } : undefined;
}

/** Relative luminance, 0 (black) to 1 (white), as in WCAG. */
export function luminance(hex: string): number {
  const channel = (i: number) => { const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Dark ink on a light colour, white ink on a dark one, whichever reads better. */
export function inkFor(hex: string): '#111' | '#fff' {
  const l = luminance(hex);
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#111' : '#fff';
}

// ---- Chart colours that follow the player's team ----

/** The fixed pair of the design. A series that has no team colour keeps its own one of these. */
export const GOLD = '#EBC862';
export const SKY = '#56B4E9';

/** The panel colour behind a chart, which a team colour has to read against. */
const PANEL = '#1c1c1c';

type Rgb = readonly [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
const toHex = (c: Rgb): string => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const linear = (v: number): number => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };

/** Contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Mixes a team colour toward white until it reaches a 3 to 1 contrast on the dark panel, which is the level for graphics. A colour that already reads is kept.
 * Hue stays, so Mumbai blue is still blue.
 */
export function liftForDark(hex: string): string {
  let c = toRgb(hex);
  for (let step = 0; step < 20 && contrast(toHex(c), PANEL) < 3; step++) c = c.map((v) => v + (255 - v) * 0.12) as unknown as Rgb;
  return toHex(c);
}

// Colour blindness simulation (Machado et al. 2009, full severity), applied in linear RGB.
const BLIND: ReadonlyArray<readonly number[]> = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1],
  [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
];

function oklab(c: Rgb, m: readonly number[]): readonly [number, number, number] {
  const [r, g, b] = [linear(c[0]), linear(c[1]), linear(c[2])];
  const [sr, sg, sb] = [m[0]! * r + m[1]! * g + m[2]! * b, m[3]! * r + m[4]! * g + m[5]! * b, m[6]! * r + m[7]! * g + m[8]! * b];
  const l = Math.cbrt(0.4122214708 * sr + 0.5363325363 * sg + 0.0514459929 * sb);
  const mm = Math.cbrt(0.2119034982 * sr + 0.6806995451 * sg + 0.1073969566 * sb);
  const s = Math.cbrt(0.0883024619 * sr + 0.2817188376 * sg + 0.6299787005 * sb);
  return [0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s];
}

/** How far apart two colours look to the people who see them least apart: the smallest OKLab distance (times 100) across normal, protan and deutan sight. */
export function separation(a: string, b: string): number {
  const [ca, cb] = [toRgb(a), toRgb(b)];
  return Math.min(...BLIND.map((m) => { const [x, y] = [oklab(ca, m), oklab(cb, m)]; return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }));
}

export interface ChartColours { main: string; second: string }

/**
 * The pair every chart on a page draws with. The main colour is the team colour, lifted to read on the panel, and the second one is whichever of the fixed
 * gold and sky is easier to tell from it. With no team colour the pair is gold and sky, which is what the mockups use.
 */
export function chartColours(team: string | null): ChartColours {
  if (!team) return { main: GOLD, second: SKY };
  const main = liftForDark(team);
  const second = separation(main, SKY) >= separation(main, GOLD) ? SKY : GOLD;
  return { main, second };
}

export interface ScopeTeam { team: string; matches: number }

/**
 * The colour a player's charts use under the current scope. One team in scope gives that team's colour (India for Kohli in Tests, Bangalore in the IPL).
 * Several teams with different colours (a career, or T20s that mix country and clubs) give the player's country colour, the same as the avatar. A team the table lacks falls through to
 * the country, and then to null, which means the fixed pair.
 */
export function scopeTeamColour(teams: readonly ScopeTeam[], country: string | null | undefined): string | null {
  // A renamed franchise (Bangalore and Bengaluru) has one colour under both names, so it counts as one team here.
  const colours = new Set(teams.map((t) => teamColour(t.team)));
  const only = colours.size === 1 ? [...colours][0] ?? null : null;
  return only ?? teamColour(country);
}

/** A colour as rgba text at the given opacity, for a heat map cell. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

/** Two colours that look alike to someone with normal or colour-blind sight are under this apart. */
export const TOO_CLOSE = 10;

/**
 * The colours of the two sides of a comparison, for two teams, two players (by their team or country) or a mix (Ari, 2026-10-24: use dynamic colours everywhere possible). Each side is its
 * team's primary colour, lifted to read on the panel. When the two are too close, which is the case for two players of the same team, the second side takes its team's secondary colour
 * (India blue against India orange), and when that is still too close the fixed gold or sky, whichever is easier to tell from the first. A side with no colour in the table keeps gold (first)
 * or sky (second), or the one of the two that tells it apart from the other side.
 */
export function sideColours(a: string | null | undefined, b: string | null | undefined): { a: string; b: string } {
  const [pa, pb] = [teamPalette(a), teamPalette(b)];
  if (!pa && !pb) return { a: GOLD, b: SKY };
  if (pa && !pb) { const first = liftForDark(pa.primary); return { a: first, b: separation(first, SKY) >= separation(first, GOLD) ? SKY : GOLD }; }
  if (!pa && pb) { const second = liftForDark(pb.primary); return { a: separation(second, GOLD) >= separation(second, SKY) ? GOLD : SKY, b: second }; }
  const first = liftForDark(pa!.primary);
  const tooClose = (x: string): boolean => separation(first, x) < TOO_CLOSE;
  let second = liftForDark(pb!.primary);
  if (tooClose(second)) second = liftForDark(pb!.secondary);
  if (tooClose(second)) second = separation(first, SKY) >= separation(first, GOLD) ? SKY : GOLD;
  return { a: first, b: second };
}
