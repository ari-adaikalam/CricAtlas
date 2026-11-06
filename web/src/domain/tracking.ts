import type { BallFile } from './ballByBall';
import { creditedToBowler } from './analysis';
import type { InningsCard, MatchBundle } from './match';
import { phasesOf } from './matchDetails';
import type { PitchRow } from './pitch';
import { BANDS, LANES } from './pitch';
import type { ShotMixCell } from './shotMix';
import type { Shot } from './shots';

/**
 * The balls the tracking tiles of the Match Analysis draw: the wagon wheel, Shot mix, the Ring, the Pitch map and the Wicket map. Each is worked out from the ball file of
 * an innings (shot, line, length and control, and the position on the ground), so every tile agrees with the scorecard. The tracked labels are used as they come and nothing is guessed: a ball with no
 * value for a field is not in the tile that needs it.
 */

export type Hand = 'R' | 'L' | '';

export interface TrackedBall {
  innings: number;
  /** The side batting. */
  team: string;
  batter: { name: string; id: string | null } | null;
  bowler: { name: string; id: string | null } | null;
  hand: Hand;
  /** Runs off the bat. */
  runs: number;
  /** A legal delivery. */
  legal: boolean;
  /** A wide: not a ball faced. */
  wide: boolean;
  /** A wicket fell on the ball. */
  out: boolean;
  /** The wicket was a catch. */
  caught: boolean;
  /** A wicket the bowler is credited with. */
  bowlerOut: boolean;
  shot: string | null;
  line: string | null;
  length: string | null;
  control: 1 | 0 | null;
  x: number;
  y: number;
  over: number;
  ballInOver: number;
  /** The phase of the over in this innings (powerplay, middle, death, rest, or a block of 20 overs in a Test), or empty. */
  phase: string;
}

const who = (f: BallFile, k: number): { name: string; id: string | null } | null => (k < 0 || !f.pl[k] ? null : { name: f.pl[k]![0], id: f.pl[k]![1] });

/** Every ball of an innings with the fields the tracking tiles read. */
export function trackedBalls(inn: InningsCard, f: BallFile): TrackedBall[] {
  const phases = phasesOf(inn);
  const phaseOf = (over: number): string => phases.find((p) => over >= p.firstOver && over <= p.lastOver)?.key ?? '';
  const credited = new Set<number>();
  for (const c of inn.batters) if (c.out && creditedToBowler(c.out.type)) credited.add(c.out.delivery);
  const caught = new Set<number>();
  for (const c of inn.batters) if (c.out && c.out.type.startsWith('caught')) caught.add(c.out.delivery);
  const out: TrackedBall[] = [];
  let legalIn = 0, last = -1;
  for (let i = 0; i < f.d.length; i++) {
    const ov = f.ov[i]!;
    if (ov !== last) { legalIn = 0; last = ov; }
    const legal = f.lg[i] === 1;
    if (legal) legalIn += 1;
    const st = f.st[i]!;
    const hand = st >= 0 ? ((f.ph?.[st] as Hand | undefined) ?? '') : '';
    out.push({
      innings: inn.n, team: inn.team, batter: who(f, st), bowler: who(f, f.bo[i]!), hand,
      runs: f.rb[i]!, legal, wide: f.wd[i]! > 0, out: f.w[i]! > 0, caught: f.w[i]! > 0 && caught.has(f.d[i]!), bowlerOut: f.w[i]! > 0 && credited.has(f.d[i]!),
      shot: f.sh[i]! >= 0 ? f.shots[f.sh[i]!]! : null,
      line: f.ln[i]! >= 0 ? f.lines[f.ln[i]!]! : null,
      length: f.le[i]! >= 0 ? f.lens[f.le[i]!]! : null,
      control: f.ct[i] === 1 ? 1 : f.ct[i] === 0 ? 0 : null,
      x: f.wx?.[i] ?? -1, y: f.wy?.[i] ?? -1,
      over: ov + 1, ballInOver: Math.max(1, legalIn), phase: phaseOf(ov),
    });
  }
  return out;
}

/** A ball placed on the ground. */
export const hasPosition = (b: TrackedBall): boolean => b.x >= 0 && b.y >= 0;

/** The balls for the wagon wheel and the Ring: every ball with a position (dot balls too), as the player page does. */
export function shotsOf(balls: readonly TrackedBall[]): Shot[] {
  return balls.filter(hasPosition).map((b) => ({ x: b.x, y: b.y, runs: b.runs, out: b.out, caught: b.caught, shot: b.shot, bowler: b.bowler?.name ?? null, over: b.over, ballInOver: b.ballInOver }));
}

