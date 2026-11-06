// "Recorded equals live": for each player, the datasets of the Batting and Bowling views are loaded once from live SQL and once from the player's recorded answers (p/view), the way the browser
// replays them, and must be identical. A recorded answer stored after a loader reversed its rows in place made the False shot trend show the wrong innings (2026-10-20). Run from web/:
//   npx vite-node --config vitest.config.ts scripts/verify-recorded.ts [id ...]
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, startNodeRunner } from './node-runner';
import { forgetAnswers, rememberAnswers } from '../src/data/queryCache';
import { setPlayer } from '../src/data/store';
import { loadBatCore, loadBowlCore } from '../src/data/views';
import { DEFAULT_BALL_FILTERS } from '../src/domain/ballFilters';
import { defaultFilters, forAnalysis, normaliseFilters } from '../src/domain/filters';
import type { ProfileBundle } from '../src/data/profileData';

process.env.NEXT_PUBLIC_DATA_BASE_URL ??= 'http://localhost';
await startNodeRunner();
const ids = process.argv.slice(2);
let compared = 0, different = 0, orderOnly = 0;
// The same content in a different order: a group-by without an order gives its rows in a different order on every run, so rows are compared as sets as well.
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon).map((x) => JSON.stringify(x)).sort() : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)])) : v);
for (const id of ids) {
  const profile = JSON.parse(fs.readFileSync(path.join(dataDir, 'p', 'profile', `${id}.json`), 'utf8')) as ProfileBundle;
  const start = normaliseFilters(profile.rows, defaultFilters(profile.rows)!)!;
  setPlayer(id);
  for (const kind of ['bat', 'bowl'] as const) {
    const file = path.join(dataDir, 'p', 'view', `${id}.${kind}.json`);
    if (!fs.existsSync(file)) continue;
    const filters = forAnalysis(profile.rows, start).filters;
    const load = kind === 'bat' ? loadBatCore : loadBowlCore;
    forgetAnswers();
    const live = JSON.stringify(await load(id, filters, DEFAULT_BALL_FILTERS));
    rememberAnswers(id, JSON.parse(fs.readFileSync(file, 'utf8')));
    const recorded = JSON.stringify(await load(id, filters, DEFAULT_BALL_FILTERS));
    compared++;
    if (live !== recorded) {
      const a = JSON.parse(live) as unknown[], b = JSON.parse(recorded) as unknown[];
      const realDiff = a.map((x, i) => (JSON.stringify(canon(x)) !== JSON.stringify(canon(b[i])) ? i : -1)).filter((i) => i >= 0);
      if (realDiff.length === 0) { orderOnly++; continue; }
      different++;
      if (process.env.SHOW) for (const w of realDiff.slice(0, 2)) { const x = a[w] as Record<string, unknown>, y = b[w] as Record<string, unknown>; if (x && y && !Array.isArray(x)) for (const k of Object.keys(x)) if (JSON.stringify(canon(x[k])) !== JSON.stringify(canon(y[k]))) console.log('   key', k, 'live', JSON.stringify(x[k]).slice(0, 160), 'recorded', JSON.stringify(y[k]).slice(0, 160)); }
      if (process.env.SHOW) for (const w of realDiff.slice(0, 0)) console.log('   dataset', w, 'live    ', JSON.stringify(a[w]).slice(0, 220), '\n   dataset', w, 'recorded', JSON.stringify(b[w]).slice(0, 220));
      console.log(`${id} ${kind}: recorded CONTENT differs from live in dataset(s) ${realDiff.join(', ')} of ${a.length}`);
    }
  }
}
console.log(`${compared} views compared: ${different} with different content, ${orderOnly} with the same content in a different row order`);
process.exit(different === 0 ? 0 : 1);
