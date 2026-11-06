// The API page: the pure parts. The page sends real requests to the live API from the browser, so what it shows must not trust what comes back: the answer is drawn as text, never as HTML.

/** The address of the live API. By default the API is served under this site's own /api (src/proxy.ts), so the page asks the same origin. One setting, so the API's own host or a local API needs no code change. */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api').replace(/\/$/, '');

/** This site's own origin, for the address shown in the page's examples before the browser can say it. */
export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://cricatlas.ariadaikalam.com').replace(/\/$/, '');

/** The absolute address a person pastes into a terminal: the base itself when it is already a full address, otherwise this site's origin in front of it. */
export function apiAddress(base: string = API_BASE, origin: string = SITE_ORIGIN): string {
  return /^https?:\/\//.test(base) ? base : origin + base;
}

export const PRESETS: ReadonlyArray<readonly [string, string]> = [
  ['Search a player', '/v1/players?q=kohli'],
  ["A team's record", '/v1/teams/record?team=India&gender=male'],
  ['India v Pakistan', '/v1/matches?team=India&opponent=Pakistan&gender=male&limit=3'],
  ['A match scorecard', '/v1/matches/1298150/scorecard'],
  ['Top run scorers', '/v1/leaderboards/batting?metric=runs&limit=5'],
  ['Kohli v Bumrah', '/v1/matchups?batter=ba607b88&bowler=462411b3'],
  ['An error (try it)', '/v1/competitions?limit=3'],
];

export interface RouteCard { title: string; text: string; paths: ReadonlyArray<readonly [string, string]> }
/** What the API holds, in six groups, each with example paths: the label shown, and the request it sends. */
export const ROUTE_CARDS: readonly RouteCard[] = [
  { title: 'Matches and scorecards', text: 'Match lists with filters, one match with its innings totals, squads and officials, the scorecard, powerplays, reviews and wickets.',
    paths: [['/v1/matches?team=India&opponent=Pakistan', '/v1/matches?team=India&opponent=Pakistan&gender=male&limit=3'], ['/v1/matches/{id}/scorecard', '/v1/matches/1298150/scorecard']] },
  { title: 'Players', text: 'Search by any spelling of a name, then a player\'s career batting, bowling and fielding, by season, opponent, venue or format.',
    paths: [['/v1/players?q=', '/v1/players?q=kohli'], ['/v1/leaderboards/batting?metric=runs', '/v1/leaderboards/batting?metric=runs&limit=5']] },
  { title: 'Teams and head to head', text: 'A team\'s results, split by opponent, venue, competition, format or season, and one team against another from either side.',
    paths: [['/v1/teams/record?team=India&gender=male', '/v1/teams/record?team=India&gender=male'], ['/v1/head-to-head?team=&opponent=', '/v1/head-to-head?team=India&opponent=Pakistan&gender=male']] },
  { title: 'Ball by ball', text: 'Every ball of an innings in order, with the columns you pick and paging with a cursor. The same columns as the published dataset.',
    paths: [['/v1/matches/{id}/innings/{n}/balls', '/v1/matches/1298150/innings/2/balls?limit=6']] },
  { title: 'Matchups', text: 'One batter against one bowler across the data, with the career filters. Player ids come from the player search.',
    paths: [['/v1/players?q=bumrah (find the id)', '/v1/players?q=bumrah'], ['/v1/matchups?batter=&bowler=', '/v1/matchups?batter=ba607b88&bowler=462411b3']] },
  { title: 'Competitions, venues, meta', text: 'Lists with match counts, and the data version, row counts, columns and licence of what is loaded right now.',
    paths: [['/v1/meta', '/v1/meta'], ['/v1/venues', '/v1/venues']] },
];

/** What a request costs, from the API's README: the limit is 60 tokens a minute with a burst of 20. */
export const COSTS: ReadonlyArray<readonly [string, number]> = [
  ['Leaderboards', 5],
  ['Balls, scorecard and other heavy routes', 3],
  ["A player's match history, matchups", 2],
  ['Everything else', 1],
];

/** The friendly names of the data versions (the API's dataset_versions.json: append only, so a hash keeps its name). The API says only the hash. */
export const DATASET_LABELS: Readonly<Record<string, string>> = {
  '3cb4dded36cd': 'Dataset v1',
  '74d7c5b6e654': 'Dataset v2',
  '5fc42bc763cd': 'Dataset v3',
};