/** The balls bowled for the pitch map and the wicket map: legal deliveries, grouped by tracked length and line. */
export function pitchRowsOf(balls: readonly TrackedBall[]): { rows: PitchRow[]; bowled: number; tracked: number } {
  const map = new Map<string, PitchRow>();
  let bowled = 0, tracked = 0;
  for (const b of balls) {
    if (!b.legal) continue;
    bowled += 1;
    if (b.length === null || b.line === null) continue;
    tracked += 1;
    const key = `${b.length}|${b.line}`;
    let r = map.get(key);
    if (!r) { r = { length: b.length, line: b.line, balls: 0, dots: 0, scoring: 0, fours: 0, sixes: 0, wickets: 0, runs: 0, inControl: 0, controlKnown: 0 }; map.set(key, r); }
    r.balls += 1;
    r.runs += b.runs;
    if (b.runs === 0) r.dots += 1; else if (b.runs <= 3) r.scoring += 1; else if (b.runs === 4) r.fours += 1; else if (b.runs >= 6) r.sixes += 1; else r.scoring += 1;
    if (b.bowlerOut) r.wickets += 1;
    if (b.control !== null) { r.controlKnown += 1; r.inControl += b.control; }
  }
  return { rows: [...map.values()], bowled, tracked };
}

/** Shot mix cells: for each shot label and phase, the balls faced (a wide is not one), runs, outs and control. Only balls with a label are in it. */
export function shotMixCellsOf(balls: readonly TrackedBall[]): ShotMixCell[] {
  const map = new Map<string, ShotMixCell>();
  for (const b of balls) {
    if (b.shot === null || b.wide) continue;
    const key = `${b.shot}|${b.phase}`;
    let c = map.get(key);
    if (!c) { c = { shot: b.shot, key: b.phase || null, balls: 0, runs: 0, outs: 0, controlKnown: 0, inControl: 0 }; map.set(key, c); }
    c.balls += 1; c.runs += b.runs; c.outs += b.out ? 1 : 0;
    if (b.control !== null) { c.controlKnown += 1; c.inControl += b.control; }
  }
  return [...map.values()];
}

/** The cells of the Wicket map: wickets credited to the bowler by length (rows) and line (columns), over the balls bowled in each cell. */
export interface WicketCell { balls: number; wickets: number }
export function wicketGrid(rows: readonly PitchRow[]): WicketCell[][] {
  const grid = BANDS.map(() => LANES.map((): WicketCell => ({ balls: 0, wickets: 0 })));
  for (const r of rows) {
    const j = BANDS.findIndex((b) => b.key === r.length), i = LANES.findIndex((l) => l.key === r.line);
    if (j < 0 || i < 0) continue;
    grid[j]![i]!.balls += r.balls;
    grid[j]![i]!.wickets += r.wickets;
  }
  return grid;
}

export interface Chip { id: string; name: string; hand: Hand; weight: number; balls: number }
/** The players of one side in the order the chips use: batters by runs (then balls faced), bowlers by wickets (then balls bowled). */
export function rankPlayers(balls: readonly TrackedBall[], role: 'bat' | 'bowl'): Chip[] {
  const map = new Map<string, Chip & { second: number }>();
  for (const b of balls) {
    const p = role === 'bat' ? b.batter : b.bowler;
    if (!p) continue;
    const id = p.id ?? p.name;
    let c = map.get(id);
    if (!c) { c = { id, name: p.name, hand: role === 'bat' ? b.hand : '', weight: 0, balls: 0, second: 0 }; map.set(id, c); }
    if (role === 'bat') { c.weight += b.runs; if (!b.wide) c.balls += 1; } else { c.weight += b.bowlerOut ? 1 : 0; if (b.legal) c.balls += 1; }
  }
  return [...map.values()].sort((a, z) => z.weight - a.weight || z.balls - a.balls || a.name.localeCompare(z.name));
}

/** Who the second row of chips picks: one named player, or a group of them. */
export type Against = { kind: 'all' } | { kind: 'hand'; hand: 'R' | 'L' } | { kind: 'player'; id: string };

/** The balls of a panel: the side's balls, narrowed to one player of the chosen role and to the group of the other role the Against row names. */
export function pick(balls: readonly TrackedBall[], role: 'bat' | 'bowl', who: string | null, against: Against): TrackedBall[] {
  const idOf = (p: { name: string; id: string | null } | null): string | null => (p ? p.id ?? p.name : null);
  return balls.filter((b) => {
    if (who !== null && idOf(role === 'bat' ? b.batter : b.bowler) !== who) return false;
    if (against.kind === 'player') return idOf(role === 'bat' ? b.bowler : b.batter) === against.id;
    if (against.kind === 'hand') return role === 'bat' ? true : b.hand === against.hand;
    return true;
  });
}

/** The sample line under the chips: "41 balls, 38 with tracking". */
export function sampleLine(balls: readonly TrackedBall[], withField: (b: TrackedBall) => boolean, word = 'balls'): string {
  const n = balls.filter((b) => b.legal || !b.wide).length;
  const t = balls.filter((b) => (b.legal || !b.wide) && withField(b)).length;
  return `${n} ${n === 1 ? word.replace(/s$/, '') : word}, ${t} with tracking`;
}

/** The share of the balls of the match that carry a tracking field, for the rule that a chart is drawn when at least 30% do. */
export const TRACKED_MIN = 0.3;
export function enoughTracking(bundle: MatchBundle, field: 'tracked' | 'positioned' | 'pitched'): boolean {
  const n = bundle.coverage.balls;
  // A bundle built before `pitched` existed falls back to the looser `tracked` count.
  return n > 0 && (bundle.coverage[field] ?? bundle.coverage.tracked) / n >= TRACKED_MIN;
}
