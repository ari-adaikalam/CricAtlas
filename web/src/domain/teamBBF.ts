import type { MatchKind, PhaseAverage, TeamInnings, TeamMatch, TeamPhaseRow, TeamReviewRow, TeamStyleRow, TeamWicketRow } from './team';
import { seasonOf } from './team';

// The Bat, bowl and field view. Super Overs are not in any of these files' phase rows, and International is not allowed in this view, so a scope is one kind of match
// (or the T20s, where a franchise team's matches are all of one kind).

export interface PhaseDef { key: string; name: string; range: string }

/** The phases of a kind of match. Tests have the new ball (the first 20 overs) and then blocks of 30 overs; The Hundred has the Powerplay and the rest of the innings. */
export function phaseDefs(kind: MatchKind): PhaseDef[] {
  switch (kind) {
    case 'test': return [
      { key: 'n', name: 'New ball', range: 'Overs 1 to 20' }, { key: 'b1', name: 'Overs 21 to 50', range: '' }, { key: 'b2', name: 'Overs 51 to 80', range: '' },
      { key: 'b3', name: 'Overs 81 to 110', range: '' }, { key: 'b4', name: 'Overs 111 on', range: '' },
    ];
    case 'odi': return [{ key: 'powerplay', name: 'Powerplay', range: 'Overs 1 to 10' }, { key: 'middle', name: 'Middle overs', range: 'Overs 11 to 40' }, { key: 'death', name: 'Death overs', range: 'Overs 41 to 50' }];
    case 'hundred': return [{ key: 'powerplay', name: 'Powerplay', range: 'Balls 1 to 25' }, { key: 'rest', name: 'Rest of innings', range: 'Balls 26 to 100' }];
    default: return [{ key: 'powerplay', name: 'Powerplay', range: 'Overs 1 to 6' }, { key: 'middle', name: 'Middle overs', range: 'Overs 7 to 15' }, { key: 'death', name: 'Death overs', range: 'Overs 16 to 20' }];
  }
}

/** The kind of the matches in scope: the one kind they all are, otherwise T20 (the T20s group, which can hold The Hundred next to T20 matches). */
export function scopeKind(ms: readonly TeamMatch[]): MatchKind | null {
  if (ms.length === 0) return null;
  const kinds = new Set(ms.map((m) => m.kind));
  return kinds.size === 1 ? [...kinds][0]! : kinds.has('t20') ? 't20' : [...kinds][0]!;
}

export interface PhaseCard {
  key: string;
  name: string;
  range: string;
  runs: number;
  balls: number;
  wickets: number;
  /** Strike rate for batting, economy for bowling (per 5 balls in The Hundred). Null when there were no balls. */
  rate: number | null;
  /** What an average side's rate would be off these balls, from every side's totals in the same kind of match. */
  average: number | null;
  /** Runs per wicket. */
  runsPerWicket: number | null;
  boundaryShare: number | null;
  dotShare: number | null;
}

/**
 * One card for each phase of the scope's kind. `side` is `for` for the team's own batting and `against` for the bowling of the team (the runs and wickets of the other side's innings).
 * The average is what an average side would have done off the same balls: for each kind of match, league or not, and gender in the scope, every side's runs per ball in that phase times the team's balls.
 */
export function phaseCards(rows: readonly TeamPhaseRow[], ms: readonly TeamMatch[], side: 'for' | 'against', avgs: readonly PhaseAverage[], gender: 'male' | 'female'): PhaseCard[] {
  const kind = scopeKind(ms);
  if (!kind) return [];
  const byMatch = new Map(ms.map((m) => [m.id, m]));
  const defs = phaseDefs(kind);
  const mine = rows.filter((r) => r.side === side && byMatch.has(r.matchId));
  return defs.map((d) => {
    const here = mine.filter((r) => r.phase === d.key);
    const sum = (f: (r: TeamPhaseRow) => number): number => here.reduce((a, r) => a + f(r), 0);
    const balls = sum((r) => r.balls), runs = sum((r) => r.runs), wickets = sum((r) => r.wkts);
    // The expected runs: the team's balls of each kind of match, at that kind's average runs per ball.
    let expected = 0;
    for (const r of here) {
      const m = byMatch.get(r.matchId)!;
      const a = avgs.find((x) => x.kind === m.kind && x.league === m.league && x.gender === gender && x.phase === d.key);
      if (a && a.balls > 0) expected += (a.runs / a.balls) * r.balls;
    }
    const scale = side === 'for' ? 100 : kind === 'hundred' ? 5 : 6;
    return {
      key: d.key, name: d.name, range: d.range, runs, balls, wickets,
      rate: balls > 0 ? (runs / balls) * scale : null,
      average: balls > 0 && expected > 0 ? (expected / balls) * scale : null,
      runsPerWicket: wickets > 0 ? runs / wickets : null,
      boundaryShare: balls > 0 ? sum((r) => r.boundaries) / balls : null,
      dotShare: balls > 0 ? sum((r) => r.dots) / balls : null,
    };
  });
}

