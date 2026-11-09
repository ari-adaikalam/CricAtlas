// Writes what the bowling loaders that read the whole-match ball file answer (the let-off numbers of Key numbers, and the batting-order split of Batters) for a sample of bowlers in
// every format, so a change to how they are worked out can be checked to give the same numbers. Run from web/ before and after:
//   npx vite-node --config vitest.config.ts scripts/snapshot-bowl.ts <out.json> [count]
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, startNodeRunner } from './node-runner';
import { setPlayer } from '../src/data/store';
import { loadBowlingSlice } from '../src/data/bowlingSlice';
import { loadBowlBatters } from '../src/data/bowlBatters';
import { DEFAULT_BALL_FILTERS } from '../src/domain/ballFilters';
import type { PlayerFilters } from '../src/domain/filters';

process.env.NEXT_PUBLIC_DATA_BASE_URL ??= 'http://localhost';
const outFile = process.argv[2]!;
const count = Number(process.argv[3] ?? 150);
await startNodeRunner();
const have = fs.readdirSync(path.join(dataDir, 'p', 'bowl')).filter((f) => /^[0-9a-f]{8}\.parquet$/.test(f)).map((f) => f.slice(0, 8)).sort();
// A spread across the list (not just the first), plus the players this was found on.
const ids = [...new Set([...have.filter((_, i) => i % Math.max(1, Math.floor(have.length / count)) === 0).slice(0, count), '462411b3', 'ba607b88'])];
const formats = ['TEST', 'ODI', 'T20I', 'T20S', 'INTERNATIONAL'] as const;
const result: Record<string, unknown> = {};
for (const id of ids) {
  setPlayer(id);
  for (const format of formats) {
    const filters: PlayerFilters = { format, competition: null, season: null };
    const slice = await loadBowlingSlice(id, filters, DEFAULT_BALL_FILTERS);
    const batters = await loadBowlBatters(id, filters, DEFAULT_BALL_FILTERS);
    const key = (r: { key: string }) => r.key;
    result[`${id}|${format}`] = {
      slice: { balls: slice.balls, wickets: slice.wickets, letOffs: slice.letOffs, letOffRuns: slice.letOffRuns, innings: slice.innings },
      hand: [...batters.hand].sort((a, b) => key(a).localeCompare(key(b))),
      order: [...batters.order].sort((a, b) => key(a).localeCompare(key(b))),
    };
  }
}
fs.writeFileSync(outFile, JSON.stringify(result));
console.log(`${ids.length} bowlers, ${Object.keys(result).length} scopes, ${Object.values(result).filter((r) => (r as { slice: { letOffs: number } }).slice.letOffs > 0).length} with let-offs -> ${outFile}`);
