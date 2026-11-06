// Writes p/profile/<id>.json for every player: the whole profile page in one small file, so the page needs a single request and no query engine.
// Run from web/:  npx vite-node scripts/build-profiles.ts [--only id,id] [--limit n]
// It runs the app's own loaders (src/data/profileData.ts computeProfile) in Node, so the numbers are the browser's own.
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, startNodeRunner } from './node-runner';
import { computeProfile } from '../src/data/profileData';
import { setPlayer } from '../src/data/store';

process.env.NEXT_PUBLIC_DATA_BASE_URL ??= 'http://localhost';
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]!.split(',') : null;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

const conn = await startNodeRunner();
const ids = only ?? (await conn.runAndReadAll(`select player_id from '${path.join(dataDir, 'players.parquet')}' order by player_id`)).getRowObjects().map((r) => String(r.player_id));
const out = path.join(dataDir, 'p', 'profile');
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
let done = 0, bytes = 0, missing = 0;
for (const id of ids.slice(0, limit)) {
  setPlayer(id);
  const bundle = await computeProfile(id);
  if (!bundle) { missing += 1; continue; }
  // The kinds of per-player file this player has, so the browser never asks for one that is not there.
  bundle.has = ['bat', 'bowl', 'dis', 'bi', 'wi', 'pt', 'pm', 'tm', 'tr', 'lo', 'bp', 'fd'].filter((kind) => fs.existsSync(path.join(dataDir, 'p', kind, `${id}.parquet`)));
  // The point file (tools/point_files.py) is a .bin, for the tiles that filter in JavaScript.
  if (fs.existsSync(path.join(dataDir, 'p', 'pts', `${id}.bin`))) bundle.has.push('pts');
  if (fs.existsSync(path.join(dataDir, 'p', 'ptb', `${id}.bin`))) bundle.has.push('ptb');
  const text = JSON.stringify(bundle);
  fs.writeFileSync(path.join(out, `${id}.json`), text);
  bytes += text.length;
  done += 1;
  if (done % 500 === 0) console.log(`${done} profiles, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(`wrote ${done} profiles (${(bytes / 1e6).toFixed(1)} MB), ${missing} missing, in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
