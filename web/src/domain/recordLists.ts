// The Records page: the shapes of the files tools/records_files.py writes, and the small pure functions the page uses.

export type CellKind = 'player' | 'players' | 'team' | 'match' | 'matchname' | 'sub' | 'score' | 'text' | 'num' | 'dec1' | 'dec2' | 'overs' | 'date';
export type Cell = null | string | number | readonly [string, string] | readonly [number, string] | readonly [string, string, string, string];
export interface RecordList { id: string; title: string; note: string | null; cols: ReadonlyArray<readonly [CellKind, string]>; hl?: number | null; rows: ReadonlyArray<readonly Cell[]> }
export interface RecordsCategory { bpo: number; lists: RecordList[] }
export interface RecordsScope { key: string; label: string; kind: 'test' | 'odi' | 't20i' | 'league' | 'tournament'; gender: 'male' | 'female'; bpo: number; matches: number; lists: Record<string, number>; slices?: string[] }
/** One slice of a scope: a year, a decade, a team, a ground or a trophy, with its own record lists. `lists` holds the lists of each category in the order of the index. */
export interface RecordsSlice { key: string; label: string; matches: number; lists: number[] }
export type RecordsSlices = Partial<Record<SliceKind, RecordsSlice[]>>;
export type SliceKind = 'year' | 'decade' | 'team' | 'ground' | 'trophy';
export interface RecordsIndex { categories: ReadonlyArray<readonly [string, string]>; scopes: RecordsScope[]; since: number }

export type Gender = 'male' | 'female';

/** The balls of a spell as overs and balls: 123 balls is 20.3 in a six-ball over and 24.3 in a five-ball one (The Hundred), and 120 balls is 20.0 as the records pages write it. */
export function oversText(balls: number, ballsPerOver = 6): string {
  const whole = Math.floor(balls / ballsPerOver), rest = balls % ballsPerOver;
  return `${whole}.${rest}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateText(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''} ${y}`;
}

/** The text of a plain cell. Entity cells (player, team, match) are drawn by the page as links. */
export function cellText(kind: CellKind, cell: Cell, ballsPerOver: number): string {
  if (cell === null || cell === undefined) return '-';
  switch (kind) {
    case 'dec1': return typeof cell === 'number' ? cell.toFixed(1) : String(cell);
    case 'dec2': return typeof cell === 'number' ? cell.toFixed(2) : String(cell);
    case 'overs': return typeof cell === 'number' ? oversText(cell, ballsPerOver) : String(cell);
    case 'date': return typeof cell === 'string' ? dateText(cell) : String(cell);
    case 'num': return typeof cell === 'number' ? cell.toLocaleString('en') : String(cell);
    default: return Array.isArray(cell) ? String(cell[0]) : String(cell);
  }
}

/** The scopes of one gender in the order the page lists them: the formats, then the competitions with the most matches first. */
export function scopesOf(index: RecordsIndex, gender: Gender): RecordsScope[] {
  const order = { test: 0, odi: 1, t20i: 2, league: 3, tournament: 4 } as const;
  return index.scopes.filter((s) => s.gender === gender).sort((a, b) => order[a.kind] - order[b.kind] || b.matches - a.matches);
}

/** The scope to open on when the address names none, or names one that does not exist: Tests (men), else the first there is. */
export function defaultScope(index: RecordsIndex, wanted: string | null): RecordsScope | null {
  return index.scopes.find((s) => s.key === wanted) ?? index.scopes.find((s) => s.key === 'test-male') ?? index.scopes[0] ?? null;
}

/** The same format or competition for the other gender when it exists, else the other gender's first scope. */
export function switchGender(index: RecordsIndex, from: RecordsScope, gender: Gender): RecordsScope | null {
  if (from.gender === gender) return from;
  const twin = from.kind === 'tournament' ? index.scopes.find((s) => s.kind === 'tournament' && s.gender === gender && s.label.replace(/^(Men's|Women's) /, '') === from.label.replace(/^(Men's|Women's) /, '')) : index.scopes.find((s) => s.kind === from.kind && s.gender === gender);
  return twin ?? scopesOf(index, gender)[0] ?? null;
}

/** Lists whose title has every word of the search, in the order they come. */
export function searchLists(lists: readonly RecordList[], text: string): RecordList[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length === 0 ? [...lists] : lists.filter((l) => words.every((w) => l.title.toLowerCase().includes(w)));
}

/** The filters of the page in the order they are drawn. Decades sit with the years. */
export const SLICE_FILTERS: ReadonlyArray<{ id: string; label: string; kinds: readonly SliceKind[] }> = [
  { id: 'year', label: 'Year', kinds: ['decade', 'year'] },
  { id: 'team', label: 'Team', kinds: ['team'] },
  { id: 'ground', label: 'Ground', kinds: ['ground'] },
  { id: 'trophy', label: 'Trophy', kinds: ['trophy'] },
];

/** The slice with this key, in whichever kind it is. */
export function findSlice(slices: RecordsSlices | null, key: string | null): RecordsSlice | null {
  if (!slices || !key) return null;
  for (const list of Object.values(slices)) { const hit = list?.find((x) => x.key === key); if (hit) return hit; }
  return null;
}
