import { decided, editionLabel, isKnockout, isLeague, type Fmt, type TInnings, type TMatch } from './tournament';

// The numbers behind the Overview tiles: Key numbers, the Table and the Knockouts. A match with no result is counted as played and left out of runs, averages and results.

type Innings = ReadonlyMap<number, readonly TInnings[]>;

const inningsOf = (ms: readonly TMatch[], innings: Innings): TInnings[] => ms.filter(decided).flatMap((m) => innings.get(m.id) ?? []);

export interface KeyNumbers {
  editions: number; matches: number; teams: number; grounds: number; runs: number; wickets: number; fours: number; sixes: number;
  avgFirst: number | null; avgSecond: number | null; runRate: number | null; runsPerMatch: number | null;
  highest: { runs: number; wkts: number; teamId: string; matchId: number; edition: string } | null;
}

export function keyNumbers(ms: readonly TMatch[], innings: Innings, format: Fmt): KeyNumbers {
  const inn = inningsOf(ms, innings);
  const sum = (f: (i: TInnings) => number): number => inn.reduce((a, i) => a + f(i), 0);
  const avg = (n: number): number | null => { const l = inn.filter((i) => i.inn === n); return l.length ? l.reduce((a, i) => a + i.runs, 0) / l.length : null; };
  const runs = sum((i) => i.runs), balls = sum((i) => i.balls);
  const top = inn.reduce<TInnings | null>((a, i) => (a === null || i.runs > a.runs ? i : a), null);
  const topMatch = top ? ms.find((m) => m.id === top.matchId) : undefined;
  return {
    editions: new Set(ms.map((m) => m.edition)).size, matches: ms.length, teams: new Set(ms.flatMap((m) => [m.team1Id, m.team2Id])).size, grounds: new Set(ms.map((m) => m.venue).filter(Boolean)).size,
    runs, wickets: sum((i) => i.wkts), fours: sum((i) => i.fours), sixes: sum((i) => i.sixes), avgFirst: avg(1), avgSecond: avg(2),
    runsPerMatch: ms.filter(decided).length ? runs / ms.filter(decided).length : null,
    runRate: balls ? (format === 'HUNDRED' ? (runs / balls) * 100 : (runs / balls) * 6) : null,
    highest: top && topMatch ? { runs: top.runs, wkts: top.wkts, teamId: top.batId, matchId: top.matchId, edition: topMatch.edition } : null,
  };
}

// ---- The table ---------------------------------------------------------------------------------------------

export interface StandRow {
  id: string; name: string; played: number; won: number; lost: number; tied: number; drawn: number; nr: number; points: number;
  /** Net run rate: runs per over scored minus runs per over conceded (per 100 balls in The Hundred). Null in Tests. */
  nrr: number | null;
  /** Points as a share of the most the matches could have given (12 a match), for Tests. */
  pct: number;
}

/**
 * Standings of the matches given. A win is 2 points (12 in a Test), a tie with no winner or a no result is 1 (a tie is 6 in a Test and a no result or a draw 4), and a tie that a Super Over decided is a win for
 * its winner. Net run rate counts a full quota of balls when a side was all out, and a shortened chase its revised overs.
 */
