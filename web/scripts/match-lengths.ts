// The longest result lines and player of the match lines over every match bundle, for sizing the strip beside the buttons.
// Run from web/:  npx vite-node --config vitest.config.ts scripts/match-lengths.ts
import fs from 'node:fs';
import path from 'node:path';
import { potm, resultText, type MatchBundle } from '../src/domain/match';

const dir = path.resolve('../data/export/m/bundle');
const rows: Array<{ id: number; result: string; star: string }> = [];
for (const f of fs.readdirSync(dir)) {
  const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as MatchBundle;
  const p = potm(b);
  rows.push({ id: b.match.id, result: resultText(b), star: p ? `Player of the match: ${p.names}${p.figures ? `, ${p.figures}` : ''}` : '' });
}
const pct = (xs: number[], q: number): number => xs.slice().sort((a, b) => a - b)[Math.floor((xs.length - 1) * q)]!;
for (const key of ['result', 'star'] as const) {
  const lens = rows.map((r) => r[key].length);
  console.log(`${key}: median ${pct(lens, 0.5)}, p95 ${pct(lens, 0.95)}, p99 ${pct(lens, 0.99)}, max ${Math.max(...lens)}`);
  for (const r of rows.sort((a, b) => b[key].length - a[key].length).slice(0, 3)) console.log(`   ${r.id} (${r[key].length}) ${r[key]}`);
}

// Ids to try in the browser (scripts/perf/match-fit.cjs): the longest of each kind of line.
const bundles = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as MatchBundle);
const top = (key: (b: MatchBundle) => number, n: number): number[] => bundles.slice().sort((a, b) => key(b) - key(a)).slice(0, n).map((b) => b.match.id);
const ids = new Set<number>([
  ...top((b) => resultText(b).length, 6), ...top((b) => { const p = potm(b); return p ? p.names.length + p.figures.length : 0; }, 6),
  ...top((b) => Math.max(...b.match.teams.map((t) => t.name.length)), 6), ...top((b) => (b.match.venue ?? '').length + (b.match.city ?? '').length, 6),
  ...top((b) => (b.match.tournament.name ?? '').length + (b.match.stage.name ?? '').length, 6), ...top((b) => Math.max(0, ...b.innings.flatMap((i) => i.batters.map((x) => x.name.length))), 4),
]);
console.log('FIT IDS', [...ids].join(','));
