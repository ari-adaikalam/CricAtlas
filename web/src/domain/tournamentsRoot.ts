import { FORMAT_LABEL, QUALIFICATION_LEAGUES, isQualificationLeague, type Fmt, type TournamentInfo } from './tournament';
import { eventWords, queryTokens, scoreWords, splitGender } from './searchCore';

// The Tournaments page: the 32 tournaments and leagues that have a page, one row for each across all its editions, with search, four filters that narrow each other and sorting. It works on n/index.json alone.

export type FilterKey = 'kind' | 'gender' | 'format' | 'status';
export type Filters = Record<FilterKey, string | null>;
export const NO_FILTERS: Filters = { kind: null, gender: null, format: null, status: null };
export const FILTERS: ReadonlyArray<{ key: FilterKey; label: string }> = [{ key: 'kind', label: 'Kind' }, { key: 'gender', label: 'Gender' }, { key: 'format', label: 'Format' }, { key: 'status', label: 'Status' }];

const KINDS = ['International tournament', 'League'];

export { QUALIFICATION_LEAGUES, isQualificationLeague };

/** The line under a tournament's name: its kind and gender. */
export const kindLine = (t: TournamentInfo): string => `${isQualificationLeague(t) ? 'Qualification league' : t.kind === 'league' ? 'League' : 'International tournament'}, ${t.gender === 'female' ? 'women' : 'men'}`;

/** What the champion column says when there is no champion: why, for a qualification league, and that the data has no Final otherwise. */
export const noChampionText = (t: TournamentInfo): string => (isQualificationLeague(t) ? 'No final, the table decides qualification' : 'No final in the data');
const STATUS = ['Held in 2025 or 2026', 'Not held since 2024'];

/** The last year a season covers: 2026 for 2025/26, 2026 for 2026. */
export function lastYearOf(season: string): number {
  const y = parseInt(season.slice(0, 4), 10);
  return season.includes('/') ? y + 1 : y;
}
export const isActive = (t: TournamentInfo): boolean => lastYearOf(t.lastSeason) >= 2025;

export function passes(t: TournamentInfo, key: FilterKey, v: string): boolean {
  switch (key) {
    case 'kind': return v === KINDS[1] ? t.kind === 'league' : t.kind === 'tournament';
    case 'gender': return v === 'Women' ? t.gender === 'female' : t.gender === 'male';
    case 'format': return t.formats.includes(v as Fmt);
    case 'status': return v === STATUS[0] ? isActive(t) : !isActive(t);
  }
}

export function applyFilters(ts: readonly TournamentInfo[], f: Filters, skip?: FilterKey): TournamentInfo[] {
  return ts.filter((t) => (Object.keys(f) as FilterKey[]).every((k) => k === skip || f[k] === null || passes(t, k, f[k]!)));
}

export interface Option { value: string; label: string; tournaments: number }
/** The options of one filter, each with how many tournaments it leaves under the other filters and the search. An option with none is greyed. */
export function options(ts: readonly TournamentInfo[], f: Filters, key: FilterKey): Option[] {
  const pool = applyFilters(ts, f, key);
  const make = (values: ReadonlyArray<readonly [string, string]>): Option[] => values.map(([value, label]) => ({ value, label, tournaments: pool.filter((t) => passes(t, key, value)).length }));
  switch (key) {
    case 'kind': return make(KINDS.map((v) => [v, v] as const));
    case 'gender': return make([['Men', 'Men'], ['Women', 'Women']]);
    case 'format': return make((['TEST', 'ODI', 'T20', 'HUNDRED'] as const).map((k) => [k, FORMAT_LABEL[k]] as const));
    case 'status': return make(STATUS.map((v) => [v, v] as const));
  }
}
export const anyFilter = (f: Filters): boolean => (Object.values(f) as Array<string | null>).some((v) => v !== null);

export type SortKey = 'name' | 'format' | 'editions' | 'held' | 'matches' | 'teams' | 'champion' | 'titles';
export interface Sort { key: SortKey; dir: 1 | -1 }
export const DEFAULT_SORT: Sort = { key: 'matches', dir: -1 };

export const formatText = (t: TournamentInfo): string => t.formats.map((f) => FORMAT_LABEL[f]).join(', ');
/** "2007/08 to 2026", or the one season for a tournament held once. */
export const heldText = (t: TournamentInfo): string => (t.firstSeason === t.lastSeason ? t.firstSeason : `${t.firstSeason} to ${t.lastSeason}`);

export function sortTournaments(ts: readonly TournamentInfo[], s: Sort): TournamentInfo[] {
  const val = (t: TournamentInfo): number | string => {
    switch (s.key) {
      case 'name': return t.name;
      case 'format': return formatText(t);
      case 'editions': return t.editions;
      case 'held': return lastYearOf(t.firstSeason);
      case 'matches': return t.matches;
      case 'teams': return t.teams;
      case 'champion': return t.champion?.name ?? '￿';
      case 'titles': return t.titles[0]?.count ?? 0;
    }
  };
  return [...ts].sort((a, b) => {
    const x = val(a), y = val(b);
    const d = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
    return s.dir * d || b.matches - a.matches || a.name.localeCompare(b.name);
  });
}

/** How well a tournament fits the typed words (lower is better), or null: its name, the short letters of its name (ipl) and the short names for it (wc). */
export function tournamentScore(t: TournamentInfo, tokens: readonly string[]): number | null {
  return scoreWords(tokens, eventWords(t.name));
}

/** Tournaments that fit every typed word, in the order given. A word that says men or women narrows to that gender. No text gives all. */
export function searchTournaments(ts: readonly TournamentInfo[], text: string): TournamentInfo[] {
  const said = splitGender(text);
  const tokens = queryTokens(said.rest);
  const pool = said.gender ? ts.filter((t) => (said.gender === 'women') === (t.gender === 'female')) : ts;
  return tokens.length ? pool.filter((t) => tournamentScore(t, tokens) !== null) : [...pool];
}

/** The sides with the most titles, written out: up to three by name, otherwise how many are level. */
export function titlesText(t: TournamentInfo): { names: Array<{ id: string; name: string }>; more: string | null; count: number } | null {
  if (t.titles.length === 0) return null;
  const count = t.titles[0]!.count;
  return t.titles.length <= 3 ? { names: t.titles.map(({ id, name }) => ({ id, name })), more: null, count } : { names: [], more: `${t.titles.length} teams level`, count };
}
