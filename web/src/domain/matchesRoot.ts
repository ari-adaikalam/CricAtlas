import type { ListMatch } from '@/data/matchList';
import { leagueOf } from './teamSearch';
import { eventWords, personWords, queryTokens, scoreWords, splitGender, teamWords, wordsOf, type Word } from './searchCore';

// The Matches page: every match in one list with search, filters that narrow each other and sorting by date or venue. It works on mlist.json alone, in the browser.

export type FilterKey = 'format' | 'gender' | 'competition' | 'season' | 'team' | 'result' | 'stage' | 'venue' | 'country' | 'toss' | 'wonBy';
export type Filters = Record<FilterKey, string | null>;
export const NO_FILTERS: Filters = { format: null, gender: null, competition: null, season: null, team: null, result: null, stage: null, venue: null, country: null, toss: null, wonBy: null };

export interface FilterDef { key: FilterKey; label: string; more: boolean }
export const FILTERS: readonly FilterDef[] = [
  { key: 'format', label: 'Format', more: false }, { key: 'gender', label: 'Gender', more: false }, { key: 'competition', label: 'Competition', more: false }, { key: 'season', label: 'Season', more: false }, { key: 'team', label: 'Team', more: false },
  { key: 'result', label: 'Result', more: true }, { key: 'stage', label: 'Stage', more: true }, { key: 'venue', label: 'Venue', more: true }, { key: 'country', label: 'Country', more: true }, { key: 'toss', label: 'Toss', more: true }, { key: 'wonBy', label: 'Won by', more: true },
];

export const OTHER_COMPETITIONS = '*other*';
export const FORMAT_LABEL = { test: 'Tests', odi: 'ODIs', t20: 'T20s', hundred: 'The Hundred' } as const;
const RESULTS = ['Won', 'Drawn', 'Tied', 'No result'];
const TOSS = ['Chose to bat', 'Chose to field'];
const WON_BY = ['Team batting first', 'Team chasing'];

/** How a match ended, for the Result filter: a winner (a Super Over decides a tie for its winner) is Won, then Drawn, Tied (no winner) and No result. */
export function resultOf(m: ListMatch): string {
  if (m.winner >= 0) return 'Won';
  if (m.margin.startsWith('drawn')) return 'Drawn';
  return m.margin.startsWith('tied') ? 'Tied' : 'No result';
}

/** The format as the list says it: Test, ODI, T20I for a T20 between national teams, T20 for the rest, The Hundred. */
export function formatTag(m: ListMatch): string {
  return m.kind === 'test' ? 'Test' : m.kind === 'odi' ? 'ODI' : m.kind === 'hundred' ? 'The Hundred' : m.international ? 'T20I' : 'T20';
}

export function passes(m: ListMatch, key: FilterKey, v: string): boolean {
  switch (key) {
    case 'format': return m.kind === v;
    case 'gender': return v === 'Women' ? m.female : !m.female;
    case 'competition': return v === OTHER_COMPETITIONS ? m.key === null : m.key === v;
    case 'season': return m.season === v;
    case 'team': return m.team1.id === v || m.team2.id === v;
    case 'result': return resultOf(m) === v;
    case 'stage': return m.stage === v;
    case 'venue': return m.venue === v;
    case 'country': return m.country === v;
    case 'toss': return m.tossDecision === (v === TOSS[0] ? 1 : 2);
    case 'wonBy': return m.winner >= 0 && m.batFirst >= 0 && (v === WON_BY[0] ? m.winner === m.batFirst : m.winner !== m.batFirst);
  }
}

export function applyFilters(ms: readonly ListMatch[], f: Filters, skip?: FilterKey): ListMatch[] {
  return ms.filter((m) => (Object.keys(f) as FilterKey[]).every((k) => k === skip || f[k] === null || passes(m, k, f[k]!)));
}

export interface Option { value: string; label: string; matches: number }