export interface StyleSplit { group: 'pace' | 'spin' | 'other'; balls: number; share: number; wickets: number; economy: number | null }
/** The team's bowling by kind of bowler. 'Other' holds bowlers with no style listed and styles that are neither pace nor spin. */
export function styleSplit(rows: readonly TeamStyleRow[], ms: readonly TeamMatch[]): StyleSplit[] {
  const ids = new Set(ms.map((m) => m.id));
  const unit = ms.length > 0 && ms.every((m) => m.kind === 'hundred') ? 5 : 6;
  const mine = rows.filter((r) => ids.has(r.matchId));
  const total = mine.reduce((a, r) => a + r.balls, 0);
  return (['pace', 'spin', 'other'] as const).map((group) => {
    const g = mine.filter((r) => r.group === group);
    const balls = g.reduce((a, r) => a + r.balls, 0), runs = g.reduce((a, r) => a + r.conceded, 0);
    return { group, balls, share: total > 0 ? balls / total : 0, wickets: g.reduce((a, r) => a + r.wkts, 0), economy: balls > 0 ? (runs / balls) * unit : null };
  }).filter((s) => s.group !== 'other' || s.balls > 0);
}

// ---- How wickets were taken ---------------------------------------------------------------------------------

export const WICKET_GROUPS: ReadonlyArray<{ key: string; name: string; types: readonly string[] }> = [
  { key: 'caught', name: 'Caught', types: ['caught', 'caught and bowled'] },
  { key: 'bowled', name: 'Bowled', types: ['bowled'] },
  { key: 'lbw', name: 'LBW', types: ['lbw'] },
  { key: 'run out', name: 'Run out', types: ['run out'] },
  { key: 'stumped', name: 'Stumped', types: ['stumped'] },
];

export interface WicketWays { key: string; name: string; taken: number; lost: number }
/** Wickets taken and wickets lost, by the way they fell. Anything that is not one of the five (hit wicket, obstructing the field, retired out and so on) is Other. */
export function wicketWays(rows: readonly TeamWicketRow[], ms: readonly TeamMatch[]): { ways: WicketWays[]; taken: number; lost: number } {
  const ids = new Set(ms.map((m) => m.id));
  const mine = rows.filter((r) => ids.has(r.matchId));
  const known = new Set(WICKET_GROUPS.flatMap((g) => g.types));
  const count = (side: 'for' | 'against', types: readonly string[] | null): number => mine.filter((r) => r.side === side && (types ? types.includes(r.type) : !known.has(r.type))).reduce((a, r) => a + r.n, 0);
  const ways = [...WICKET_GROUPS.map((g) => ({ key: g.key, name: g.name, taken: count('for', g.types), lost: count('against', g.types) })), { key: 'other', name: 'Other', taken: count('for', null), lost: count('against', null) }];
  return { ways, taken: ways.reduce((a, w) => a + w.taken, 0), lost: ways.reduce((a, w) => a + w.lost, 0) };
}

// ---- Fielding ----------------------------------------------------------------------------------------------

export interface FieldingKey {
  matches: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  wicketsTaken: number;
  /** Catches, stumpings and run outs as a share of the wickets taken. */
  involved: number | null;
  /** Dropped catches come from tracking, so they are counted only in the matches that have it, and shown only when those are at least 30% of the matches. */
  dropped: number | null;
  droppedShare: number | null;
  trackedMatches: number;
}

/** A match counts as tracked when at least half its balls carry a shot or a position. */
export const isTracked = (m: TeamMatch): boolean => m.trackedOf > 0 && m.tracked / m.trackedOf >= 0.5;
export const TRACKING_MIN = 0.3;

