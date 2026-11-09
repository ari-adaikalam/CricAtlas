// Writes p/view/<id>.<view>.json for every player and view (bat, bowl, rec): the answers to every question the view asks when it opens with the default filters,
// recorded by running the app's own loaders (src/data/views.ts) in Node. The browser answers those questions from this file with no query engine (src/data/queryCache.ts).
// Run from web/ after the profiles are built:  npx vite-node scripts/build-views.ts [--only id,id] [--limit n] [--kinds bat,bowl,rec]
// --kinds rebuilds only those views and leaves the others in place (after a change to one view's loaders).
// An answer too large to be worth sending (every shot of a long career, for the wagon wheel) is left out, so the engine answers that one when the tile is reached.
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, recordAnswers, startNodeRunner } from './node-runner';
import { setPlayer } from '../src/data/store';
import { runBatView, runBowlView, runRecordsView } from '../src/data/views';
import { defaultFilters, forAnalysis, normaliseFilters } from '../src/domain/filters';
import { DEFAULT_BALL_FILTERS } from '../src/domain/ballFilters';
import type { ProfileBundle } from '../src/data/profileData';

process.env.NEXT_PUBLIC_DATA_BASE_URL ??= 'http://localhost';
const MAX_ANSWER = 250_000;
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]!.split(',') : null;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const kinds = args.includes('--kinds') ? args[args.indexOf('--kinds') + 1]!.split(',') : ['bat', 'bowl', 'rec'];

await startNodeRunner();
// The files are written to a new folder and swapped in when all are done, so a page open while this runs never finds a view file missing or half written.
const live = path.join(dataDir, 'p', 'view');
const out = path.join(dataDir, 'p', 'view_new');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
if (fs.existsSync(live)) fs.cpSync(live, out, { recursive: true });
for (const f of fs.readdirSync(out)) if (kinds.some((k) => f.endsWith(`.${k}.json`))) fs.rmSync(path.join(out, f));
const ids = only ?? fs.readdirSync(path.join(dataDir, 'p', 'profile')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
const has = (kind: string, id: string): boolean => fs.existsSync(path.join(dataDir, 'p', kind, `${id}.parquet`));

const t0 = Date.now();
const stats = { players: 0, files: 0, bytes: 0, dropped: 0, droppedBytes: 0, failed: 0 };
for (const id of ids.slice(0, limit)) {
  const profile = JSON.parse(fs.readFileSync(path.join(dataDir, 'p', 'profile', `${id}.json`), 'utf8')) as ProfileBundle;
  const start = defaultFilters(profile.rows) ? normaliseFilters(profile.rows, defaultFilters(profile.rows)!) : null;
  if (!start) continue;
  setPlayer(id);
  const views: Array<[string, boolean, () => Promise<unknown>]> = [
    ['bat', has('bat', id), () => runBatView(id, forAnalysis(profile.rows, start).filters, DEFAULT_BALL_FILTERS)],
    ['bowl', has('bowl', id), () => runBowlView(id, forAnalysis(profile.rows, start).filters, DEFAULT_BALL_FILTERS)],
    ['rec', true, () => runRecordsView(id, start)],
  ];
  for (const [kind, wanted, run] of views) {
    if (!wanted || !kinds.includes(kind)) continue;
    try {
      const answers = await recordAnswers(run);
      const entries: Array<[string, unknown[]]> = [];
      for (const [hash, rows] of answers) {
        const size = JSON.stringify(rows).length;
        if (size > MAX_ANSWER) { stats.dropped += 1; stats.droppedBytes += size; continue; }
        entries.push([hash, rows]);
      }
      const text = JSON.stringify(entries);
      fs.writeFileSync(path.join(out, `${id}.${kind}.json`), text);
      stats.files += 1; stats.bytes += text.length;
    } catch (error) {
      stats.failed += 1;
      console.error(`${id} ${kind} failed:`, error instanceof Error ? error.message : error);
    }
  }
  stats.players += 1;
  if (stats.players % 250 === 0) console.log(`${stats.players} players, ${stats.files} files, ${(stats.bytes / 1e6).toFixed(0)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(`wrote ${stats.files} files for ${stats.players} players (${(stats.bytes / 1e6).toFixed(1)} MB), left out ${stats.dropped} large answers (${(stats.droppedBytes / 1e6).toFixed(0)} MB), ${stats.failed} failed, in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
fs.rmSync(live, { recursive: true, force: true });
fs.renameSync(out, live);