/** "Dataset v3" for a known hash, and null for one that has no name yet (the page then shows no label). The hash itself is never shown. */
export function datasetLabel(hash: string | null | undefined): string | null {
  return (hash && DATASET_LABELS[hash]) || null;
}

/** The name the API gives the data it serves (coverage.dataset_display_name: a milestone's label, else "Data of <snapshot date>"), so this page, the documentation and the refresh emails say the same. A name equal to the hash is no name, and "Data of <date>" is left out because the date has its own pill. An older server that gives none falls back to the known labels. */
export function dataName(data: Record<string, unknown>, version: string | null): string | null {
  const name = (data.coverage as { dataset_display_name?: unknown } | undefined)?.dataset_display_name;
  if (typeof name === 'string' && name.length > 0 && name.length <= 60 && name !== version && !name.startsWith('Data of ')) return name;      // "Data of <date>" repeats the date pill
  return datasetLabel(version);
}

/** Why a path cannot be sent, or null. Only the API's own routes go out. */
export function pathProblem(path: string): string | null {
  const p = path.trim();
  if (p === '/health' || p.startsWith('/v1/')) return null;
  return 'The path must start with /v1/.';
}

export type Lang = 'curl' | 'js' | 'py';
export const LANGS: ReadonlyArray<readonly [Lang, string]> = [['curl', 'curl'], ['js', 'JavaScript'], ['py', 'Python']];

/** The request in the chosen language, ready to paste. */
export function snippet(lang: Lang, path: string, base: string = API_BASE): string {
  const url = base + (path.trim() || '/v1/meta');
  if (lang === 'curl') return `curl "${url}"`;
  if (lang === 'js') return `const res = await fetch("${url}");\nconst data = await res.json();\nconsole.log(data);`;
  return `import requests\n\nres = requests.get("${url}")\nprint(res.json())`;
}

export type TokenKind = 'k' | 's' | 'n' | 'b' | 'z' | 'p';
export interface Token { text: string; kind: TokenKind }
const JSON_PART = /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;

/** The pieces of a JSON text for colouring: keys, strings, numbers, booleans, null, and the plain text between. Joined, they are the text again. */
export function jsonTokens(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(JSON_PART)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), kind: 'p' });
    const s = m[0];
    out.push({ text: s, kind: s.startsWith('"') ? (m[2] ? 'k' : 's') : s === 'true' || s === 'false' ? 'b' : s === 'null' ? 'z' : 'n' });
    last = at + s.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: 'p' });
  return out;
}

/** The first lines of a long answer, and whether anything was cut. */
export function firstLines(text: string, max = 160): { shown: string; cut: boolean; total: number } {
  const lines = text.split('\n');
  return lines.length > max ? { shown: lines.slice(0, max).join('\n'), cut: true, total: lines.length } : { shown: text, cut: false, total: lines.length };
}

/** An answer as pretty JSON when it is JSON, as it came when it is not. */
export function prettyAnswer(text: string): string {
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

export interface ApiMeta { label: string | null; matches: number; balls: number; players: number; snapshot: string }

/** What the status line needs from /v1/meta, or null when the answer is not the shape expected. */
export function parseMeta(json: unknown): ApiMeta | null {
  const data = (json as { data?: Record<string, unknown> } | null)?.data;
  const tables = data?.tables as Record<string, { rows?: unknown }> | undefined;
  const n = (k: string): number | null => (typeof tables?.[k]?.rows === 'number' ? (tables[k]!.rows as number) : null);
  const matches = n('matches'), balls = n('balls'), players = n('players');
  if (!data || matches === null || balls === null || players === null) return null;
  const version = typeof data.data_version === 'string' ? data.data_version : null;
  return { label: dataName(data, version), matches, balls, players, snapshot: typeof data.snapshot_date === 'string' ? data.snapshot_date : '' };
}

/** The day of the last successful source check, "2026-10-31", from /freshness (refresh.last_successful_check_utc), or '' when the answer has none. */
export function parseChecked(json: unknown): string {
  const root = json as { data?: unknown; refresh?: { last_successful_check_utc?: unknown } } | null;
  const refresh = root?.refresh ?? (root?.data as typeof root)?.refresh;
  const at = refresh?.last_successful_check_utc;
  return typeof at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : '';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "10 Oct 2026" from "2026-10-10". */
export function snapshotText(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''} ${y}` : iso;
}
