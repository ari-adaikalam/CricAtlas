import { dataBaseUrl, type DataFile, type PlayerKind } from './sources';

// The files a page needs, fetched whole and kept in memory. A player's file is one plain GET (no Range header, so no CORS preflight when the data lives on another
// host), and the same bytes serve every query that player's page makes. The engine registers them under the names the queries use (see sources.ts).

let current: string | null = null;

/**
 * The kinds of file a player has, once their profile has said (ProfileBundle.has). A kind they do not have is answered with the empty file without a request, so a batter's missing
 * bowling file is never asked for (a missing file is a 404, which a browser logs as an error when the host sends no CORS header on it). Unknown until the profile arrives.
 */
const has = new Map<string, ReadonlySet<string>>();
export function setPlayerFiles(playerId: string, kinds: readonly string[]): void { has.set(playerId, new Set(kinds)); }
export function playerHas(playerId: string, kind: string): boolean { return has.get(playerId)?.has(kind) ?? true; }

/** The player whose files the queries read. Set by the player page before it queries anything. */
export function setPlayer(playerId: string): void { current = playerId; }
export function currentPlayer(): string | null { return current; }

const LIMIT = 48;
const bytes = new Map<string, Promise<Uint8Array>>();

function remember(url: string, make: () => Promise<Uint8Array>): Promise<Uint8Array> {
  const have = bytes.get(url);
  if (have) { bytes.delete(url); bytes.set(url, have); return have; }
  const promise = make().catch((error: unknown) => { bytes.delete(url); throw error; });
  bytes.set(url, promise);
  // The newest files stay. A player is a few hundred kilobytes, so a few players back and forth cost nothing.
  while (bytes.size > LIMIT) { const oldest = bytes.keys().next().value; if (oldest === undefined) break; bytes.delete(oldest); }
  return promise;
}

async function get(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok && response.status !== 404) throw new Error(`${url} answered ${response.status}`);
  return response;
}

/** A player's file of one kind. A player with none (a batter who never bowled) gets the empty file with the same columns. */
export function playerFile(kind: PlayerKind, playerId: string): Promise<Uint8Array> {
  const base = dataBaseUrl();
  if (!playerHas(playerId, kind)) return remember(`${base}/p/${kind}/_empty.parquet`, async () => new Uint8Array(await (await get(`${base}/p/${kind}/_empty.parquet`)).arrayBuffer()));
  return remember(`${base}/p/${kind}/${playerId}.parquet`, async () => {
    const response = await get(`${base}/p/${kind}/${playerId}.parquet`);
    if (response.status !== 404) return new Uint8Array(await response.arrayBuffer());
    return remember(`${base}/p/${kind}/_empty.parquet`, async () => new Uint8Array(await (await get(`${base}/p/${kind}/_empty.parquet`)).arrayBuffer()));
  });
}

/** A small table everyone uses, fetched whole. */
export function sharedFile(file: DataFile): Promise<Uint8Array> {
  const url = `${dataBaseUrl()}/${file}`;
  return remember(url, async () => new Uint8Array(await (await get(url)).arrayBuffer()));
}

/** Starts fetching the files a player's views will need, so they are in memory before the first click. Nothing waits on it. */
export function prefetchPlayer(playerId: string, kinds: readonly PlayerKind[]): void {
  for (const kind of kinds) if (playerHas(playerId, kind)) playerFile(kind, playerId).catch(() => undefined);
}
