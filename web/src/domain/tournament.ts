import type { SearchGender } from './search';
import { eventWords, queryTokens, scoreWords, splitGender, wordsOf } from './searchCore';

// The Tournament page's facts, scope and tables. Everything works on the rows of the tournament's own files (tools/tournament_files.py) and runs in the browser with no query engine.

export type Fmt = 'TEST' | 'ODI' | 'T20' | 'HUNDRED';

/** One match of the tournament. */
export interface TMatch {
  id: number;
  date: string;
  season: string;
  /** The edition's key, such as "ipl|2024|male". The label is its middle part. */
  edition: string;
  format: Fmt;
  stageClass: string | null;
  stageName: string | null;
  group: string | null;
  number: number | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  team1: string;
  team1Id: string;
  team2: string;
  team2Id: string;
  tossWinnerId: string | null;
  tossDecision: string | null;
  batFirstId: string | null;
  winnerId: string | null;
  outcome: string | null;
  byRuns: number | null;
  byWkts: number | null;
  byInnings: boolean;
  method: string | null;
  overs: number | null;
  ballsPerOver: number;
  revisedOvers: number | null;
  potmId: string | null;
  potm: string | null;
}

export interface TInnings { matchId: number; inn: number; batId: string; bowlId: string; superOver: boolean; runs: number; wkts: number; balls: number; fours: number; sixes: number; declared: boolean }
export interface BatRow { matchId: number; inn: number; id: string; name: string; teamId: string; runs: number; balls: number; fours: number; sixes: number; out: boolean }
export interface BowlRow { matchId: number; inn: number; id: string; name: string; teamId: string; balls: number; runs: number; wkts: number; maidens: number }

export interface TournamentInfo {
  key: string; name: string; kind: 'tournament' | 'league'; gender: 'male' | 'female'; editions: number; firstSeason: string; lastSeason: string; matches: number; teams: number; formats: Fmt[];
  /** The winner of the latest edition that has one (the match tagged Final), null when no edition has a champion. */
  champion: { id: string; name: string; edition: string } | null;
  /** The sides with the most titles, every one that is level on the count. */
  titles: Array<{ id: string; name: string; count: number }>;
}

export const editionLabel = (edition: string): string => edition.split('|')[1] ?? edition;

export const isKnockout = (m: TMatch): boolean => m.stageClass === 'knockout';
/** A match of the league phase: no knockout tag. Placing matches are neither. */
export const isLeague = (m: TMatch): boolean => m.stageClass === null || m.stageClass === 'second_phase';
export const teamsOf = (m: TMatch): Array<{ id: string; name: string }> => [{ id: m.team1Id, name: m.team1 }, { id: m.team2Id, name: m.team2 }];
export const nameOf = (m: TMatch, id: string | null): string => (id === m.team1Id ? m.team1 : id === m.team2Id ? m.team2 : '');
export const otherId = (m: TMatch, id: string): string => (id === m.team1Id ? m.team2Id : m.team1Id);
/** A match with a result: not abandoned or called off. */
export const decided = (m: TMatch): boolean => m.outcome !== 'no result';

export const FORMAT_LABEL: Record<Fmt, string> = { TEST: 'Tests', ODI: 'ODIs', T20: 'T20s', HUNDRED: 'The Hundred' };

// ---- Scope: Format, Stage, Edition, Team, Venue -----------------------------------------------------------------

export interface TFilters { format: Fmt; stage: string; edition: string | null; team: string | null; venue: string | null }
export const STAGE_ALL = 'all', STAGE_LEAGUE = 'league', STAGE_KO = 'knockouts';

export function applyFilters(ms: readonly TMatch[], f: TFilters): TMatch[] {
  return ms.filter((m) => m.format === f.format && inStage(m, f.stage) && (f.edition === null || m.edition === f.edition)
    && (f.team === null || m.team1Id === f.team || m.team2Id === f.team) && (f.venue === null || m.venue === f.venue));
}

