import type { ListMatch } from '@/data/matchList';
import { formatTag } from './matchesRoot';
import { eventWords, queryTokens, scoreWords, splitGender, teamWords, wordsOf } from './searchCore';

// The Series page: every event with a name, one row for each event, season, format and gender, built in the browser from the match list (mlist.json).
// A tour that has Tests and ODIs is a row in each format's section, with that format's matches and result only.

export type Section = 'Test' | 'ODI' | 'T20I' | 'T20' | 'The Hundred';
export const SECTIONS: readonly Section[] = ['Test', 'ODI', 'T20I', 'T20', 'The Hundred'];
export const SECTION_TITLE: Record<Section, string> = { Test: 'Tests', ODI: 'ODIs', T20I: 'T20Is', T20: 'T20 leagues and other T20s', 'The Hundred': 'The Hundred' };

/** A bilateral tour, a tournament or league with a page of its own, or any other event (tri-series, regional cups, qualifiers). */
export type EventKind = 'Bilateral tour' | 'Tournament or league' | 'Other event';
export const EVENT_KINDS: readonly EventKind[] = ['Bilateral tour', 'Tournament or league', 'Other event'];

export interface Team { id: string; name: string }
export interface Series {
  id: string;
  name: string;
  season: string;
  section: Section;
  female: boolean;
  kind: EventKind;
  /** The tournament key when the event has a page. */
  key: string | null;
  teams: Team[];
  first: string;
  last: string;
  /** Oldest first. */
  matches: ListMatch[];
  /** The result in words, "England won 3-2", "Drawn 1-1", or the champion of an event with a Final. */
  result: string;
}

const TOUR = /^(.+) tour of (.+)$/;

function eventKind(name: string, key: string | null): EventKind {
  if (key !== null) return 'Tournament or league';
  return TOUR.test(name) ? 'Bilateral tour' : 'Other event';
}

const plural = (n: number, one: string): string => `${n} ${one}`;

/** "England won 3-2, 1 drawn" for a contest of two sides, "Drawn 1-1", and the single match result for one match. */
export function twoSideResult(ms: readonly ListMatch[], a: Team, b: Team): string {
  let wa = 0, wb = 0, draws = 0, ties = 0, nr = 0;
  for (const m of ms) {
    if (m.winner >= 0) { if ((m.winner === 0 ? m.team1.id : m.team2.id) === a.id) wa++; else wb++; continue; }
    if (m.margin.startsWith('drawn')) draws++; else if (m.margin.startsWith('tied')) ties++; else nr++;
  }
  if (ms.length === 1) return wa ? `${a.name} won` : wb ? `${b.name} won` : draws ? 'Drawn' : ties ? 'Tied' : 'No result';
  const rest = [draws && wa + wb > 0 ? `${draws} drawn` : '', ties ? `${ties} tied` : '', nr ? `${nr} no result` : ''].filter(Boolean).join(', ');
  const lead = wa === wb ? `Drawn ${wa}-${wb}` : wa > wb ? `${a.name} won ${wa}-${wb}` : `${b.name} won ${wb}-${wa}`;
  return rest ? `${lead}, ${rest}` : lead;
}

/** The champion of an event of many sides: the winner of its last Final, when it has one. */
function champion(ms: readonly ListMatch[]): string {
  const finals = ms.filter((m) => m.stage === 'Final' && m.winner >= 0);
  const f = finals[finals.length - 1];
  return f ? `${(f.winner === 0 ? f.team1 : f.team2).name} won the Final` : '';
}

const sectionOf = (m: ListMatch): Section => formatTag(m) as Section;

/** Every row of the page, newest first within a section. Matches with no event name are left out. */
export function buildSeries(all: readonly ListMatch[]): Series[] {
  const groups = new Map<string, ListMatch[]>();
  for (const m of all) {
    if (!m.competition) continue;
    const k = `${m.competition}|${m.season ?? ''}|${sectionOf(m)}|${m.female ? 'f' : 'm'}`;
    const g = groups.get(k);
    if (g) g.push(m); else groups.set(k, [m]);
  }
  const out: Series[] = [];
  for (const [id, list] of groups) {
    const ms = [...list].sort((x, y) => x.date.localeCompare(y.date) || x.id - y.id);
    const f = ms[0]!;
    const seen = new Map<string, Team>();
    for (const m of ms) { if (!seen.has(m.team1.id)) seen.set(m.team1.id, m.team1); if (!seen.has(m.team2.id)) seen.set(m.team2.id, m.team2); }
    let teams = [...seen.values()];
    const tour = TOUR.exec(f.competition);
    // "England tour of India": England first, as the name says.
    if (teams.length === 2 && tour && teams[1]!.name === tour[1]) teams = [teams[1]!, teams[0]!];
    const kind = eventKind(f.competition, f.key);
    out.push({
      id, name: f.competition, season: f.season ?? '', section: sectionOf(f), female: f.female, kind, key: f.key, teams, first: f.date, last: ms[ms.length - 1]!.date, matches: ms,
      result: teams.length === 2 ? twoSideResult(ms, teams[0]!, teams[1]!) : champion(ms),
    });
  }
  return out;
}

