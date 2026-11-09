import type { ListPlayer } from '@/data/playerList';
import { personWords, queryTokens, scoreWords, splitGender } from './searchCore';

// The Players page: every player in one list with search, filters that narrow each other and sorting. It works on plist.json alone, in the browser.

export type RoleGroup = 'Batters' | 'Bowlers' | 'Allrounders' | 'Wicketkeeper batters';
/** The role of the dataset's own words as one of four groups. A player with no role (no profile) belongs to none. */
export function roleGroup(role: string | null): RoleGroup | null {
  if (!role) return null;
  if (role.includes('wicketkeeper')) return 'Wicketkeeper batters';
  if (role.includes('allrounder')) return 'Allrounders';
  if (role === 'bowler') return 'Bowlers';
  return role.includes('batter') ? 'Batters' : null;
}

export type BowlingGroup = 'Pace' | 'Spin' | 'None';
/** Pace for fast and medium bowlers, Spin for the others (off breaks, leg breaks, orthodox, wrist spin), None for a player with no bowling style. */
export function bowlingGroup(style: string | null): BowlingGroup {
  if (!style) return 'None';
  return /fast|medium/.test(style) ? 'Pace' : 'Spin';
}

export const handOf = (p: ListPlayer): string | null => (p.batting === 'right-hand bat' ? 'Right-hand bat' : p.batting === 'left-hand bat' ? 'Left-hand bat' : null);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
export const styleOf = (p: ListPlayer): string | null => (p.bowling ? cap(p.bowling) : null);

export type FilterKey = 'gender' | 'country' | 'role' | 'hand' | 'bowling' | 'era' | 'format' | 'league' | 'style' | 'status' | 'matches' | 'wickets' | 'runs';
export type Filters = Record<FilterKey, string | null>;
export const NO_FILTERS: Filters = { gender: null, country: null, role: null, hand: null, bowling: null, era: null, format: null, league: null, style: null, status: null, matches: null, wickets: null, runs: null };

export interface FilterDef { key: FilterKey; label: string; more: boolean }
export const FILTERS: readonly FilterDef[] = [
  { key: 'gender', label: 'Gender', more: false }, { key: 'country', label: 'Country', more: false }, { key: 'role', label: 'Role', more: false }, { key: 'hand', label: 'Batting', more: false },
  { key: 'bowling', label: 'Bowling', more: false }, { key: 'era', label: 'Era', more: false },
  { key: 'format', label: 'Format', more: true }, { key: 'league', label: 'Played in', more: true }, { key: 'style', label: 'Style', more: true }, { key: 'status', label: 'Status', more: true },
  { key: 'matches', label: 'Matches', more: true }, { key: 'wickets', label: 'Wickets', more: true }, { key: 'runs', label: 'Runs', more: true },
];

export const FORMAT_OPTIONS: ReadonlyArray<[string, string]> = [['TEST', 'Tests'], ['ODI', 'ODIs'], ['T20I', 'T20Is'], ['T20', 'T20 matches'], ['HUNDRED', 'The Hundred']];
const ERAS: Record<string, [number, number]> = { 'Debuted 2001 to 2009': [2001, 2009], 'Debuted 2010 to 2019': [2010, 2019], 'Debuted 2020 to 2026': [2020, 2026] };
const STATUS = ['Active in 2025 or 2026', 'Last played before 2025'];
const COUNTS = ['50 or more', '100 or more', '250 or more', '500 or more'];
const RUNS = ['1,000 or more', '5,000 or more', '10,000 or more', '20,000 or more'];
const num = (v: string): number => parseInt(v.replace(',', ''), 10);

export function passes(p: ListPlayer, key: FilterKey, v: string): boolean {
  switch (key) {
    case 'gender': return v === 'Men' ? p.gender === 'male' : p.gender === 'female';
    case 'country': return p.country === v;
    case 'role': return roleGroup(p.role) === v;
    case 'hand': return handOf(p) === v;
    case 'bowling': return bowlingGroup(p.bowling) === v;
    case 'era': { const e = ERAS[v]; return Boolean(e) && p.firstYear !== null && p.firstYear >= e![0] && p.firstYear <= e![1]; }
    case 'format': return p.fmts.includes(v);
    case 'league': return p.leagues.includes(v);
    case 'style': return styleOf(p) === v;
    case 'status': return p.lastYear !== null && (v === STATUS[0] ? p.lastYear >= 2025 : p.lastYear < 2025);
    case 'matches': return p.matches >= num(v);
    case 'wickets': return p.wickets >= num(v);
    case 'runs': return p.runs >= num(v);
  }
}