export function inStage(m: TMatch, stage: string): boolean {
  if (stage === STAGE_ALL) return true;
  if (stage === STAGE_LEAGUE) return isLeague(m);
  if (stage === STAGE_KO) return isKnockout(m);
  return m.stageName === stage;
}

/** The formats of the tournament, the most matches first. */
export function formatsOf(ms: readonly TMatch[]): Fmt[] {
  const n = new Map<Fmt, number>();
  for (const m of ms) n.set(m.format, (n.get(m.format) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
}

export interface EditionOption { edition: string; label: string; matches: number }
/** The editions with matches in the format, newest first. */
export function editionOptions(ms: readonly TMatch[], format: Fmt): EditionOption[] {
  const by = new Map<string, TMatch[]>();
  for (const m of ms) if (m.format === format) { const l = by.get(m.edition); if (l) l.push(m); else by.set(m.edition, [m]); }
  return [...by.entries()].map(([edition, list]) => ({ edition, label: editionLabel(edition), matches: list.length, first: list.reduce((a, m) => (m.date < a ? m.date : a), list[0]!.date) }))
    .sort((a, b) => b.first.localeCompare(a.first)).map(({ edition, label, matches }) => ({ edition, label, matches }));
}

export interface StageOption { value: string; label: string; matches: number }

const DAY = 86_400_000;
const dayOf = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / DAY;

/** Stage names in the order they are played: by where their matches fall inside their edition, averaged over the editions. Nothing is written per tournament. */
export function stageOrder(ms: readonly TMatch[]): string[] {
  const span = new Map<string, [number, number]>();
  for (const m of ms) { const d = dayOf(m.date), s = span.get(m.edition); if (!s) span.set(m.edition, [d, d]); else { if (d < s[0]) s[0] = d; if (d > s[1]) s[1] = d; } }
  const at = new Map<string, number[]>();
  for (const m of ms) {
    if (!m.stageName) continue;
    const [a, b] = span.get(m.edition)!;
    const l = at.get(m.stageName) ?? []; l.push(b > a ? (dayOf(m.date) - a) / (b - a) : 0); at.set(m.stageName, l);
  }
  return [...at.entries()].map(([name, l]) => [name, l.reduce((x, y) => x + y, 0) / l.length] as const).sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0])).map(([name]) => name);
}

/** All stages, League stage and Knockouts, then every stage name under the Format and Edition choices in the order played. */
export function stageOptions(ms: readonly TMatch[], format: Fmt, edition: string | null): StageOption[] {
  const pool = ms.filter((m) => m.format === format && (edition === null || m.edition === edition));
  const count = (s: string): number => pool.filter((m) => inStage(m, s)).length;
  return [
    { value: STAGE_ALL, label: 'All stages', matches: pool.length }, { value: STAGE_LEAGUE, label: 'League stage', matches: count(STAGE_LEAGUE) }, { value: STAGE_KO, label: 'Knockouts', matches: count(STAGE_KO) },
    ...stageOrder(pool).map((n) => ({ value: n, label: n, matches: count(n) })),
  ];
}

/** The format the page opens on (the most matches) and the latest edition in it. */
export function defaultFilters(ms: readonly TMatch[]): TFilters | null {
  const format = formatsOf(ms)[0];
  if (!format) return null;
  return { format, stage: STAGE_ALL, edition: editionOptions(ms, format)[0]?.edition ?? null, team: null, venue: null };
}

/** Drops a choice that has no matches under the ones before it (Format, Edition, Stage, then Team and Venue). */
export function normaliseFilters(ms: readonly TMatch[], f: TFilters): TFilters | null {
  const fallback = defaultFilters(ms);
  if (!fallback) return null;
  const format = formatsOf(ms).includes(f.format) ? f.format : fallback.format;
  // All editions stays All editions. A named edition the format did not play moves to the latest one that it did.
  const edition = f.edition === null ? null : editionOptions(ms, format).some((e) => e.edition === f.edition) ? f.edition : editionOptions(ms, format)[0]?.edition ?? null;
  const stage = stageOptions(ms, format, edition).some((s) => s.value === f.stage && s.matches > 0) ? f.stage : STAGE_ALL;
  const base = { format, stage, edition, team: null, venue: null } as TFilters;
  const team = f.team !== null && applyFilters(ms, { ...base, team: f.team }).length > 0 ? f.team : null;
  const venue = f.venue !== null && applyFilters(ms, { ...base, team, venue: f.venue }).length > 0 ? f.venue : null;
  return { format, stage, edition, team, venue };
}

