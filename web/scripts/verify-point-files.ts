// Checks the structure of every point file (tools/point_files.py): it parses, every code points into its lookup list or is the none value, positions are on the data frame, flags agree with the
// columns, dates are real and rows are in date order. Run from web/:  npx vite-node --config vitest.config.ts scripts/verify-point-files.ts
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './node-runner';
import { FLAG_CAUGHT, FLAG_NONSTRIKER, FLAG_OUT, FLAG_POSITION, NONE16, NONE8, parsePointFile } from '../src/domain/pointFile';

const folder = path.join(dataDir, 'p', 'pts');
const problems: string[] = [];
let files = 0, rows = 0;
for (const name of fs.readdirSync(folder).filter((f) => f.endsWith('.bin'))) {
  const bytes = fs.readFileSync(path.join(folder, name));
  const id = name.slice(0, -4);
  const bad = (what: string) => { if (problems.length < 25) problems.push(`${id}: ${what}`); };
  let s;
  try { s = parsePointFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer); } catch (e) { bad(`does not parse: ${(e as Error).message}`); continue; }
  files++; rows += s.n;
  if (s.n === 0) bad('has no rows');
  let lastDate = 0, positioned = 0;
  for (let i = 0; i < s.n; i++) {
    const f = s.flags[i]!;
    if ((f & FLAG_POSITION) !== 0) { positioned++; if (s.x[i]! < 0 || s.x[i]! > 400 || s.y[i]! < 0 || s.y[i]! > 400 || (s.x[i] === 0 && s.y[i] === 0)) bad(`row ${i}: position ${s.x[i]},${s.y[i]}`); }
    if ((f & FLAG_CAUGHT) !== 0 && (f & FLAG_OUT) === 0) bad(`row ${i}: a catch that is not a dismissal`);
    if ((f & FLAG_NONSTRIKER) !== 0 && ((f & FLAG_POSITION) !== 0 || s.runs[i] !== 0 || (f & FLAG_OUT) !== 0)) bad(`row ${i}: a non-striker row with a position, runs or a striker out`);
    if (s.length[i]! > 6 || s.line[i]! > 5 || s.control[i]! > 2) bad(`row ${i}: length ${s.length[i]} line ${s.line[i]} control ${s.control[i]}`);
    if (s.tournament[i] !== NONE16 && s.tournament[i]! >= s.tournaments.length) bad(`row ${i}: tournament code out of range`);
    if (s.season[i] !== NONE16 && s.season[i]! >= s.seasons.length) bad(`row ${i}: season code out of range`);
    if (s.bowler[i] !== NONE16 && s.bowler[i]! >= s.bowlers.length) bad(`row ${i}: bowler code out of range`);
    if (s.name[i] !== NONE16 && s.name[i]! >= s.names.length) bad(`row ${i}: name code out of range`);
    if (s.opponent[i] !== NONE16 && s.opponent[i]! >= s.opponents.length) bad(`row ${i}: opponent code out of range`);
    if (s.shot[i] !== NONE8 && s.shot[i]! >= s.shots.length) bad(`row ${i}: shot code out of range`);
    if (s.style[i] !== NONE8 && s.style[i]! >= s.styles.length) bad(`row ${i}: style code out of range`);
    const d = s.date[i]!, y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, day = d % 100;
    if (y < 1990 || y > 2030 || m < 1 || m > 12 || day < 1 || day > 31) bad(`row ${i}: date ${d}`);
    if (d < lastDate) bad(`row ${i}: rows not in date order`);
    lastDate = Math.max(lastDate, d);
    if (s.phase[i]! > 4 || s.result[i]! > 3 || s.format[i]! > 3 || s.innings[i]! > 12 || s.innings[i]! < 1) bad(`row ${i}: a code out of range`);
  }
  if (positioned === 0 && s.n > 0 && !problems.some((p) => p.startsWith(id))) { /* a file of dismissals and control readings only is allowed */ }
}
console.log(problems.length === 0 ? `all ${files} files (${rows.toLocaleString('en')} rows) are well formed` : `${problems.length}${problems.length >= 25 ? '+' : ''} problem(s) in ${files} files:\n  ${problems.join('\n  ')}`);
process.exit(problems.length === 0 ? 0 : 1);
