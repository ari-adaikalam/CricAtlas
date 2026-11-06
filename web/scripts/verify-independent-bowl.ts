// An independent check of the bowler point files: the wickets and legal balls each file holds for a bowler and format against player_summary.parquet, built from the Cricsheet records on their own.
// Super Overs are in neither. Run from web/:   npx vite-node --config vitest.config.ts scripts/verify-independent-bowl.ts [id ...]
import fs from 'node:fs';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { dataDir } from './node-runner';
import { DEFAULT_BALL_FILTERS } from '../src/domain/ballFilters';
import { FLAG_OUT, FLAG_WIDE, emptyPointSet, parsePointFile } from '../src/domain/pointFile';
import { selectPoints } from '../src/domain/pointFilter';

const ids = process.argv.slice(2);
const conn = await (await DuckDBInstance.create(':memory:')).connect();
const summary = path.join(dataDir, 'player_summary.parquet').replace(/'/g, "''");
let compared = 0, off = 0;
for (const id of ids) {
  const file = path.join(dataDir, 'p', 'ptb', `${id}.bin`);
  const set = fs.existsSync(file) ? (() => { const b = fs.readFileSync(file); return parsePointFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); })() : emptyPointSet();
  const rows = (await conn.runAndReadAll(`select format, sum(wickets)::int as w, sum(balls_bowled)::int as b from '${summary}' where player_id = '${id}' group by 1`)).getRowObjects() as Array<{ format: string; w: number; b: number }>;
  const line: string[] = [];
  for (const [format, scope] of [['TEST', 'TEST'], ['ODI', 'ODI'], ['T20', 'T20S']] as const) {
    const sum = rows.find((r) => r.format === format);
    const picked = selectPoints(set, { format: scope, competition: null, season: null }, DEFAULT_BALL_FILTERS, 'bowl');
    const wickets = picked.filter((i) => (set.flags[i]! & FLAG_OUT) !== 0).length;
    compared += 2;
    if (wickets !== Number(sum?.w ?? 0)) { off++; line.push(`${scope} wickets summary ${sum?.w ?? 0} file ${wickets}`); }
    const balls = picked.filter((i) => (set.flags[i]! & FLAG_WIDE) === 0).length;
    if (balls !== Number(sum?.b ?? 0)) { off++; line.push(`${scope} balls summary ${sum?.b ?? 0} file ${balls}`); }
  }
  if (line.length) console.log(`${id}: ${line.join('; ')}`);
}
console.log(off === 0 ? `all ${compared} counts equal the summary` : `${off} of ${compared} counts differ from the summary`);