export function standings(ms: readonly TMatch[], innings: Innings, format: Fmt, names: ReadonlyMap<string, string>): StandRow[] {
  const test = format === 'TEST';
  type Acc = StandRow & { rf: number; bf: number; ra: number; ba: number };
  const by = new Map<string, Acc>();
  const get = (id: string): Acc => { let r = by.get(id); if (!r) { r = { id, name: names.get(id) ?? id, played: 0, won: 0, lost: 0, tied: 0, drawn: 0, nr: 0, points: 0, nrr: null, pct: 0, rf: 0, bf: 0, ra: 0, ba: 0 }; by.set(id, r); } return r; };
  for (const m of ms) {
    const a = get(m.team1Id), b = get(m.team2Id);
    a.played += 1; b.played += 1;
    if (m.winnerId) {
      const w = get(m.winnerId), l = m.winnerId === m.team1Id ? b : a;
      w.won += 1; l.lost += 1; w.points += test ? 12 : 2;
    } else if (m.outcome === 'tie') { a.tied += 1; b.tied += 1; a.points += test ? 6 : 1; b.points += test ? 6 : 1; }
    else if (m.outcome === 'draw') { a.drawn += 1; b.drawn += 1; a.points += 4; b.points += 4; }
    else { a.nr += 1; b.nr += 1; a.points += test ? 4 : 1; b.points += test ? 4 : 1; continue; }
    for (const i of innings.get(m.id) ?? []) {
      if (i.superOver) continue;
      const quota = Math.round(((i.inn === 2 && m.revisedOvers ? m.revisedOvers : m.overs) ?? 0) * m.ballsPerOver);
      const balls = i.wkts >= 10 && quota > 0 ? quota : i.balls;
      const bat = get(i.batId), bowl = get(i.bowlId);
      bat.rf += i.runs; bat.bf += balls; bowl.ra += i.runs; bowl.ba += balls;
    }
  }
  const scale = format === 'HUNDRED' ? 100 : 6;
  return [...by.values()].map(({ rf, bf, ra, ba, ...r }): StandRow => ({
    ...r, nrr: test ? null : ((bf ? rf / bf : 0) - (ba ? ra / ba : 0)) * scale, pct: r.played ? (r.points / (12 * r.played)) * 100 : 0,
  })).sort((x, y) => y.points - x.points || (y.nrr ?? 0) - (x.nrr ?? 0) || x.name.localeCompare(y.name));
}

export interface TableGroup { title: string; rows: StandRow[] }
export interface TableSet { title: string; groups: TableGroup[]; note: string }

const groupTitle = (stage: string | null, group: string | null): string => (stage && group ? (stage.includes(`Group ${group}`) ? stage : `${stage}, Group ${group}`) : stage || (group ? `Group ${group}` : 'League stage'));

/**
 * One table for each stage and group tag of a single edition, in the order played; an edition with no tags gets one combined table, and so does a view of several editions (the league stage matches of
 * all of them together). Placing matches and knockouts are not in a table.
 */
export function tableSet(ms: readonly TMatch[], innings: Innings, format: Fmt, names: ReadonlyMap<string, string>, kind: 'tournament' | 'league'): TableSet | null {
  const lg = ms.filter(isLeague);
  if (lg.length === 0) return null;
  const editions = [...new Set(lg.map((m) => m.edition))].sort();
  const rule = format === 'TEST' ? '12 points for a win, 4 for a draw and 6 for a tie' : '2 points for a win and 1 each for a tie with no winner or a no result';
  if (editions.length > 1) {
    return { title: 'Table, all editions', groups: [{ title: '', rows: standings(lg, innings, format, names) }], note: `All ${editions.length} editions combined. Pick one edition above for its own table.` };
  }
  const label = editionLabel(editions[0]!);
  const keyOf = (m: TMatch): string => `${m.stageName ?? ''}|${m.group ?? ''}`;
  const first = new Map<string, string>();
  for (const m of lg) { const k = keyOf(m); const d = first.get(k); if (d === undefined || m.date < d) first.set(k, m.date); }
  const keys = [...first.entries()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([k]) => k);
  const groups = keys.map((k): TableGroup => {
    const [st, g] = k.split('|');
    return { title: keys.length > 1 ? groupTitle(st || null, g || null) : '', rows: standings(lg.filter((m) => keyOf(m) === k), innings, format, names) };
  });
  const untagged = lg.every((m) => !m.stageName && !m.group);
  const note = keys.length > 1
    ? `${label}, one table for each stage and group in the tags, in the order they were played.`
    : kind === 'tournament' && untagged
      ? `${label}. Groups are not in the data for this edition, so this is one combined table and may differ from the official groups.`
      : `${label}. Built from the results of the matches that have no knockout tag, with ${rule}. It may differ from the official table.`;
  return { title: `Table, ${label}`, groups, note };
}

