import { creditedToBowler, figureLine, oversText, type Figures } from './analysis';
import { ballRows, type BallFile, type BallRow } from './ballByBall';
import type { InningsCard, MatchBundle } from './match';
import { inningsName } from './matchDetails';
import { roundName, superRounds } from './superOver';
import { chaseOf, type Chase } from './story';

/**
 * The numbers behind the Match Replay: every ball of the innings of the match in one line, and the state of the match after any ball of it (score, rates, the
 * batters at the crease, the bowler, the over). Everything is worked out from the ball files and the scorecard, so it agrees with Match details. A Super Over is not in it.
 */

export interface ReplayInnings {
  inn: InningsCard;
  file: BallFile;
  rows: BallRow[];
  /** Balls of the match before this innings. */
  start: number;
  /** The score, wickets and legal balls after each ball of the innings. */
  score: number[];
  wkts: number[];
  legal: number[];
}

export interface Timeline {
  innings: ReplayInnings[];
  /** Every ball of every innings. */
  total: number;
  /** The chase of the second innings of a limited-overs match, for its target and balls left. */
  chase: Chase | null;
  perOver: number;
}

export function buildTimeline(b: MatchBundle, innings: readonly InningsCard[], files: ReadonlyMap<number, BallFile>): Timeline {
  const hundred = b.match.kind === 'hundred';
  const perOver = hundred ? 5 : b.match.ballsPerOver || 6;
  const out: ReplayInnings[] = [];
  let start = 0;
  for (const inn of innings) {
    const file = files.get(inn.n);
    if (!file) continue;
    const score: number[] = [], wkts: number[] = [], legal: number[] = [];
    let s = 0, w = 0, l = 0;
    for (let i = 0; i < file.d.length; i++) {
      s += file.rb[i]! + file.wd[i]! + file.nb[i]! + file.by[i]! + file.lb[i]! + file.pe[i]!;
      w += file.w[i]!;
      l += file.lg[i] === 1 ? 1 : 0;
      score.push(s); wkts.push(w); legal.push(l);
    }
    out.push({ inn, file, rows: ballRows(b, inn, file), start, score, wkts, legal });
    start += file.d.length;
  }
  const chase = b.match.kind !== 'test' && out.length >= 2 ? chaseOf(b, out[0]!.inn, out[1]!.inn, out[1]!.file) : null;
  return { innings: out, total: start, chase, perOver };
}

/** The innings and the number of its balls delivered after `pos` balls of the match. Position 0 is before the first ball; a position at the end of an innings is that innings, whole. */
export function locate(t: Timeline, pos: number): { k: number; c: number } {
  if (pos <= 0 || t.innings.length === 0) return { k: 0, c: 0 };
  for (let k = 0; k < t.innings.length; k++) {
    const ri = t.innings[k]!;
    if (pos <= ri.start + ri.file.d.length) return { k, c: pos - ri.start };
  }
  const last = t.innings.length - 1;
  return { k: last, c: t.innings[last]!.file.d.length };
}

/** How many whole overs (or sets of five balls) of the innings have been delivered after `c` balls. */
export function completedOvers(f: BallFile, c: number): number {
  if (c <= 0) return 0;
  const over = f.ov[c - 1]!;
  return c >= f.d.length || f.ov[c] !== over ? over + 1 : over;
}

export interface CreaseBatter { name: string; id: string | null; hand: string; runs: number; balls: number; striker: boolean }

export interface Snapshot {
  /** Index of the innings in the timeline, and balls of it delivered. */
  k: number;
  c: number;
  team: string;
  /** "Team B, chasing 179", "Team A, batting first", "Team A, 1st innings". */
  heading: string;
  score: number;
  wickets: number;
  legal: number;
  /** "13.1 overs", or "79 balls" in The Hundred. */
  progress: string;
  runRate: number | null;
  target: number | null;
  need: number | null;
  ballsLeft: number | null;
  requiredRate: number | null;
  inHand: number;
  batters: CreaseBatter[];
  partnership: { runs: number; balls: number } | null;
  bowler: { name: string; id: string | null; line: string } | null;
  over: { chips: BallRow['chip'][]; toCome: number };
  /** The last six balls of the innings, oldest first. */
  last: BallRow[];
  /** The ball just delivered. */
  ball: BallRow | null;
}

const keyOf = (id: string | null, name: string): string => id ?? name;

