import type { TeamIndexRow } from '@/data/teamData';
import { leagueOf } from './teamSearch';
import { queryTokens, scoreWords, splitGender, teamWords } from './searchCore';

// The Teams page: every team in one list with search, filters that narrow each other, sorting and a grouped view. It works on t/index.json alone, in the browser.

export interface RootTeam {
  id: string; name: string; gender: 'male' | 'female'; national: boolean;
  matches: number; won: number; lost: number; nr: number;
  /** Wins over the matches that had a result (a draw or a tie counts as not won, a no result is left out), as on the Team page. Null with no match that had a result. */
  rate: number | null;
  titles: number; firstYear: number; lastYear: number;
  comps: string[]; fmts: string[];
  /** A national team's own name, or the country a franchise's league is played in. */
  country: string;
  /** The league's short name for a franchise, null for a national team. */
  league: string | null;
  earlier: string[];
}

// The country each franchise league is played in. A league is one of the 12 in the dataset, so this list is complete.
const LEAGUE_COUNTRY: Record<string, string> = {
  bbl: 'Australia', bpl: 'Bangladesh', cpl: 'West Indies', hnd: 'England', ilt: 'United Arab Emirates', ipl: 'India', lpl: 'Sri Lanka', mlc: 'United States', psl: 'Pakistan', sat: 'South Africa', wbb: 'Australia', wpl: 'India',
};

export function toRoot(r: TeamIndexRow): RootTeam {
  const key = r.id.split('|')[1] ?? '';
  const decided = r.matches - r.nr;
  return {
    id: r.id, name: r.name, gender: r.gender, national: r.national, matches: r.matches, won: r.won, lost: r.lost, nr: r.nr, rate: decided > 0 ? r.won / decided : null, titles: r.titles,
    firstYear: r.firstYear, lastYear: r.lastYear, comps: r.comps, fmts: r.fmts, country: r.national ? r.name : (LEAGUE_COUNTRY[key] ?? ''), league: r.national ? null : leagueOf(r.id), earlier: r.earlier,
  };
}

// ---- Filters ----------------------------------------------------------------------------------------

export type FilterKey = 'type' | 'gender' | 'league' | 'country' | 'format' | 'status' | 'matches' | 'titles' | 'rate' | 'era';
export type Filters = Record<FilterKey, string | null>;
export const NO_FILTERS: Filters = { type: null, gender: null, league: null, country: null, format: null, status: null, matches: null, titles: null, rate: null, era: null };

export interface FilterDef { key: FilterKey; label: string; more: boolean }
/** The filters in the order of the page: the first five in the row, the rest behind More filters. */
export const FILTERS: readonly FilterDef[] = [
  { key: 'type', label: 'Type', more: false }, { key: 'gender', label: 'Gender', more: false }, { key: 'league', label: 'League', more: false }, { key: 'country', label: 'Country', more: false }, { key: 'format', label: 'Format', more: false },
  { key: 'status', label: 'Status', more: true }, { key: 'matches', label: 'Matches', more: true }, { key: 'titles', label: 'Titles', more: true }, { key: 'rate', label: 'Win rate', more: true }, { key: 'era', label: 'First match', more: true },
];

export const FORMAT_OPTIONS: ReadonlyArray<[string, string]> = [['TEST', 'Tests'], ['ODI', 'ODIs'], ['T20I', 'T20Is'], ['T20', 'T20 league'], ['HUNDRED', 'The Hundred']];
const STATUS = ['Active in 2025 or 2026', 'Not active since 2024'];
const MATCHES = ['100 or more', '250 or more', '500 or more', '1000 or more'];
const TITLES = ['1 or more', '2 or more', '5 or more'];
const RATES = ['40% or more', '50% or more', '60% or more'];
const ERAS: Record<string, [number, number]> = { 'First match 2001 to 2009': [2001, 2009], 'First match 2010 to 2019': [2010, 2019], 'First match 2020 to 2026': [2020, 2026] };
const NATIONAL = 'National team', FRANCHISE = 'Franchise', MEN = 'Men', WOMEN = 'Women';
const num = (v: string): number => parseInt(v, 10);

