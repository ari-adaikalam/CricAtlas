// Checks the recorded default views of some players (p/view): loads the recorded answers, runs the view's loaders again, and lists every question that was NOT answered from
// the record. Those should be only the answers left out for size. Run from web/:  npx vite-node scripts/verify-views.ts id [id ...]
import fs from 'node:fs';
import path from 'node:path';
import { asked, dataDir, startNodeRunner } from './node-runner';
import { rememberAnswers } from '../src/data/queryCache';
import { setPlayer } from '../src/data/store';
import { runBatView, runBowlView, runRecordsView } from '../src/data/views';
import { defaultFilters, forAnalysis, normaliseFilters } from '../src/domain/filters';
import { DEFAULT_BALL_FILTERS } from '../src/domain/ballFilters';
import type { ProfileBundle } from '../src/data/profileData';

process.env.NEXT_PUBLIC_DATA_BASE_URL ??= 'http://localhost';
await startNodeRunner();
for (const id of process.argv.slice(2)) {
  const profile = JSON.parse(fs.readFileSync(path.join(dataDir, 'p', 'profile', `${id}.json`), 'utf8')) as ProfileBundle;
  const start = normaliseFilters(profile.rows, defaultFilters(profile.rows)!)!;
  setPlayer(id);
  const views = { bat: () => runBatView(id, forAnalysis(profile.rows, start).filters, DEFAULT_BALL_FILTERS), bowl: () => runBowlView(id, forAnalysis(profile.rows, start).filters, DEFAULT_BALL_FILTERS), rec: () => runRecordsView(id, start) };
  for (const [kind, run] of Object.entries(views)) {
    const file = path.join(dataDir, 'p', 'view', `${id}.${kind}.json`);
    if (!fs.existsSync(file)) { console.log(`${id} ${kind}: no file`); continue; }
    rememberAnswers(id, JSON.parse(fs.readFileSync(file, 'utf8')));
    asked.length = 0;
    await run();
    console.log(`${id} ${kind} (${start.format}${start.competition ? ' ' + start.competition : ''}): ${asked.length} question(s) left to the engine${asked.length ? ':' : ''}`);
    for (const q of asked) console.log('   ', q);
  }
}
