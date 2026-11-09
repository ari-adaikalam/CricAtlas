// Compares the JavaScript filter of the point files (src/domain/pointFilter.ts) with the SQL of the same tiles (src/data/shots.ts) on real players and many filter combinations. Every difference
// is printed. Needs the point files (../.venv/bin/python tools/point_files.py). Run from web/:   npx vite-node --config vitest.config.ts scripts/verify-points.ts [id ...]
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, startNodeRunner } from './node-runner';
import { setPlayer } from '../src/data/store';
import { loadLocatedBallsSql, loadShotsSql } from '../src/data/shots';
import { DEFAULT_BALL_FILTERS, type BallFilters } from '../src/domain/ballFilters';
import type { FormatChoice, PlayerFilters } from '../src/domain/filters';
import { emptyPointSet, parsePointFile, type PointSet } from '../src/domain/pointFile';
import { controlRowsOf, dismissalMapOf, falseShotInningsOf, locatedOf, selectPoints, shotsOf } from '../src/domain/pointFilter';
import { loadControlRowsSql, loadFalseShotInningsSql } from '../src/data/control';
import { loadDismissalMapSql } from '../src/data/batDismissals';

process.env.NEXT_PUBLIC_DATA_BASE_URL ??= 'http://localhost';
await startNodeRunner();

const IDS = process.argv.length > 2 ? process.argv.slice(2) : ['ba607b88', '52d1dbc8', '29e95537', '3d284ca3', '6a97c7a4', '02b87bde', 'a2f46292', '462411b3'];
const FORMATS: FormatChoice[] = ['TEST', 'ODI', 'T20I', 'T20S', 'LEAGUE', 'INTERNATIONAL'];
const BALL: Array<Partial<BallFilters>> = [
  {}, { phase: 'powerplay' }, { phase: 'middle' }, { phase: 'death' }, { phase: 'rest' }, { phase: 'band0' }, { phase: 'band2' }, { phase: 'band4' },
  { superOvers: 'included' }, { superOvers: 'only' }, { innings: '1' }, { innings: '2' }, { innings: '4' }, { wickets: 'low' }, { wickets: 'mid' }, { wickets: 'high' },
  { result: 'won' }, { result: 'lost' }, { result: 'draw' }, { type: 'pace' }, { type: 'spin' }, { type: 's:right-arm offbreak' }, { type: 's:legbreak googly' },
  { phase: 'powerplay', innings: '1', result: 'won' }, { phase: 'death', wickets: 'high', type: 'pace' }, { superOvers: 'included', innings: '2', type: 'spin' },
];

function load(id: string): PointSet {
  const file = path.join(dataDir, 'p', 'pts', `${id}.bin`);
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
  const scopes: PlayerFilters[] = [];
  for (const format of FORMATS) scopes.push({ format, competition: null, season: null });
  for (const competition of tournaments) scopes.push({ format: 'LEAGUE', competition, season: null }, { format: 'T20S', competition, season: seasons[0] ?? null });
  for (const season of seasons) scopes.push({ format: 'INTERNATIONAL', competition: null, season }, { format: 'LEAGUE', competition: null, season });
  scopes.push({ format: 'ODI', competition: null, season: 'no-such-season' }, { format: 'ODI', competition: 'no-such-competition', season: null });
  let n = 0, bad = 0;
  for (const scope of scopes) for (const extra of BALL) {
    const ball: BallFilters = { ...DEFAULT_BALL_FILTERS, ...extra };
    // Tests have no phases or Super Overs of their own, and the page does not offer a band in a limited-overs format; the SQL accepts any, so every combination is compared.
    const picked = selectPoints(set, scope, ball);
    const [sqlShots, sqlLocated] = [await loadShotsSql(id, scope, ball), await loadLocatedBallsSql(id, scope, ball)];
    const jsShots = shotsOf(set, picked), jsLocated = locatedOf(set, picked);
    n++; compared++;
    const sameShots = JSON.stringify(sqlShots) === JSON.stringify(jsShots);
    // The located balls have no fixed order in the SQL, so they are compared as sets of rows.
    const key = (s: { x: number; y: number; runs: number; out: boolean; shot: string | null; bowler: string | null; over: number; ballInOver: number }) => `${s.x},${s.y},${s.runs},${s.out},${s.shot},${s.bowler},${s.over},${s.ballInOver}`;
    const sameLocated = sqlLocated.length === jsLocated.length && JSON.stringify(sqlLocated.map(key).sort()) === JSON.stringify(jsLocated.map(key).sort());
    // The other Batting tiles. The control and dismissal rows have no fixed order in the SQL, so they are compared as sets; the false shot innings are ordered by the SQL and must match exactly.
    const rowKey = (r: object) => JSON.stringify(r);
    const sortedKeys = (rows: object[]) => rows.map(rowKey).sort();
    const sameControl = JSON.stringify(sortedKeys(await loadControlRowsSql(id, scope, ball))) === JSON.stringify(sortedKeys(controlRowsOf(set, picked)));
    const sameFalse = JSON.stringify(await loadFalseShotInningsSql(id, scope, ball)) === JSON.stringify(falseShotInningsOf(set, picked));
    const sqlMap = await loadDismissalMapSql(id, scope, ball), jsMap = dismissalMapOf(set, picked);
    const sameMap = sqlMap.all === jsMap.all && JSON.stringify(sortedKeys(sqlMap.rows)) === JSON.stringify(sortedKeys(jsMap.rows));
    if (!sameControl || !sameFalse || !sameMap) { bad++; differences++; if (bad <= 3) console.log(`  DIFFERENT ${id} ${JSON.stringify(scope)} ${JSON.stringify(extra)}:${sameControl ? '' : ' control rows differ'}${sameFalse ? '' : ' false shot innings differ'}${sameMap ? '' : ` dismissal map differs (sql all ${sqlMap.all}, js all ${jsMap.all})`}`); }
    if (!sameShots || !sameLocated) {
      bad++; differences++;
      if (bad <= 3) console.log(`  DIFFERENT ${id} ${JSON.stringify(scope)} ${JSON.stringify(extra)}: shots sql ${sqlShots.length} js ${jsShots.length}${sameShots ? '' : ' (rows differ)'}, located sql ${sqlLocated.length} js ${jsLocated.length}${sameLocated ? '' : ' (rows differ)'}`);
    }
  }
  console.log(`${id}: ${n} combinations, ${bad} different, ${set.n} balls in the file`);
}
console.log(differences === 0 ? `all ${compared} combinations agree` : `${differences} of ${compared} combinations differ`);
process.exit(differences === 0 ? 0 : 1);