export function applyFilters(ps: readonly ListPlayer[], f: Filters, skip?: FilterKey): ListPlayer[] {
  return ps.filter((p) => (Object.keys(f) as FilterKey[]).every((k) => k === skip || f[k] === null || passes(p, k, f[k]!)));
}

export interface Option { value: string; label: string; players: number }

/** The options of one filter, each with how many players it leaves under every other filter. An option with none is shown greyed. `names` maps a league key to its name. */
export function options(ps: readonly ListPlayer[], f: Filters, key: FilterKey, names: ReadonlyMap<string, string> = new Map()): Option[] {
  const pool = applyFilters(ps, f, key);
  const count = (v: string): number => pool.filter((p) => passes(p, key, v)).length;
  const make = (values: ReadonlyArray<readonly [string, string]>): Option[] => values.map(([value, label]) => ({ value, label, players: count(value) }));
  const strings = (vs: readonly string[]): Option[] => make(vs.map((v) => [v, v] as const));
  switch (key) {
    case 'gender': return strings(['Men', 'Women']);
    case 'country': return strings([...new Set(ps.map((p) => p.country).filter((c): c is string => Boolean(c)))].sort());
    case 'role': return strings(['Batters', 'Bowlers', 'Allrounders', 'Wicketkeeper batters']);
    case 'hand': return strings(['Right-hand bat', 'Left-hand bat']);
    case 'bowling': return strings(['Pace', 'Spin', 'None']);
    case 'era': return strings(Object.keys(ERAS));
    case 'format': return make(FORMAT_OPTIONS);
    case 'league': return make([...new Set(ps.flatMap((p) => p.leagues))].map((k) => [k, names.get(k) ?? k] as const).sort((a, b) => a[1].localeCompare(b[1])));
    case 'style': return strings([...new Set(ps.map(styleOf).filter((s): s is string => Boolean(s)))].sort());
    case 'status': return strings(STATUS);
    case 'matches': case 'wickets': return strings(COUNTS);
    case 'runs': return strings(RUNS);
  }
}

export const anyFilter = (f: Filters): boolean => (Object.values(f) as Array<string | null>).some((v) => v !== null);

export type SortKey = 'name' | 'country' | 'firstYear' | 'matches' | 'runs' | 'wickets';
export interface Sort { key: SortKey; dir: 1 | -1 }
export const DEFAULT_SORT: Sort = { key: 'matches', dir: -1 };

export function sortPlayers(ps: readonly ListPlayer[], s: Sort): ListPlayer[] {
  const val = (p: ListPlayer): number | string => (s.key === 'name' ? p.name : s.key === 'country' ? (p.country ?? '') : (p[s.key] ?? 0));
  return [...ps].sort((a, b) => {
    const x = val(a), y = val(b);
    const d = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
    return s.dir * d || b.matches - a.matches || a.name.localeCompare(b.name);
  });
}

/** Players that fit every typed word, best first, the most matches first among equals. A word may be part of the name or full name, the short letters of either (msd), or a typo. No text gives every player. */
export function searchPlayers(ps: readonly ListPlayer[], text: string): ListPlayer[] {
  const said = splitGender(text);
  const tokens = queryTokens(said.rest);
  const pool = said.gender ? ps.filter((p) => (said.gender === 'women') === (p.gender === 'female')) : ps;
  if (tokens.length === 0) return [...pool];
  return pool.map((p) => ({ p, s: scoreWords(tokens, personWords(p.name, p.fullName)) })).filter((x): x is { p: ListPlayer; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || b.p.matches - a.p.matches || a.p.name.localeCompare(b.p.name)).map((x) => x.p);
}

export const activeText = (p: ListPlayer): string => (p.firstYear === null || p.lastYear === null ? '-' : p.firstYear === p.lastYear ? String(p.firstYear) : `${p.firstYear} to ${p.lastYear}`);
/** "Right-arm offbreak bowler" style line under a name: the role, else the bowling style. */
export const lineOf = (p: ListPlayer): string => [p.role ? p.role.charAt(0).toUpperCase() + p.role.slice(1) : null, p.bowling && p.role !== 'bowler' ? styleOf(p) : null].filter(Boolean).join(', ');
