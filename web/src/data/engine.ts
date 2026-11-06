import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { dataBaseUrl, PLAYER_KIND, SHARED_FILES, type DataFile, type PlayerKind } from './sources';
import { deviceCapability } from '@/domain/device';
import { cachedRows, rememberResult } from './queryCache';
import { currentPlayer, playerFile, sharedFile } from './store';

// One DuckDB-WASM instance per page. A player's files and the small shared tables are fetched whole and read from memory (see provide below), and any other file is read over HTTP range requests, so a query fetches only
// the row groups it needs. Browser only.

/** Where the engine files are served from, under the package version (see scripts/copy-duckdb.mjs). */
export const ENGINE_PATH = `/duckdb/${process.env.NEXT_PUBLIC_DUCKDB_VERSION ?? ''}`;

let ready: Promise<{ db: AsyncDuckDB; conn: AsyncDuckDBConnection }> | undefined;
const registered = new Set<DataFile>();

/** Starts the engine, trying a second time if the download or start-up fails (a cache or network hiccup should not leave the page without an engine). */
async function start(): Promise<{ db: AsyncDuckDB; conn: AsyncDuckDBConnection }> {
  try { return await startOnce(); } catch (first) {
    console.warn('The query engine did not start, trying again', first);
    await new Promise((resolve) => setTimeout(resolve, 400));
    return startOnce();
  }
}

async function startOnce(): Promise<{ db: AsyncDuckDB; conn: AsyncDuckDBConnection }> {
  if (typeof window === 'undefined') throw new Error('The data engine runs in the browser only.');
  const duckdb = await import('@duckdb/duckdb-wasm');
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: `${ENGINE_PATH}/duckdb-mvp.wasm`, mainWorker: `${ENGINE_PATH}/duckdb-browser-mvp.worker.js` },
    eh: { mainModule: `${ENGINE_PATH}/duckdb-eh.wasm`, mainWorker: `${ENGINE_PATH}/duckdb-browser-eh.worker.js` },
  });
  if (!bundle.mainWorker) throw new Error('No DuckDB worker is available for this browser.');
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), new Worker(bundle.mainWorker));
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();
  // The Parquet reader comes from the app's own files (scripts/copy-duckdb.mjs), not from DuckDB's server.
  const repo = `${window.location.origin}${ENGINE_PATH}/ext`;
  await conn.query(`SET custom_extension_repository='${repo}'`);
  await conn.query(`SET autoinstall_extension_repository='${repo}'`);
  return { db, conn };
}

function engine(): Promise<{ db: AsyncDuckDB; conn: AsyncDuckDBConnection }> {
  ready ??= start().catch((error: unknown) => { ready = undefined; throw error; });
  return ready;
}

/** Runs a query with `?` parameters against the named files. Numbers come back as numbers, and nothing is built from user text. */
/**
 * Starts the query engine (the WebAssembly download and start-up) in the background, so it is ready by the time a view needs it. Idle time only, and only ever one request for
 * the engine file: a second request for it at the same moment (a prefetch hint, say) makes the browser fail the cache write and the engine does not start.
 */
export function warmEngine(): void {
  // A light device (4 GB or less, a slow connection or data saver) starts the engine only when a question needs it: the download is about 7 MB and the engine holds about 300 MB.
  if (deviceCapability() === 'light') return;
  engine().catch(() => undefined);
}
export function warmEngineWhenIdle(): void {
  if (typeof window === 'undefined') return;
  if ('requestIdleCallback' in window) window.requestIdleCallback(() => warmEngine(), { timeout: 3000 });
  else globalThis.setTimeout(warmEngine, 1500);
}

/** Somewhere else to run the queries, such as Node for the build scripts, so the same loaders give the same answers there. Null runs them in the browser. */
export type Runner = (files: readonly DataFile[], sql: string, params: ReadonlyArray<string | number>) => Promise<unknown[]>;
let runner: Runner | null = null;
export function useRunner(next: Runner | null): void { runner = next; }