/** The two batters at the crease after `c` balls: the scorecard order says who came in, and each wicket brings the next. */
function creaseOf(inn: InningsCard, f: BallFile, c: number, runsBy: Map<string, number>, ballsBy: Map<string, number>): CreaseBatter[] {
  const dNow = c > 0 ? f.d[c - 1]! : -1;
  const gone = new Set(inn.batters.filter((x) => x.out && x.out.delivery <= dNow));
  const entered = Math.min(inn.batters.length, gone.size + 2);
  let here = inn.batters.slice(0, entered).filter((x) => !gone.has(x));
  if (here.length > 2) here = here.slice(-2);
  const striker = c > 0 && f.st[c - 1]! >= 0 ? f.pl[f.st[c - 1]!] : null;
  const strikerKey = striker ? keyOf(striker[1], striker[0]) : null;
  const handOf = new Map<string, string>(), nameOf = new Map<string, { name: string; id: string | null }>();
  f.pl.forEach(([name, id], i) => { handOf.set(keyOf(id, name), f.ph?.[i] ?? ''); nameOf.set(keyOf(id, name), { name, id }); });
  for (const x of inn.batters) nameOf.set(keyOf(x.id, x.name), { name: x.name, id: x.id });
  let keys = here.map((x) => keyOf(x.id, x.name));
  const goneKeys = new Set([...gone].map((x) => keyOf(x.id, x.name)));
  // The scorecard order and the delivery numbers disagree in a few innings (a batter who retired and came back, say). The ball file is trusted for the striker, and the other batter is the last
  // one before him who faced a ball and is not out.
  if (strikerKey && !keys.includes(strikerKey) && !goneKeys.has(strikerKey)) {
    let other: string | null = null;
    for (let i = c - 2; i >= 0 && other === null; i--) {
      const p = f.st[i]! >= 0 ? f.pl[f.st[i]!] : null;
      if (!p) continue;
      const kk = keyOf(p[1], p[0]);
      if (kk !== strikerKey && !goneKeys.has(kk)) other = kk;
    }
    keys = other ? [other, strikerKey] : [strikerKey];
  }
  return keys.map((key) => {
    const who = nameOf.get(key)!;
    return { name: who.name, id: who.id, hand: handOf.get(key) ?? '', runs: runsBy.get(key) ?? 0, balls: ballsBy.get(key) ?? 0, striker: key === strikerKey };
  });
}

/** "Zimbabwe, Super Over", "Zimbabwe, Super Over 2, chasing 14". */
function superHeading(b: MatchBundle, inn: InningsCard, target: number | null): string {
  const rounds = superRounds(b);
  const k = rounds.findIndex((r) => r.first === inn || r.second === inn);
  return `${inn.team}, ${roundName(rounds, Math.max(0, k))}${target !== null ? `, chasing ${target}` : ''}`;
}