/** Whether a team passes one filter at a value. */
export function passes(t: RootTeam, key: FilterKey, v: string): boolean {
  switch (key) {
    case 'type': return v === NATIONAL ? t.national : !t.national;
    case 'gender': return v === MEN ? t.gender === 'male' : t.gender === 'female';
    case 'league': return t.comps.includes(v);
    case 'country': return t.country === v;
    case 'format': return t.fmts.includes(v);
    case 'status': return v === STATUS[0] ? t.lastYear >= 2025 : t.lastYear < 2025;
    case 'matches': return t.matches >= num(v);
    case 'titles': return t.titles >= num(v);
    case 'rate': return t.rate !== null && t.rate * 100 >= num(v);
    case 'era': { const e = ERAS[v]; return e ? t.firstYear >= e[0] && t.firstYear <= e[1] : false; }
  }
}

export function applyFilters(ts: readonly RootTeam[], f: Filters, skip?: FilterKey): RootTeam[] {
  return ts.filter((t) => (Object.keys(f) as FilterKey[]).every((k) => k === skip || f[k] === null || passes(t, k, f[k]!)));
}

export interface Option { value: string; label: string; teams: number }

/**
 * The options of one filter, each with how many teams it leaves under every other filter. An option with no teams is shown greyed ("no teams"), so a choice can never lead to an empty page by itself.
 * `names` maps a competition key to its name for the League filter.
 */
export function options(ts: readonly RootTeam[], f: Filters, key: FilterKey, names: ReadonlyMap<string, string> = new Map()): Option[] {
  const pool = applyFilters(ts, f, key);
  const count = (v: string): number => pool.filter((t) => passes(t, key, v)).length;
  const make = (values: ReadonlyArray<readonly [string, string]>): Option[] => values.map(([value, label]) => ({ value, label, teams: count(value) }));
  switch (key) {
    case 'type': return make([[NATIONAL, NATIONAL], [FRANCHISE, FRANCHISE]]);
    case 'gender': return make([[MEN, MEN], [WOMEN, WOMEN]]);
    case 'league': return make([...new Set(ts.flatMap((t) => t.comps))].map((k) => [k, names.get(k) ?? k] as const).sort((a, b) => a[1].localeCompare(b[1])));
    case 'country': return make([...new Set(ts.map((t) => t.country).filter(Boolean))].sort().map((c) => [c, c] as const));
    case 'format': return make(FORMAT_OPTIONS);
    case 'status': return make(STATUS.map((v) => [v, v] as const));
    case 'matches': return make(MATCHES.map((v) => [v, v] as const));
    case 'titles': return make(TITLES.map((v) => [v, v] as const));
    case 'rate': return make(RATES.map((v) => [v, v] as const));
    case 'era': return make(Object.keys(ERAS).map((v) => [v, v] as const));
  }
}

export const anyFilter = (f: Filters): boolean => (Object.values(f) as Array<string | null>).some((v) => v !== null);

// ---- Sorting, grouping, search ----------------------------------------------------------------------

export type SortKey = 'name' | 'country' | 'matches' | 'won' | 'lost' | 'rate' | 'titles' | 'firstYear';
export interface Sort { key: SortKey; dir: 1 | -1 }
export const DEFAULT_SORT: Sort = { key: 'matches', dir: -1 };

export function sortTeams(ts: readonly RootTeam[], s: Sort): RootTeam[] {
  const val = (t: RootTeam): number | string => (s.key === 'name' ? t.name : s.key === 'country' ? `${t.league ?? ''} ${t.country}` : s.key === 'rate' ? (t.rate ?? -1) : t[s.key]);
  return [...ts].sort((a, b) => {
    const x = val(a), y = val(b);
    const d = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
    return s.dir * d || b.matches - a.matches || a.name.localeCompare(b.name);
  });
}

/** How well a team fits the typed words (lower is better), or null: its name or an earlier name, its short name (IND, RCB) or the short letters of its name. */
export function teamScore(t: RootTeam, tokens: readonly string[]): number | null {
  return scoreWords(tokens, teamWords(t.name, t.earlier));
}

/** Teams that fit every typed word, in the order given. A word that says men or women narrows to that gender. No text matches all. */
export function searchTeams(ts: readonly RootTeam[], text: string): RootTeam[] {
  const said = splitGender(text);
  const tokens = queryTokens(said.rest);
  const pool = said.gender ? ts.filter((t) => (said.gender === 'women') === (t.gender === 'female')) : ts;
  return tokens.length ? pool.filter((t) => teamScore(t, tokens) !== null) : [...pool];
}

export const activeText = (t: RootTeam): string => (t.firstYear === t.lastYear ? String(t.firstYear) : `${t.firstYear} to ${t.lastYear}`);
