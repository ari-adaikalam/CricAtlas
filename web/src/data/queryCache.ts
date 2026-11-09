import { dataBaseUrl } from './sources';
import { currentPlayer, playerHas } from './store';

// A player's first look at a view asks the same questions every time (the default filters), so the answers are worked out ahead of time by the build script and kept in
// one small file for each player and view (p/view/<id>.<view>.json: a list of [question hash, rows]). A question that is in it is answered at once, with no query engine and no
// data; any other question (a filter was changed) goes to the engine as usual. A missing file or a missing answer costs only speed, never a wrong number.

export type ViewKind = 'bat' | 'bowl' | 'rec';

/** A 53-bit hash of the question as a short string (cyrb53). The same text gives the same hash in Node and in the browser. */
function hash(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function questionHash(files: readonly string[], sql: string, params: ReadonlyArray<string | number>): string {
  return hash(`${files.join(',')}|${sql}|${JSON.stringify(params)}`);
}

const LIMIT = 4;
const byPlayer = new Map<string, Map<string, unknown[]>>();
const requested = new Map<string, Promise<void>>();
const settled = new Set<string>();

/** The recorded rows for a question about the current player, or undefined. A copy, so a caller can change it freely. */
export function cachedRows(files: readonly string[], sql: string, params: ReadonlyArray<string | number>): unknown[] | undefined {
  const mine = byPlayer.get(currentPlayer() ?? '');
  if (!mine || mine.size === 0) return undefined;
  const rows = mine.get(questionHash(files, sql, params));
  return rows === undefined ? undefined : structuredClone(rows);
}

/** Keeps the answer the engine just worked out for the current player, so the same question asked again (a view opened after its data was loaded in the background) is answered at once. */
export function rememberResult(playerId: string, files: readonly string[], sql: string, params: ReadonlyArray<string | number>, rows: unknown[]): void {
  if (rows.length > 4000) return;
  // A copy, because the loader that asked may change its rows (the Form loader reverses them in place), and that must not change what is kept.
  rememberAnswers(playerId, [[questionHash(files, sql, params), structuredClone(rows)]]);
}

/** Keeps a player's recorded answers. The newest few players stay in memory. */
export function rememberAnswers(playerId: string, entries: ReadonlyArray<readonly [string, unknown[]]>): void {
  let mine = byPlayer.get(playerId);
  if (!mine) { mine = new Map(); byPlayer.set(playerId, mine); }
  for (const [question, rows] of entries) mine.set(question, rows);
  while (byPlayer.size > LIMIT) { const oldest = byPlayer.keys().next().value; if (oldest === undefined) break; byPlayer.delete(oldest); }
}

/** Forgets every recorded and remembered answer, so a check can run a loader from live data (scripts/verify-recorded.ts). */
export function forgetAnswers(): void { byPlayer.clear(); }

/** True once the file for this player and view has been fetched (or found missing), so a view can wait for it rather than race the engine. */
export function isViewCacheSettled(playerId: string, kind: ViewKind): boolean { return settled.has(`${playerId}|${kind}`); }

/** Fetches a player's recorded answers for a view. It never rejects: if the file cannot be had, the engine answers instead. */
export function fetchViewCache(playerId: string, kind: ViewKind): Promise<void> {
  const key = `${playerId}|${kind}`;
  const have = requested.get(key);
  if (have) return have;
  // A batter has no bowling view to fetch, and the other way round: the profile says which files exist.
  if ((kind === 'bat' && !playerHas(playerId, 'bat')) || (kind === 'bowl' && !playerHas(playerId, 'bowl'))) { settled.add(key); return Promise.resolve(); }
  const work = fetch(`${dataBaseUrl()}/p/view/${playerId}.${kind}.json`)
    .then(async (response) => {
      if (!response.ok) return;
      rememberAnswers(playerId, (await response.json()) as Array<[string, unknown[]]>);
    })
    .catch(() => undefined)
    .finally(() => { settled.add(key); });
  requested.set(key, work);
  return work;
}

/** Starts fetching all three views of a player, so they are in memory before a view is opened. */
export function prefetchViewCaches(playerId: string): void {
  for (const kind of ['bat', 'bowl', 'rec'] as const) void fetchViewCache(playerId, kind);
}