export function fieldingKey(players: readonly { matchId: number; catches: number; stumpings: number; runOuts: number }[], wickets: readonly TeamWicketRow[], ms: readonly TeamMatch[]): FieldingKey {
  const ids = new Set(ms.map((m) => m.id));
  const mine = players.filter((p) => ids.has(p.matchId));
  const catches = mine.reduce((a, p) => a + p.catches, 0), stumpings = mine.reduce((a, p) => a + p.stumpings, 0), runOuts = mine.reduce((a, p) => a + p.runOuts, 0);
  const taken = wickets.filter((w) => ids.has(w.matchId) && w.side === 'for').reduce((a, w) => a + w.n, 0);
  const tracked = ms.filter(isTracked);
  const covered = ms.length > 0 && tracked.length / ms.length >= TRACKING_MIN;
  const tids = new Set(tracked.map((m) => m.id));
  const dropped = tracked.reduce((a, m) => a + m.dropped, 0);
  const caughtThere = mine.filter((p) => tids.has(p.matchId)).reduce((a, p) => a + p.catches, 0);
  return {
    matches: ms.length, catches, stumpings, runOuts, wicketsTaken: taken,
    involved: taken > 0 ? (catches + stumpings + runOuts) / taken : null,
    dropped: covered ? dropped : null,
    droppedShare: covered && dropped + caughtThere > 0 ? dropped / (dropped + caughtThere) : null,
    trackedMatches: tracked.length,
  };
}

// ---- Reviews ----------------------------------------------------------------------------------------------

export interface ReviewSide { taken: number; successful: number; /** Reviews lost on the umpire's call. */ umpiresCall: number; rate: number | null }
export interface ReviewSummary { matchesWithData: number; matches: number; batting: ReviewSide; fielding: ReviewSide; against: number }

/** The team's own reviews, as the batting side and as the fielding side. A review is successful when it was upheld, that is the on-field decision was overturned (the data's `decision` is the verdict on the review, domain/reviews.ts). A lost review is one that was struck down, and an umpire's call is a lost review. A match counts as having review data when it has any review row. */
export function reviewSummary(rows: readonly TeamReviewRow[], ms: readonly TeamMatch[]): ReviewSummary {
  const ids = new Set(ms.map((m) => m.id));
  const mine = rows.filter((r) => ids.has(r.matchId));
  const side = (batting: boolean): ReviewSide => {
    const own = mine.filter((r) => r.byTeam && r.batting === batting);
    const ok = own.filter((r) => r.decision === 'upheld').length;
    return { taken: own.length, successful: ok, umpiresCall: own.filter((r) => r.umpiresCall === true).length, rate: own.length > 0 ? ok / own.length : null };
  };
  return { matchesWithData: new Set(mine.map((r) => r.matchId)).size, matches: ms.length, batting: side(true), fielding: side(false), against: mine.filter((r) => !r.byTeam).length };
}

// ---- Extras ---------------------------------------------------------------------------------------------------

export interface ExtrasTotals { innings: number; wides: number; noballs: number; byes: number; legbyes: number; penalty: number; total: number }
const emptyExtras = (): ExtrasTotals => ({ innings: 0, wides: 0, noballs: 0, byes: 0, legbyes: 0, penalty: 0, total: 0 });
function addExtras(t: ExtrasTotals, i: TeamInnings): void {
  t.innings += 1; t.wides += i.wides; t.noballs += i.noballs; t.byes += i.byes; t.legbyes += i.legbyes; t.penalty += i.penalty;
  t.total += i.wides + i.noballs + i.byes + i.legbyes + i.penalty;
}

/** The extras the team conceded: the innings of the other side in the matches in scope, Super Overs left out. */
export function extrasConceded(innings: ReadonlyMap<number, readonly TeamInnings[]>, ms: readonly TeamMatch[], national: boolean): { all: ExtrasTotals; seasons: Array<{ season: string } & ExtrasTotals> } {
  const all = emptyExtras();
  const by = new Map<string, ExtrasTotals>();
  for (const m of ms) {
    const s = seasonOf(m, national);
    for (const i of innings.get(m.id) ?? []) {
      if (i.side !== 'against' || i.superOver) continue;
      addExtras(all, i);
      const t = by.get(s) ?? emptyExtras();
      addExtras(t, i); by.set(s, t);
    }
  }
  return { all, seasons: [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([season, t]) => ({ season, ...t })) };
}