// ---- Filters ----------------------------------------------------------------------------------------

export type FilterKey = 'gender' | 'season' | 'team' | 'kind';
export type Filters = Record<FilterKey, string | null>;
export const NO_FILTERS: Filters = { gender: null, season: null, team: null, kind: null };
export const FILTERS: ReadonlyArray<{ key: FilterKey; label: string }> = [{ key: 'kind', label: 'Event' }, { key: 'gender', label: 'Gender' }, { key: 'season', label: 'Season' }, { key: 'team', label: 'Team' }];

export function passes(s: Series, key: FilterKey, v: string): boolean {
  switch (key) {
    case 'gender': return v === 'Women' ? s.female : !s.female;
    case 'season': return s.season === v;
    case 'team': return s.teams.some((t) => t.id === v);
    case 'kind': return s.kind === v;
  }
}

export function applyFilters(rows: readonly Series[], f: Filters, skip?: FilterKey): Series[] {
  return rows.filter((s) => (Object.keys(f) as FilterKey[]).every((k) => k === skip || f[k] === null || passes(s, k, f[k]!)));
}

export interface Option { value: string; label: string; series: number }

/** The options of one filter, each with how many rows it leaves under the other filters and the search. An option with none is greyed. */
export function options(rows: readonly Series[], f: Filters, key: FilterKey, teamNames: ReadonlyMap<string, string>): Option[] {
  const pool = applyFilters(rows, f, key);
  const count = (v: string): number => pool.filter((s) => passes(s, key, v)).length;
  const make = (values: ReadonlyArray<readonly [string, string]>): Option[] => values.map(([value, label]) => ({ value, label, series: count(value) }));
  switch (key) {
    case 'gender': return make([['Men', 'Men'], ['Women', 'Women']]);
    case 'kind': return make(EVENT_KINDS.map((k) => [k, k] as const));
    case 'season': return make([...new Set(rows.map((s) => s.season).filter(Boolean))].sort((a, b) => b.localeCompare(a)).map((v) => [v, v] as const));
    case 'team': return make([...teamNames.entries()].sort((a, b) => a[1].localeCompare(b[1])));
  }
}

export const anyFilter = (f: Filters): boolean => (Object.values(f) as Array<string | null>).some((v) => v !== null);

/** Rows that fit every typed word: the event name (and its short names), the season and the teams (and their short names). "v", "vs" and "versus" are not looked for. */
export function searchSeries(rows: readonly Series[], text: string): Series[] {
  const said = splitGender(text);
  const tokens = queryTokens(said.rest);
  const pool = said.gender ? rows.filter((s) => (said.gender === 'women') === s.female) : rows;
  if (tokens.length === 0) return [...pool];
  return pool.filter((s) => scoreWords(tokens, [...eventWords(s.name), ...wordsOf(s.season, 1), ...s.teams.flatMap((t) => teamWords(t.name))]) !== null);
}

// ---- Sorting ----------------------------------------------------------------------------------------

export type SortKey = 'date' | 'name' | 'matches';
export interface Sort { key: SortKey; dir: 1 | -1 }
export const DEFAULT_SORT: Sort = { key: 'date', dir: -1 };

export function sortSeries(rows: readonly Series[], s: Sort): Series[] {
  const by = (a: Series, b: Series): number => (s.key === 'name' ? a.name.localeCompare(b.name) : s.key === 'matches' ? a.matches.length - b.matches.length : a.first.localeCompare(b.first));
  return [...rows].sort((a, b) => s.dir * by(a, b) || b.first.localeCompare(a.first) || a.name.localeCompare(b.name));
}

/** The rows of each section that has any, in section order. */
export function bySection(rows: readonly Series[]): Array<{ section: Section; rows: Series[] }> {
  return SECTIONS.map((section) => ({ section, rows: rows.filter((s) => s.section === section) })).filter((g) => g.rows.length > 0);
}

export const matchesText = (n: number): string => plural(n, n === 1 ? 'match' : 'matches');