/** A team's name for the Team filter: a name used by more than one team (a men's and a women's side, or two leagues) is told apart by its league and gender. */
export function teamLabels(ms: readonly ListMatch[]): ReadonlyMap<string, string> {
  const teams = new Map<string, { id: string; name: string }>();
  for (const m of ms) { teams.set(m.team1.id, m.team1); teams.set(m.team2.id, m.team2); }
  const byName = new Map<string, number>();
  for (const t of teams.values()) byName.set(t.name, (byName.get(t.name) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const t of teams.values()) {
    const parts = t.id.split('|');
    const women = parts[2] === 'female', league = leagueOf(t.id);
    out.set(t.id, (byName.get(t.name) ?? 0) > 1 ? `${t.name} (${[league ?? (parts[1] === 'intl' ? null : parts[1]), women ? 'women' : league ? 'men' : null].filter(Boolean).join(', ') || (women ? 'women' : 'men')})` : t.name);
  }
  return out;
}

/** The options of one filter, each with how many matches it leaves under every other filter and the search. An option with none is greyed. `competitionNames` maps a tournament key to its name. */
export function options(ms: readonly ListMatch[], f: Filters, key: FilterKey, competitionNames: ReadonlyMap<string, string>, labels: ReadonlyMap<string, string>): Option[] {
  const pool = applyFilters(ms, f, key);
  const count = (v: string): number => pool.filter((m) => passes(m, key, v)).length;
  const make = (values: ReadonlyArray<readonly [string, string]>): Option[] => values.map(([value, label]) => ({ value, label, matches: count(value) }));
  const strings = (vs: readonly string[]): Option[] => make(vs.map((v) => [v, v] as const));
  const uniq = (get: (m: ListMatch) => string | null): string[] => [...new Set(ms.map(get).filter((x): x is string => Boolean(x)))];
  switch (key) {
    case 'format': return make((Object.keys(FORMAT_LABEL) as Array<keyof typeof FORMAT_LABEL>).map((k) => [k, FORMAT_LABEL[k]] as const));
    case 'gender': return strings(['Men', 'Women']);
    case 'competition': return make([...[...new Set(ms.map((m) => m.key).filter((k): k is string => k !== null))].map((k) => [k, competitionNames.get(k) ?? k] as const).sort((a, b) => a[1].localeCompare(b[1])), [OTHER_COMPETITIONS, 'Bilateral series and other events'] as const]);
    case 'season': return strings(uniq((m) => m.season).sort((a, b) => b.localeCompare(a)));
    case 'team': return make([...labels.entries()].sort((a, b) => a[1].localeCompare(b[1])));
    case 'result': return strings(RESULTS);
    case 'stage': return strings(uniq((m) => m.stage).sort());
    case 'venue': return strings(uniq((m) => m.venue).sort());
    case 'country': return strings(uniq((m) => m.country).sort());
    case 'toss': return strings(TOSS);
    case 'wonBy': return strings(WON_BY);
  }
}

export const anyFilter = (f: Filters): boolean => (Object.values(f) as Array<string | null>).some((v) => v !== null);

export type SortKey = 'date' | 'venue';
export interface Sort { key: SortKey; dir: 1 | -1 }
export const DEFAULT_SORT: Sort = { key: 'date', dir: -1 };

export function sortMatches(ms: readonly ListMatch[], s: Sort): ListMatch[] {
  return [...ms].sort((a, b) => s.dir * (s.key === 'venue' ? (a.venue ?? '').localeCompare(b.venue ?? '') : a.date.localeCompare(b.date)) || b.date.localeCompare(a.date) || b.id - a.id);
}

/** The words a match is searched by, with what each costs: the teams (and their short names), the competition (and its short names), then the stage, ground, player of the match and season. */
const searchWordsOf = new WeakMap<ListMatch, Word[]>();
function matchWords(m: ListMatch): Word[] {
  let w = searchWordsOf.get(m);
  if (!w) {
    w = [...teamWords(m.team1.name), ...teamWords(m.team2.name), ...eventWords(m.competition).map(([x]) => [x, 1] as const), ...wordsOf(`${m.stage ?? ''} ${m.venue ?? ''} ${m.season ?? ''}`, 2), ...(m.potm ? personWords(m.potm.name).map(([x]) => [x, 2] as const) : [])];
    searchWordsOf.set(m, w);
  }
  return w;
}

/** Matches that fit every typed word (teams, short names such as rcb, competition, stage, ground, player of the match, season), in the order given. "india vs england" is two teams, so the joining word is not looked for. No text gives every match. */
export function searchMatches(ms: readonly ListMatch[], text: string): ListMatch[] {
  const said = splitGender(text);
  const tokens = queryTokens(said.rest);
  const pool = said.gender ? ms.filter((m) => (said.gender === 'women') === m.female) : ms;
  return tokens.length === 0 ? [...pool] : pool.filter((m) => scoreWords(tokens, matchWords(m)) !== null);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "8 Mar" and "2026" from an ISO date. */
export const dayMonth = (iso: string): string => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''}`;
