// Copies the DuckDB-WASM files into public/duckdb/<version> so the engine and its worker load from the app's own origin
// (a worker cannot be created from another origin, and the app should not depend on a third-party CDN at runtime).
// The version is in the path, so the files can be cached for a year without ever going stale when the package is upgraded.
import { cpSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
const from = 'node_modules/@duckdb/duckdb-wasm/dist';
if (!existsSync(from)) process.exit(0);
const { version } = JSON.parse(readFileSync('node_modules/@duckdb/duckdb-wasm/package.json', 'utf8'));
rmSync('public/duckdb', { recursive: true, force: true });
mkdirSync(`public/duckdb/${version}`, { recursive: true });
for (const f of ['duckdb-mvp.wasm', 'duckdb-eh.wasm', 'duckdb-browser-mvp.worker.js', 'duckdb-browser-eh.worker.js']) {
  cpSync(`${from}/${f}`, `public/duckdb/${version}/${f}`);
}
// The Parquet reader the engine loads on start-up is served from here too, so no visitor's browser contacts DuckDB's own server (vendor/duckdb-extensions, fetched once from extensions.duckdb.org for the engine's version).
if (existsSync('vendor/duckdb-extensions')) cpSync('vendor/duckdb-extensions', `public/duckdb/${version}/ext`, { recursive: true });