export function snapshot(b: MatchBundle, t: Timeline, pos: number): Snapshot | null {
  const { k, c } = locate(t, pos);
  const ri = t.innings[k];
  if (!ri) return null;
  const f = ri.file, inn = ri.inn, per = t.perOver, hundred = b.match.kind === 'hundred', test = b.match.kind === 'test';
  const score = c > 0 ? ri.score[c - 1]! : 0, wickets = c > 0 ? ri.wkts[c - 1]! : 0, legal = c > 0 ? ri.legal[c - 1]! : 0;

  // One pass over the balls delivered: each batter's runs and balls, the bowler's figures, the over and the last wicket.
  const runsBy = new Map<string, number>(), ballsBy = new Map<string, number>();
  const credited = new Set<number>();
  for (const x of inn.batters) if (x.out && creditedToBowler(x.out.type)) credited.add(x.out.delivery);
  // Before the first ball the bowler is the one about to bowl it, with no figures yet.
  const bowlerIndex = c > 0 ? f.bo[c - 1]! : f.bo[0] ?? -1;
  const fig: Figures = { overs: 0, balls: 0, maidens: 0, runs: 0, wickets: 0 };
  const bowlerOvers = new Map<number, { runs: number; balls: number }>();
  let lastWicket = -1;
  for (let i = 0; i < c; i++) {
    const st = f.st[i]!;
    if (st >= 0) {
      const p = f.pl[st]!, key = keyOf(p[1], p[0]);
      runsBy.set(key, (runsBy.get(key) ?? 0) + f.rb[i]!);
      if (f.wd[i] === 0) ballsBy.set(key, (ballsBy.get(key) ?? 0) + 1);
    }
    if (f.w[i]! > 0) lastWicket = i;
    if (bowlerIndex >= 0 && f.bo[i] === bowlerIndex) {
      const charged = f.rb[i]! + f.wd[i]! + f.nb[i]!;
      fig.runs += charged;
      if (f.lg[i] === 1) fig.balls += 1;
      if (f.w[i]! > 0 && credited.has(f.d[i]!)) fig.wickets += 1;
      const o = bowlerOvers.get(f.ov[i]!) ?? { runs: 0, balls: 0 };
      o.runs += charged; o.balls += f.lg[i] === 1 ? 1 : 0;
      bowlerOvers.set(f.ov[i]!, o);
    }
  }
  for (const o of bowlerOvers.values()) { fig.overs += 1; if (o.balls >= per && o.runs === 0) fig.maidens += 1; }
  const bowlerName = bowlerIndex >= 0 ? f.pl[bowlerIndex] : null;

  // The over in progress: the chips of its balls, and how many are still to come.
  const over = c > 0 ? f.ov[c - 1]! : -1;
  const chips: BallRow['chip'][] = [];
  let legalInOver = 0;
  for (let i = 0; i < c; i++) if (f.ov[i] === over) { chips.push(ri.rows[i]!.chip); legalInOver += f.lg[i] === 1 ? 1 : 0; }
  const toCome = c > 0 && c < f.d.length && f.ov[c] === over ? Math.max(0, per - legalInOver) : 0;

  // The data has no target for the second side of a Super Over: it needs one more than the first side scored.
  const soRound = inn.super ? superRounds(b).find((r) => r.second === inn) : undefined;
  const target = inn.targetRuns ?? (soRound ? soRound.first.runs + 1 : k === 1 && !test && t.chase ? t.chase.target : null);
  const chasing = target !== null && k >= 1;
  const need = chasing ? Math.max(0, target! - score) : null;
  // A Super Over is one over (five balls in The Hundred); a chase of the match has its own scheduled balls.
  const scheduled = chasing && inn.super ? per : chasing && !test && t.chase ? t.chase.scheduledBalls : null;
  const ballsLeft = scheduled !== null ? Math.max(0, scheduled - legal) : null;
  const requiredRate = need !== null && ballsLeft !== null && ballsLeft > 0 ? need / (ballsLeft / per) : null;

  const heading = inn.super ? superHeading(b, inn, chasing ? target : null) : test ? `${inn.team}, ${inningsName(b, inn)}` : chasing ? `${inn.team}, chasing ${target}` : `${inn.team}, batting first`;
  const partnership = c > 0 ? { runs: score - (lastWicket >= 0 ? ri.score[lastWicket]! : 0), balls: legal - (lastWicket >= 0 ? ri.legal[lastWicket]! : 0) } : null;
  return {
    k, c, team: inn.team, heading, score, wickets, legal,
    progress: hundred ? `${legal} balls` : `${oversText(legal, per)} overs`,
    runRate: legal > 0 ? score / (legal / per) : null,
    target: chasing ? target : null, need, ballsLeft, requiredRate,
    inHand: Math.max(0, 10 - wickets),
    batters: creaseOf(inn, f, c, runsBy, ballsBy),
    partnership,
    bowler: bowlerName ? { name: bowlerName[0], id: bowlerName[1], line: figureLine(fig, per, hundred) } : null,
    over: { chips, toCome },
    last: ri.rows.slice(Math.max(0, c - 6), c),
    ball: c > 0 ? ri.rows[c - 1]! : null,
  };
}

export type MarkKind = 'wicket' | 'review' | 'drop' | 'chance';
export interface Mark { at: number; kind: MarkKind; label: string }

const evKind = (tag: string): MarkKind => (tag.startsWith('Review') ? 'review' : tag === 'Dropped catch' ? 'drop' : 'chance');

/** The marks on the scrubber: a wicket, a review, a dropped catch or a chance, at the position of the ball (1 is the first ball of the match). */
export function marksOf(t: Timeline): Mark[] {
  const out: Mark[] = [];
  for (const ri of t.innings) {
    ri.rows.forEach((row, i) => {
      const at = ri.start + i + 1;
      if (ri.file.w[i]! > 0) out.push({ at, kind: 'wicket', label: `${row.label} ${row.batter?.name ?? ''} out`.trim() });
      for (const tag of row.tags) out.push({ at, kind: evKind(tag), label: `${row.label} ${tag}` });
    });
  }
  return out;
}
