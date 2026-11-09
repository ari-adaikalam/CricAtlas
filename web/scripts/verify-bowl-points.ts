// Compares the JavaScript filter of the bowler point files (p/ptb) with the SQL of the Bowling tiles (Ring, Wagon wheel, False shots, Pitch map) on real bowlers and many filter combinations.
// Every difference is printed. Run from web/:   npx vite-node --config vitest.config.ts scripts/verify-bowl-points.ts [id ...]
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, startNodeRunner } from './node-runner';
import { setPlayer } from '../src/data/store';
import { loadBowlFalseShotInningsSql, loadBowlLocatedSql, loadBowlShotsSql } from '../src/data/bowlTracking';
import { loadPitchSql } from '../src/data/pitch';
import { DEFAULT_BALL_FILTERS, type BallFilters } from '../src/domain/ballFilters';
import type { FormatChoice, PlayerFilters } from '../src/domain/filters';
import { emptyPointSet, parsePointFile, type PointSet } from '../src/domain/pointFile';
import { bowlLocatedOf, bowlShotsOf, falseShotInningsOf, pitchOf, selectPoints } from '../src/domain/pointFilter';
import type { PitchRuns } from '../src/domain/runsFilter';

process.env.NEXT_PUBLIC_DATA_BASE_URL ??= 'http://localhost';
await startNodeRunner();
const IDS = process.argv.length > 2 ? process.argv.slice(2) : ['462411b3'];
const FORMATS: FormatChoice[] = ['TEST', 'ODI', 'T20I', 'T20S', 'LEAGUE', 'INTERNATIONAL'];
const BALL: Array<Partial<BallFilters>> = [
  {}, { phase: 'powerplay' }, { phase: 'middle' }, { phase: 'death' }, { phase: 'rest' }, { phase: 'band0' }, { phase: 'band3' }, { superOvers: 'included' }, { superOvers: 'only' },
  { innings: '1' }, { innings: '2' }, { innings: '3' }, { wickets: 'low' }, { wickets: 'mid' }, { wickets: 'high' }, { result: 'won' }, { result: 'lost' }, { result: 'draw' },
  { hand: 'right' }, { hand: 'left' }, { hand: 'left', phase: 'powerplay', innings: '1' }, { phase: 'death', wickets: 'high', result: 'won' }, { superOvers: 'included', hand: 'right', innings: '2' },
];
const RUNS: PitchRuns[] = ['all', 'dot', '13', '4', '6', 'wicket'];
// The SQL rows of the wagon wheel also carry the batter's hand and whether the ball was tracked, which the tile does not read: only the shot fields are compared.
const key = (s: object) => JSON.stringify(s, (name, value) => (name === 'hand' || name === 'tracked' ? undefined : value));
const sorted = (rows: object[]) => rows.map(key).sort();

function load(id: string): PointSet {
  const file = path.join(dataDir, 'p', 'ptb', `${id}.bin`);
  if (!fs.existsSync(file)) return emptyPointSet();
  const bytes = fs.readFileSync(file);
  return parsePointFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

let compared = 0, differences = 0;
for (const id of IDS) {
  const set = load(id);
  setPlayer(id);
  const profile = JSON.parse(fs.readFileSync(path.join(dataDir, 'p', 'profile', `${id}.json`), 'utf8')) as { rows: Array<{ tournament_key: string | null; season: string | null }> };
  const tournaments = [...new Set(profile.rows.map((r) => r.tournament_key).filter((k): k is string => !!k))].slice(0, 2);
  const seasons = [...new Set(profile.rows.map((r) => r.season).filter((s): s is string => !!s))].slice(-2);
  const scopes: PlayerFilters[] = FORMATS.map((format) => ({ format, competition: null, season: null }));
  for (const competition of tournaments) scopes.push({ format: 'LEAGUE', competition, season: null });
  for (const season of seasons) scopes.push({ format: 'INTERNATIONAL', competition: null, season }, { format: 'LEAGUE', competition: null, season });
  scopes.push({ format: 'ODI', competition: null, season: 'no-such-season' });
  let n = 0, bad = 0;
  for (const scope of scopes) for (const extra of BALL) {
    const ball: BallFilters = { ...DEFAULT_BALL_FILTERS, ...extra };
    const picked = selectPoints(set, scope, ball, 'bowl');
    const problems: string[] = [];
    const [locSql, shotsSql, falseSql] = [await loadBowlLocatedSql(id, scope, ball), await loadBowlShotsSql(id, scope, ball), await loadBowlFalseShotInningsSql(id, scope, ball)];
    if (key(sorted(locSql)) !== key(sorted(bowlLocatedOf(set, picked)))) problems.push('ring');
    const js = bowlShotsOf(set, picked);
    if (process.env.SHOW && key(shotsSql) !== key(js) && !(globalThis as { __shown?: boolean }).__shown) { (globalThis as { __shown?: boolean }).__shown = true; for (const hand of ['right', 'left'] as const) { const i = shotsSql[hand].findIndex((x, j) => key(x) !== key(js[hand][j] ?? {})); if (i >= 0) console.log('  first', hand, 'difference at', i, 'sql', key(shotsSql[hand][i]!), 'js', key(js[hand][i] ?? {})); } }
    if (key(shotsSql) !== key(js)) problems.push(`wagon (right ${shotsSql.right.length}/${js.right.length}, left ${shotsSql.left.length}/${js.left.length}, scoring ${shotsSql.scoring}/${js.scoring})`);
    if (key(falseSql) !== key(falseShotInningsOf(set, picked))) problems.push('false shots');
    for (const runs of RUNS) {
      const sql = await loadPitchSql(id, scope, ball, runs), mine = pitchOf(set, picked, runs);
      if (sql.bowled !== mine.bowled || sql.tracked !== mine.tracked || key(sorted(sql.rows)) !== key(sorted(mine.rows))) { problems.push(`pitch ${runs} (bowled ${sql.bowled}/${mine.bowled})`); break; }
    }
    n++; compared++;
    if (problems.length) { bad++; differences++; if (bad <= 3) console.log(`  DIFFERENT ${id} ${key(scope)} ${key(extra)}: ${problems.join(', ')}`); }
  }
  console.log(`${id}: ${n} combinations, ${bad} different, ${set.n} balls in the file`);
}
console.log(differences === 0 ? `all ${compared} combinations agree` : `${differences} of ${compared} combinations differ`);
process.exit(differences === 0 ? 0 : 1);