export interface TeamOption { id: string; name: string; matches: number }
export function teamOptions(ms: readonly TMatch[], f: TFilters): TeamOption[] {
  const by = new Map<string, TeamOption>();
  for (const m of applyFilters(ms, { ...f, team: null })) for (const t of teamsOf(m)) { const e = by.get(t.id) ?? { id: t.id, name: t.name, matches: 0 }; e.matches += 1; by.set(t.id, e); }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function venueOptions(ms: readonly TMatch[], f: TFilters): Array<{ value: string; matches: number }> {
  const by = new Map<string, number>();
  for (const m of applyFilters(ms, { ...f, venue: null })) if (m.venue) by.set(m.venue, (by.get(m.venue) ?? 0) + 1);
  return [...by.entries()].map(([value, matches]) => ({ value, matches })).sort((a, b) => b.matches - a.matches || a.value.localeCompare(b.value));
}

const SAFE = /^[A-Za-z0-9_/ .|~'&()-]{1,80}$/;
const FORMATS: readonly string[] = ['TEST', 'ODI', 'T20', 'HUNDRED'];
export function filtersFromParams(p: URLSearchParams): Partial<TFilters> {
  const pick = (k: string): string | undefined => { const v = p.get(k); return v !== null && SAFE.test(v) ? v : undefined; };
  const out: Partial<TFilters> = {};
  const format = pick('format'); if (format && FORMATS.includes(format)) out.format = format as Fmt;
  const stage = pick('stage'); if (stage) out.stage = stage;
  const edition = pick('edition'); if (edition) out.edition = edition === 'all' ? null : edition;
  const team = pick('team'); if (team) out.team = team;
  const venue = pick('venue'); if (venue) out.venue = venue;
  return out;
}
export function filtersToParams(f: TFilters): URLSearchParams {
  const p = new URLSearchParams({ format: f.format, edition: f.edition ?? 'all' });
  if (f.stage !== STAGE_ALL) p.set('stage', f.stage);
  if (f.team) p.set('team', f.team);
  if (f.venue) p.set('venue', f.venue);
  return p;
}

// ---- Indexes ------------------------------------------------------------------------------------------------

export function indexInnings(innings: readonly TInnings[]): ReadonlyMap<number, TInnings[]> {
  const by = new Map<number, TInnings[]>();
  for (const i of innings) { if (i.superOver) continue; const l = by.get(i.matchId); if (l) l.push(i); else by.set(i.matchId, [i]); }
  for (const l of by.values()) l.sort((a, b) => a.inn - b.inn);
  return by;
}

/** What a side scored in a match: its innings joined with " & " in a Test, "187/6" otherwise. */
export function scoreOf(innings: ReadonlyMap<number, readonly TInnings[]>, matchId: number, teamId: string): string {
  return (innings.get(matchId) ?? []).filter((i) => i.batId === teamId).map((i) => `${i.runs}${i.wkts >= 10 ? '' : `/${i.wkts}`}${i.declared ? 'd' : ''}`).join(' & ');
}

/** The balls an innings had: a Hundred innings 100, an over of the match's own length, and for a shortened chase its revised overs. */
export function quotaBalls(m: TMatch, inn: number): number {
  const overs = inn === 2 && m.revisedOvers ? m.revisedOvers : m.overs ?? 0;
  return Math.round(overs * m.ballsPerOver);
}

/** "by 17 runs", "by 5 wickets (12 balls left)", "by an innings and 40 runs", "tied", "no result", "drawn". */
export function marginOf(m: TMatch, innings: ReadonlyMap<number, readonly TInnings[]>): string {
  if (m.outcome === 'draw') return 'drawn';
  if (m.outcome === 'no result') return 'no result';
  if (!m.winnerId) return m.outcome === 'tie' ? 'tied' : 'no result';
  const tie = m.outcome === 'tie' ? ' (Super Over)' : '';
  if (m.byInnings && m.byRuns !== null) return `by an innings and ${m.byRuns} runs${tie}`;
  if (m.byRuns !== null) return `by ${m.byRuns} ${m.byRuns === 1 ? 'run' : 'runs'}${tie}`;
  if (m.byWkts !== null) {
    const chase = (innings.get(m.id) ?? []).filter((i) => i.inn === 2)[0];
    const left = chase && m.format !== 'TEST' ? quotaBalls(m, 2) - chase.balls : 0;
    return `by ${m.byWkts} ${m.byWkts === 1 ? 'wicket' : 'wickets'}${left > 0 ? ` (${left} balls left)` : ''}${tie}`;
  }
  return tie ? 'tied (Super Over)' : '';
}

/** "Mar 2024" from an ISO date. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthYear = (iso: string): string => `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''} ${iso.slice(0, 4)}`;

// ---- Editions, champions, titles ---------------------------------------------------------------------------

export interface EditionResult { edition: string; label: string; championId: string | null; runnerUpId: string | null; final: TMatch | null; finals: TMatch[]; matches: number; firstDate: string }

/**
 * The champion of each edition is the winner of the match tagged Final, and with several Finals (a best of three) the side with more wins. The runner-up is the other finalist. A Final with no winner,
 * or an edition with no Final in the data, has no champion (a dash).
 */
export function editionResults(ms: readonly TMatch[]): EditionResult[] {
  const by = new Map<string, TMatch[]>();
  for (const m of ms) { const l = by.get(m.edition); if (l) l.push(m); else by.set(m.edition, [m]); }
  return [...by.entries()].map(([edition, list]) => {
    const finals = list.filter((m) => isKnockout(m) && m.stageName === 'Final').sort((a, b) => a.date.localeCompare(b.date));
    const wins = new Map<string, number>();
    for (const f of finals) if (f.winnerId) wins.set(f.winnerId, (wins.get(f.winnerId) ?? 0) + 1);
    const ranked = [...wins.entries()].sort((a, b) => b[1] - a[1]);
    const championId = ranked.length && (ranked.length === 1 || ranked[0]![1] > ranked[1]![1]) ? ranked[0]![0] : null;
    const last = finals[finals.length - 1] ?? null;
    return { edition, label: editionLabel(edition), championId, runnerUpId: championId && last ? otherId(last, championId) : null, final: last, finals, matches: list.length, firstDate: list.reduce((a, m) => (m.date < a ? m.date : a), list[0]!.date) };
  }).sort((a, b) => b.firstDate.localeCompare(a.firstDate));
}

export interface TitleRow { id: string; name: string; titles: number; finals: number; years: string[] }
/** Titles and final appearances by team in the editions given (newest edition first in `years`, as labels). */
export function titleRows(results: readonly EditionResult[], names: ReadonlyMap<string, string>): TitleRow[] {
  const by = new Map<string, TitleRow>();
  const row = (id: string): TitleRow => { let r = by.get(id); if (!r) { r = { id, name: names.get(id) ?? id, titles: 0, finals: 0, years: [] }; by.set(id, r); } return r; };
  for (const e of results) {
    if (e.championId) { const c = row(e.championId); c.titles += 1; c.finals += 1; c.years.push(e.label); }
    if (e.runnerUpId) row(e.runnerUpId).finals += 1;
  }
  return [...by.values()].sort((a, b) => b.titles - a.titles || b.finals - a.finals || a.name.localeCompare(b.name));
}

// ---- The profile line and the search ----------------------------------------------------------------------------


/**
 * "Men's league. 19 editions from 2007/08 to 2026, 15 teams, 1,243 matches. Knockouts: Qualifier 1, Eliminator, Qualifier 2, Final. Super 8 stage in 2024 and 2026." Built from the matches, never written by hand
 *so a tournament's line says what it has.
 */
/**
 * The qualification leagues: competitions of many small series whose table only decides who qualifies for a World Cup, so they have no Final and no champion (the ICC Men's Cricket World Cup League 2 and the ICC
 * Women's Championship, the data edits). The Tournaments list and the tournament page say so. A new one is added here.
 */
export const QUALIFICATION_LEAGUES: ReadonlySet<string> = new Set(['odi-world-cup-league-male', 'women-championship-female']);
export const isQualificationLeague = (t: TournamentInfo): boolean => QUALIFICATION_LEAGUES.has(t.key);

export function describe(info: TournamentInfo, ms: readonly TMatch[]): string {
  const editions = [...new Set(ms.map((m) => m.edition))].sort((a, b) => editionStart(ms, a).localeCompare(editionStart(ms, b)));
  const labels = editions.map(editionLabel);
  const teams = new Set<string>();
  for (const m of ms) { teams.add(m.team1Id); teams.add(m.team2Id); }
  // A tournament is an event between national teams, a league is between clubs or franchises.
  const who = `${info.gender === 'female' ? "Women's" : "Men's"} ${info.kind === 'tournament' ? 'international tournament' : 'league'}`;
  const base = editions.length === 1 ? `${who} with ${teams.size} teams, one edition (${labels[0]}).` : `${who} with ${teams.size} teams over ${editions.length} editions, ${labels[0]} to ${labels[labels.length - 1]}.`;
  return isQualificationLeague(info) ? `${base} A qualification league with no Final.` : base;
}
const editionStart = (ms: readonly TMatch[], edition: string): string => ms.filter((m) => m.edition === edition).reduce((a, m) => (m.date < a ? m.date : a), '9999');


/** The tournaments for a typed text, among the Men or Women choice and the International (tournament) or League choice: a name that starts with it first, then a word that starts with it, then one that contains it. The most matches come first among equals. */
export function findTournaments(text: string, rows: readonly TournamentInfo[], gender: SearchGender = 'all', kind: TournamentInfo['kind'] | null = null): TournamentInfo[] {
  const said = splitGender(text);
  if (said.gender) { gender = said.gender; text = said.rest; }
  const tokens = queryTokens(text);
  const pool = rows.filter((t) => (gender === 'all' || (gender === 'men' ? t.gender === 'male' : t.gender === 'female')) && (kind === null || t.kind === kind));
  const byMatches = (a: TournamentInfo, b: TournamentInfo): number => b.matches - a.matches || a.name.localeCompare(b.name);
  if (tokens.length === 0) return [...pool].sort(byMatches);
  return pool.map((t) => ({ t, s: scoreWords(tokens, [...eventWords(t.name), ...wordsOf(t.key.replace(/-(male|female)$/, '').replace(/-/g, ' '), 2)]) })).filter((x): x is { t: TournamentInfo; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || byMatches(a.t, b.t)).map((x) => x.t);
}

/** "Men's league, 2007/08 to 2026, 1,243 matches". */
export function tournamentLine(t: TournamentInfo): string {
  const span = t.firstSeason === t.lastSeason ? t.firstSeason : `${t.firstSeason} to ${t.lastSeason}`;
  return `${t.gender === 'female' ? "Women's" : "Men's"} ${t.kind}, ${span}, ${t.matches.toLocaleString('en')} ${t.matches === 1 ? 'match' : 'matches'}`;
}

/** The letters in the profile's round badge: "IPL" for the Indian Premier League, "TWC" for the ICC Men's T20 World Cup. A leading all-capitals body such as ICC is left out. */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !/^(men's|women's)$/i.test(w));
  if (words.length === 1) return words[0]!.slice(0, 4).toUpperCase();
  const rest = /^[A-Z]{3,4}$/.test(words[0]!) && words.length > 2 ? words.slice(1) : words;
  return rest.filter((w) => /^[A-Z0-9]/.test(w)).map((w) => w[0]!).join('').slice(0, 3);
}