export async function query<Row>(files: readonly DataFile[], sql: string, params: ReadonlyArray<string | number> = []): Promise<Row[]> {
  // A question the build script already answered for this player's default view is answered from memory, without the engine (queryCache.ts).
  const known = cachedRows(files, sql, params);
  if (known) return known as Row[];
  if (runner) return (await runner(files, sql, params)) as Row[];
  const asked = currentPlayer();
  try {
    const { db, conn } = await engine();
    const duckdb = await import('@duckdb/duckdb-wasm');
    await Promise.all(files.map((file) => provide(db, duckdb, file)));
    const statement = await conn.prepare(sql);
    try {
      const began = performance.now();
      const result = await statement.query(...params);
      const rows = result.toArray().map((row) => plain<Row>(row.toJSON()));
      // Each question is timed in the browser's performance timeline (performance.getEntriesByType('measure')), for finding what a slow filter change is waiting on.
      performance.measure(`query ${sql.replace(/\s+/g, ' ').trim().slice(0, 70)}`, { start: began, end: performance.now() });
      // Kept for this player, so a view whose data was loaded in the background opens with it at once. Only when the player has not changed while the question was running.
      if (asked && asked === currentPlayer()) rememberResult(asked, files, sql, params, rows);
      return rows;
    } finally {
      await statement.close();
    }
  } catch (error) {
    // A failed read leaves a dead file handle behind, so a retry would fail the same way. Drop the files and register them again.
    await reset();
    throw error;
  }
}

/**
 * Makes a file readable under its name. A player's file is the current player's, fetched whole (store.ts) and registered from memory, replacing the previous player's.
 * A small shared table is fetched whole once. Anything else is read over HTTP with range requests, as before.
 */
const provided = new Map<DataFile, string>();
const pending = new Map<string, Promise<void>>();

function provide(db: AsyncDuckDB, duckdb: typeof import('@duckdb/duckdb-wasm'), file: DataFile): Promise<void> {
  const kind = (PLAYER_KIND as Partial<Record<DataFile, PlayerKind>>)[file];
  const player = kind ? currentPlayer() : null;
  if (kind && !player) return Promise.reject(new Error(`No player is set, so ${file} cannot be read.`));
  const key = player ? `${file}|${player}` : file;
  if (kind ? provided.get(file) === player : registered.has(file)) return Promise.resolve();
  const have = pending.get(key);
  if (have) return have;
  const work = (async () => {
    if (kind && player) {
      const data = await playerFile(kind, player);
      // The engine takes ownership of the buffer it is given, so it gets a copy and the cached bytes stay whole.
      await register(db, file, data.slice());
      provided.set(file, player);
    } else if (SHARED_FILES.has(file)) {
      await register(db, file, (await sharedFile(file)).slice());
      registered.add(file);
    } else {
      await db.registerFileURL(file, `${dataBaseUrl()}/${file}`, duckdb.DuckDBDataProtocol.HTTP, false);
      registered.add(file);
    }
  })().finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}

async function register(db: AsyncDuckDB, file: DataFile, data: Uint8Array): Promise<void> {
  try { await db.dropFile(file); } catch { /* it was not registered yet */ }
  await db.registerFileBuffer(file, data);
}

async function reset(): Promise<void> {
  // Forget the files so the next query registers them again. The worker stays up: ending it would leave queries that
  // are still in flight waiting forever. The wait is capped so a stuck worker cannot hide the error.
  registered.clear();
  provided.clear();
  const dropped = ready?.then(({ db }) => db.dropFiles()).catch(() => undefined);
  await Promise.race([dropped, new Promise((resolve) => setTimeout(resolve, 2000))]);
}

function plain<Row>(record: Record<string, unknown>): Row {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'bigint') out[key] = Number(value);
    // A sum of integers comes back as a decimal object (a typed array that prints as the number). A copy of it is a bare typed array that reads as NaN, so it becomes a plain number now.
    else if (ArrayBuffer.isView(value) && !(value instanceof DataView)) out[key] = Number.isNaN(Number(value)) ? Array.from(value as unknown as ArrayLike<number>) : Number(value);
    else out[key] = value;
  }
  return out as Row;
}
