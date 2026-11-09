// The Home page hero: one real innings, replayed ball by ball. Only the choice of innings is curated. Everything the hero shows is read from the match bundle and the innings' ball file,
// so a correction in the data reaches the page. The wagon wheel geometry is the dataset's own (domain/wagon.ts).

import type { BallFile } from './ballByBall';
import { dateText } from './dates';
import { resultText, type InningsCard, type MatchBundle } from './match';
import type { Shot } from './shots';
import { shotsOf, trackedBalls } from './tracking';
import type { Hand } from './wagon';

export interface HeroSpec { matchId: number; innings: number; batterId: string }

/** Ari's rotation (2026-10-24): chases that were won with the batter not out. More can come from Ari; the order here is the order they play in. */
export const HERO_INNINGS: readonly HeroSpec[] = [
  { matchId: 1298150, innings: 2, batterId: 'ba607b88' }, // V Kohli 82* off 53, T20 World Cup 2022, chasing 160
  { matchId: 1529228, innings: 2, batterId: 'b4b99816' }, // Shubman Gill 223* off 133, ODI 2026, chasing 406
  { matchId: 1136620, innings: 2, batterId: '4329fbb5' }, // SR Watson 117* off 57, IPL final 2018, chasing 179
  { matchId: 1490442, innings: 2, batterId: 'cb08b611' }, // JI Rodrigues 127* off 134, Women's World Cup semi-final 2025, chasing 339
  { matchId: 1512771, innings: 2, batterId: 'bf74b130' }, // FH Allen 100* off 33, Men's T20 World Cup semi-final 2026, chasing 170
  { matchId: 1490429, innings: 2, batterId: '321644de' }, // AJ Healy 113* off 77, Women's World Cup 2025, chasing 199
];

/** The state of the innings after one ball. `legal` counts the balls bowled so far, `faced` the balls the hero has faced (a wide is not a ball faced). */
export interface ReplayPoint { team: number; hero: number; faced: number; wkts: number; legal: number; out: boolean; boundary: 0 | 4 | 6 }

export interface Replay {
  matchId: number;
  innings: number;
  hero: { id: string; name: string; hand: Hand };
  batting: string;
  bowling: string;
  /** "Men's Cricket World Cup, Final, 2 Apr 2011": the competition, the stage when it has one, and the date. The ground is left out so the line always fits. */
  kicker: string;
  result: string;
  scheduledOvers: number;
  ballsPerOver: number;
  target: number | null;
  points: ReplayPoint[];
  /** Every ball the hero faced that has a recorded position, as the Analysis wagon wheel draws them (dot balls too). Empty when the innings has no tracking: the page then hides the wheel. */
  shots: Shot[];
  /** How many of `shots` have happened after each ball, for the wheel's playhead. */
  shotCount: number[];
  /** 50, 100, 150 and so on: the first ball at which the hero reached each, as an index into `points`. */
  milestones: Array<[number, number]>;
  heroRuns: number;
  heroBalls: number;
  heroOut: boolean;
  teamRuns: number;
}

/** Overs as cricket writes them: whole overs, a dot, then the balls into the next ("13.4" for 82 balls of six-ball overs). */
export function oversText(legalBalls: number, ballsPerOver: number): string {
  return `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`;
}

export function kickerOf(b: MatchBundle): string {
  const m = b.match;
  return [m.tournament.name, m.stage.name, dateText(m.date)].filter((x): x is string => Boolean(x)).join(', ');
}

/** The replay of one innings for one batter, or null when the batter is not in the file. */
export function buildReplay(bundle: MatchBundle, inn: InningsCard, file: BallFile, heroId: string): Replay | null {
  const heroIndex = file.pl.findIndex(([, id]) => id === heroId);
  const card = inn.batters.find((c) => c.id === heroId);
  if (heroIndex < 0 || !card) return null;
  const outDelivery = card.out && !card.out.type.startsWith('retired') ? card.out.delivery : -1;
  const points: ReplayPoint[] = [];
  let team = 0, hero = 0, faced = 0, wkts = 0, legal = 0, out = false;
  for (let i = 0; i < file.d.length; i++) {
    const isHero = file.st[i] === heroIndex;
    team += file.rb[i]! + file.wd[i]! + file.nb[i]! + file.by[i]! + file.lb[i]! + file.pe[i]!;
    wkts += file.w[i]!;
    if (file.lg[i]) legal += 1;
    if (isHero && file.wd[i] === 0) faced += 1;
    if (isHero) hero += file.rb[i]!;
    if (file.d[i] === outDelivery) out = true;
    const boundary = isHero && (file.rb[i] === 4 || file.rb[i] === 6) ? (file.rb[i] as 4 | 6) : 0;
    points.push({ team, hero, faced, wkts, legal, out, boundary });
  }
  const last = points[points.length - 1];
  if (!last) return null;
  // The wheel's shots are the tracked balls the hero faced, worked out the way the Match page does it, so both wheels agree.
  const tracked = trackedBalls(inn, file);
  const shots = shotsOf(tracked.filter((b) => b.batter?.id === heroId && !b.wide));
  const placed = tracked.map((b) => b.batter?.id === heroId && !b.wide && b.x >= 0 && b.y >= 0);
  const shotCount: number[] = [];
  let seen = 0;
  for (const has of placed) { if (has) seen += 1; shotCount.push(seen); }
  const other = bundle.match.teams.find((t) => t.name !== inn.team)?.name ?? '';
  const milestones: Array<[number, number]> = [];
  for (const m of [50, 100, 150, 200, 250, 300]) {
    const k = points.findIndex((p) => p.hero >= m);
    if (k >= 0) milestones.push([m, k]);
  }
  const hand = (file.ph?.[heroIndex] === 'L' ? 'L' : 'R') as Hand;
  return {
    matchId: bundle.match.id, innings: inn.n, hero: { id: heroId, name: card.name, hand }, batting: inn.team, bowling: other,
    kicker: kickerOf(bundle), result: resultText(bundle), scheduledOvers: bundle.match.scheduledOvers ?? 0, ballsPerOver: bundle.match.ballsPerOver,
    target: inn.targetRuns ?? null, points, shots, shotCount, milestones, heroRuns: last.hero, heroBalls: last.faced, heroOut: last.out, teamRuns: last.team,
  };
}

/** A score as it is written: "82*" when the batter is not out. */
export function scoreText(runs: number, out: boolean): string {
  return `${runs}${out ? '' : '*'}`;
}

/** The result as the panel writes it: the batting side's own win reads "Won by 8 wickets, with 9 balls left", since its name is already on the line above. */
export function resultInPanel(r: Pick<Replay, 'result' | 'batting'>): string {
  return r.result.startsWith(`${r.batting} won`) ? `Won${r.result.slice(r.batting.length + 4)}` : r.result;
}

/** What a chase still needs after ball `ball`, "Need 112 from 66 balls", or null when it is not a chase, the target is met or the balls are gone. */
export function needText(r: Pick<Replay, 'target' | 'points' | 'scheduledOvers' | 'ballsPerOver'>, ball: number): string | null {
  const p = r.points[ball];
  if (!p || r.target === null) return null;
  const need = r.target - p.team;
  const left = r.scheduledOvers * r.ballsPerOver - p.legal;
  return need > 0 && left > 0 ? `Need ${need} from ${left} ${left === 1 ? 'ball' : 'balls'}` : null;
}
