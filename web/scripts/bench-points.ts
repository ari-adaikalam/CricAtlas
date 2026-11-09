// Times the point file path against the query engine's SQL for the wagon wheel's shots, in Node, on Kohli and Bumrah's batting, for each Phase choice.  Run from web/:
//   npx vite-node --config vitest.config.ts scripts/bench-points.ts
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, startNodeRunner } from './node-runner';
import { setPlayer } from '../src/data/store';
import { loadShotsSql } from '../src/data/shots';
import { DEFAULT_BALL_FILTERS } from '../src/domain/ballFilters';
import { parsePointFile } from '../src/domain/pointFile';
import { selectPoints, shotsOf } from '../src/domain/pointFilter';

process.env.NEXT_PUBLIC_DATA_BASE_URL ??= 'http://localhost';
await startNodeRunner();
for (const id of ['ba607b88', '52d1dbc8']) {
  setPlayer(id);
  const bytes = fs.readFileSync(path.join(dataDir, 'p', 'pts', `${id}.bin`));
  const parseStart = performance.now();
  const set = parsePointFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const parseMs = performance.now() - parseStart;
  const scope = { format: 'ODI' as const, competition: null, season: null };
  const rows: string[] = [];
  for (const phase of ['all', 'powerplay', 'middle', 'death']) {
    const ball = { ...DEFAULT_BALL_FILTERS, phase };
    const js: number[] = [], sql: number[] = [];
    for (let i = 0; i < 5; i++) { const t = performance.now(); shotsOf(set, selectPoints(set, scope, ball)); js.push(performance.now() - t); }
    for (let i = 0; i < 3; i++) { const t = performance.now(); await loadShotsSql(id, scope, ball); sql.push(performance.now() - t); }
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!.toFixed(1);
    rows.push(`${phase}: JavaScript ${med(js)} ms, SQL ${med(sql)} ms`);
  }
  console.log(`${id} (${set.n} balls, parse ${parseMs.toFixed(1)} ms): ${rows.join(' | ')}`);
}
