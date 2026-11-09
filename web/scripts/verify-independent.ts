// An independent check of the point file: the dismissals it counts for each player and format against the dismissals in player_summary.parquet, which is built from the Cricsheet records on
// their own, not from the ball file or the point file. They should be equal for the batter in each format (Super Overs are in neither). Run from web/:
//   npx vite-node --config vitest.config.ts scripts/verify-independent.ts [id ...]
import fs from 'node:fs';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { dataDir } from './node-runner';
import { DEFAULT_BALL_FILTERS } from '../src/domain/ballFilters';
import { emptyPointSet, parsePointFile } from '../src/domain/pointFile';
import { dismissalMapOf, selectPoints } from '../src/domain/pointFilter';

const ids = process.argv.slice(2);
const conn = await (await DuckDBInstance.create(':memory:')).connect();
const summary = path.join(dataDir, 'player_summary.parquet').replace(/'/g, "''");
let compared = 0, off = 0;
for (const id of ids) {
  const file = path.join(dataDir, 'p', 'pts', `${id}.bin`);
  const set = fs.existsSync(file) ? (() => { const b = fs.readFileSync(file); return parsePointFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); })() : emptyPointSet();
  const rows = (await conn.runAndReadAll(`select format, sum(dismissals)::int as d from '${summary}' where player_id = '${id}' group by 1`)).getRowObjects() as Array<{ format: string; d: number }>;
  const line: string[] = [];
  for (const [format, key, scope] of [['TEST', 'TEST', 'TEST'], ['ODI', 'ODI', 'ODI'], ['T20', 'T20S', 'T20S']] as const) {
    const expected = Number(rows.find((r) => r.format === format)?.d ?? 0);
    const got = dismissalMapOf(set, selectPoints(set, { format: scope, competition: null, season: null }, DEFAULT_BALL_FILTERS)).all;
    compared++;
    if (got !== expected) { off++; line.push(`${key} summary ${expected} point file ${got}`); }
  }
  if (line.length) console.log(`${id}: ${line.join('; ')}`);
}
console.log(off === 0 ? `all ${compared} counts equal the summary` : `${off} of ${compared} counts differ from the summary`);