// ---- Knockouts ----------------------------------------------------------------------------------------------

export interface KnockoutEdition { edition: string; label: string; matches: TMatch[]; final: TMatch | null }
export interface KnockoutSummary { editions: KnockoutEdition[]; matches: number; chased: number; decided: number; finals: number; finalsChased: number }

/** The knockout matches of the matches given, by edition newest first, each edition's matches in the order played. */
export function knockouts(ms: readonly TMatch[]): KnockoutSummary {
  const ko = ms.filter(isKnockout);
  const by = new Map<string, TMatch[]>();
  for (const m of ko) { const l = by.get(m.edition); if (l) l.push(m); else by.set(m.edition, [m]); }
  const editions = [...by.entries()].map(([edition, list]): KnockoutEdition => {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    return { edition, label: editionLabel(edition), matches: sorted, final: [...sorted].reverse().find((m) => m.stageName === 'Final') ?? null };
  }).sort((a, b) => b.matches[0]!.date.localeCompare(a.matches[0]!.date));
  const done = ko.filter((m) => m.winnerId && m.batFirstId);
  const finals = ko.filter((m) => m.stageName === 'Final' && m.winnerId && m.batFirstId);
  return { editions, matches: ko.length, chased: done.filter((m) => m.winnerId !== m.batFirstId).length, decided: done.length, finals: finals.length, finalsChased: finals.filter((m) => m.winnerId !== m.batFirstId).length };
}

// ---- One edition -----------------------------------------------------------------------------------

export interface StageStep { name: string; kind: 'league' | 'knockout'; matches: number; /** The side that topped a league stage, or the winner of a knockout match. */ leaderId: string | null; loserId: string | null; matchId: number | null; first: string }

/**
 * An edition stage by stage in the order played: each league phase (a stage or group tag, or one "League stage" when there are none) with the side that finished top of it, then each knockout match with
 * its winner and loser. Order is by the date of the first match of the step.
 */
export function stageSteps(ms: readonly TMatch[], innings: Innings, format: Fmt, names: ReadonlyMap<string, string>): StageStep[] {
  const steps: StageStep[] = [];
  const lg = ms.filter(isLeague);
  const stages = new Map<string, TMatch[]>();
  for (const m of lg) { const k = m.stageName ?? 'League stage'; const l = stages.get(k); if (l) l.push(m); else stages.set(k, [m]); }
  for (const [name, list] of stages) {
    const top = standings(list, innings, format, names)[0];
    steps.push({ name, kind: 'league', matches: list.length, leaderId: top?.id ?? null, loserId: null, matchId: null, first: list.reduce((a, m) => (m.date < a ? m.date : a), list[0]!.date) });
  }
  for (const m of ms.filter(isKnockout)) {
    steps.push({ name: m.stageName ?? 'Knockout', kind: 'knockout', matches: 1, leaderId: m.winnerId, loserId: m.winnerId ? (m.winnerId === m.team1Id ? m.team2Id : m.team1Id) : null, matchId: m.id, first: m.date });
  }
  return steps.sort((a, b) => a.first.localeCompare(b.first) || Number(a.kind === 'knockout') - Number(b.kind === 'knockout'));
}

export interface EditionStatus { position: number | null; result: string }

/** Where a team finished one edition: its rank in the league stage (null when there is none) and a result: Champion, Runner-up, out in the last knockout it played, or the league stage. */
export function editionStatus(teamId: string, ms: readonly TMatch[], rank: ReadonlyMap<string, number>, championId: string | null, runnerUpId: string | null): EditionStatus {
  const position = rank.get(teamId) ?? null;
  if (championId === teamId) return { position, result: 'Champion' };
  if (runnerUpId === teamId) return { position, result: 'Runner-up' };
  const last = ms.filter((m) => isKnockout(m) && (m.team1Id === teamId || m.team2Id === teamId)).sort((a, b) => b.date.localeCompare(a.date))[0];
  return { position, result: last ? `Out in the ${(last.stageName ?? 'knockouts').toLowerCase()}` : 'League stage' };
}
