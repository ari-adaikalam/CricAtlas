import { cell, type Cell } from './compareStats';
import { competitionOf } from './compare';
import {
  applyFilters, batFirstSplit, counts, editions, indexInnings, tossSummary, trophyRows, type Counts, type Edition, type Split, type TeamFilters, type TeamInfo, type TeamInnings, type TeamMatch,
  type TeamPlayerRow, type TeamWicketRow,
} from './team';
import { fieldingKey, type FieldingKey } from './teamBBF';

// The Compare teams tiles: what each team holds under the Format, Competition and Season of the comparison, and the matches between the two. Everything here is
// pure, built on the Team page's own functions (`counts`, `batFirstSplit`, `tossSummary`, `editions`, `fieldingKey`), so a number agrees with the team's own page.

export interface TeamData { info: TeamInfo; matches: TeamMatch[]; innings: TeamInnings[] }

/** A team's matches under the choices, with its innings by match. */
export interface Scope { id: string; name: string; national: boolean; ms: TeamMatch[]; innings: ReadonlyMap<number, TeamInnings[]> }

/** The matches of either team in a competition both teams play (the same competition label as the pick screen's table): the Format, Competition and Season choices list only these. */
export function sharedMatches(a: TeamData, b: TeamData): TeamMatch[] {
  const labels = (t: TeamData): Set<string> => new Set(t.matches.map((m) => competitionOf(m, t.info.national)));
  const la = labels(a), lb = labels(b);
  const keep = (t: TeamData): TeamMatch[] => t.matches.filter((m) => la.has(competitionOf(m, t.info.national)) && lb.has(competitionOf(m, t.info.national)));
  return [...keep(a), ...keep(b)];
}

/** A team's scope. With `opponent` only the matches against that team. */
export function scopeOf(t: TeamData, filters: TeamFilters, opponent: string | null = null): Scope {
  const ms = applyFilters(t.matches, { ...filters, opponent, venue: null }, t.info.national);
  const inScope = new Set(ms.map((m) => m.id));
  return { id: t.info.id, name: t.info.name, national: t.info.national, ms, innings: indexInnings(t.innings.filter((i) => inScope.has(i.matchId))) };
}

const mean = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const inningsOf = (s: Scope, side: 'for' | 'against'): TeamInnings[] => [...s.innings.values()].flat().filter((i) => i.side === side && !i.superOver);

export interface TeamAgg {
  counts: Counts;
  avgFor: number | null;
  avgAgainst: number | null;
  highest: number | null;
  /** Batting first and chasing (limited overs), or batted first and bowled first (Tests): the first is the batting first side. */
  first: Split | null;
  second: Split | null;
  testSplit: boolean;
  tosses: number;
  tossRate: number | null;
  rateAfterWin: number | null;
  rateAfterLoss: number | null;
  titles: number;
}

export function teamAgg(s: Scope): TeamAgg {
  const forInn = inningsOf(s, 'for'), againstInn = inningsOf(s, 'against');
  const split = batFirstSplit(s.ms, s.innings);
  const rows = split.limited.length ? split.limited : split.tests;
  const toss = tossSummary(s.ms, s.innings);
  return {
    counts: counts(s.ms), avgFor: mean(forInn.map((i) => i.runs)), avgAgainst: mean(againstInn.map((i) => i.runs)), highest: forInn.length ? Math.max(...forInn.map((i) => i.runs)) : null,
    first: rows[0] ?? null, second: rows[1] ?? null, testSplit: split.limited.length === 0 && split.tests.length > 0,
    tosses: toss.tosses, tossRate: toss.tosses ? toss.won / toss.tosses : null, rateAfterWin: toss.rateAfterWin, rateAfterLoss: toss.rateAfterLoss,
    titles: trophyRows(editions(s.ms)).reduce((a, r) => a + r.titles, 0),
  };
}

/** A share (0 to 1) as a cell written as a whole percent. */
export const share = (v: number | null): Cell => (v === null ? { v: null, s: '-' } : { v: v * 100, s: `${Math.round(v * 100)}%` });

export interface BoardRow { label: string; a: Cell; b: Cell; low?: boolean }

/** The Scoreboard categories. A category where neither team has a number is left out. Catches, stumpings and run outs come with the fielding files, so they are there once those have loaded. */
export function boardRows(a: TeamAgg, b: TeamAgg, fa: FieldingKey | null, fb: FieldingKey | null): BoardRow[] {
  const test = a.testSplit || b.testSplit;
  const rows: BoardRow[] = [
    { label: 'Matches', a: cell(a.counts.played), b: cell(b.counts.played) },
    { label: 'Win rate', a: share(a.counts.rate), b: share(b.counts.rate) },
    { label: 'Average score', a: cell(a.avgFor === null ? null : Math.round(a.avgFor)), b: cell(b.avgFor === null ? null : Math.round(b.avgFor)) },
    { label: 'Average against', a: cell(a.avgAgainst === null ? null : Math.round(a.avgAgainst)), b: cell(b.avgAgainst === null ? null : Math.round(b.avgAgainst)), low: true },
    { label: 'Highest total', a: cell(a.highest), b: cell(b.highest) },
    { label: 'Win rate batting first', a: share(a.first?.rate ?? null), b: share(b.first?.rate ?? null) },
    { label: test ? 'Win rate bowling first' : 'Win rate chasing', a: share(a.second?.rate ?? null), b: share(b.second?.rate ?? null) },
    { label: 'Toss won', a: share(a.tossRate), b: share(b.tossRate) },
    { label: 'Titles', a: cell(a.titles), b: cell(b.titles) },
  ];
  if (fa && fb) rows.push({ label: 'Catches', a: cell(fa.catches), b: cell(fb.catches) }, { label: 'Stumpings', a: cell(fa.stumpings), b: cell(fb.stumpings) }, { label: 'Run outs', a: cell(fa.runOuts), b: cell(fb.runOuts) });
  return rows.filter((r) => r.a.v !== null || r.b.v !== null);
}

/** A season's win rate (percent) for each team, over the seasons either has a match in (oldest first); null where a team had no match with a result. */
export function seasonRates(a: Scope, b: Scope, seasonOf: (m: TeamMatch, national: boolean) => string): { seasons: string[]; a: Array<number | null>; b: Array<number | null> } {
  const by = (s: Scope): Map<string, TeamMatch[]> => { const out = new Map<string, TeamMatch[]>(); for (const m of s.ms) { const k = seasonOf(m, s.national); const l = out.get(k); if (l) l.push(m); else out.set(k, [m]); } return out; };
  const ga = by(a), gb = by(b);
  const seasons = [...new Set([...ga.keys(), ...gb.keys()])].sort();
  const rate = (g: Map<string, TeamMatch[]>, k: string): number | null => { const r = counts(g.get(k) ?? []).rate; return r === null ? null : r * 100; };
  return { seasons, a: seasons.map((k) => rate(ga, k)), b: seasons.map((k) => rate(gb, k)) };
}

export interface TrophySide { titles: number; lost: number; editions: Edition[] }
export interface TrophyCompare { tournament: string; name: string; a: TrophySide; b: TrophySide }

/** Titles and lost finals in every tournament either team played, most titles between the two first. */
export function trophyCompare(a: Scope, b: Scope): { rows: TrophyCompare[]; a: { titles: number; lost: number }; b: { titles: number; lost: number } } {
  const ra = trophyRows(editions(a.ms)), rb = trophyRows(editions(b.ms));
  const keys = [...new Set([...ra.map((r) => r.tournament), ...rb.map((r) => r.tournament)])];
  const one = (rows: typeof ra, k: string): TrophySide => { const r = rows.find((x) => x.tournament === k); return { titles: r?.titles ?? 0, lost: r?.finalsLost ?? 0, editions: r?.editions ?? [] }; };
  const rows = keys.map((k) => ({ tournament: k, name: (ra.find((r) => r.tournament === k) ?? rb.find((r) => r.tournament === k))!.name, a: one(ra, k), b: one(rb, k) }))
    .sort((x, y) => y.a.titles + y.b.titles - x.a.titles - x.b.titles || y.a.editions.length + y.b.editions.length - x.a.editions.length - x.b.editions.length || x.name.localeCompare(y.name));
  const sum = (rs: typeof ra): { titles: number; lost: number } => ({ titles: rs.reduce((n, r) => n + r.titles, 0), lost: rs.reduce((n, r) => n + r.finalsLost, 0) });
  return { rows, a: sum(ra), b: sum(rb) };
}

export interface KnockoutRecord { editions: number; reached: number; finals: number; won: number }

/** How far a team gets in tournaments: editions played, editions that reached the knockout stage, finals played and finals won. */
export function knockoutRecord(s: Scope): KnockoutRecord {
  const eds = editions(s.ms);
  return { editions: eds.length, reached: eds.filter((e) => e.stage !== null || e.result !== 'other').length, finals: eds.filter((e) => e.result !== 'other').length, won: eds.filter((e) => e.result === 'champion').length };
}

export const fieldingOf = (s: Scope, players: readonly TeamPlayerRow[], wickets: readonly TeamWicketRow[]): FieldingKey => fieldingKey(players, wickets, s.ms);

// ---- The two teams against each other ----------------------------------------------------------------------

/** Wins for the first team and the second (the first team's losses), in each year. */
export function winsByYear(ms: readonly TeamMatch[]): Array<{ year: number; a: number; b: number }> {
  const by = new Map<number, { a: number; b: number }>();
  for (const m of ms) { const e = by.get(m.year) ?? { a: 0, b: 0 }; if (m.result === 'won') e.a += 1; else if (m.result === 'lost') e.b += 1; by.set(m.year, e); }
  return [...by.entries()].sort(([x], [y]) => x - y).map(([year, e]) => ({ year, ...e }));
}

export interface GroundRow { ground: string; matches: number; a: number; b: number }
export function winsByGround(ms: readonly TeamMatch[]): GroundRow[] {
  const by = new Map<string, GroundRow>();
  for (const m of ms) {
    const g = m.venue ?? 'Unknown ground';
    const e = by.get(g) ?? { ground: g, matches: 0, a: 0, b: 0 };
    e.matches += 1; if (m.result === 'won') e.a += 1; else if (m.result === 'lost') e.b += 1; by.set(g, e);
  }
  return [...by.values()].sort((x, y) => y.matches - x.matches || x.ground.localeCompare(y.ground));
}
