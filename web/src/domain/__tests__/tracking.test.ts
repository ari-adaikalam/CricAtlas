import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BallFile } from '../ballByBall';
import type { MatchBundle } from '../match';
import { enoughTracking, hasPosition, pick, pitchRowsOf, rankPlayers, sampleLine, shotMixCellsOf, shotsOf, trackedBalls, wicketGrid } from '../tracking';

/** A ball file: [over, bowler, striker, runs, wide, wicket, shot, line, length, control, x, y] */
type B = [number, number, number, number, number, number, number, number, number, number, number, number];
function file(balls: B[]): BallFile {
  const col = (k: number): number[] => balls.map((b) => b[k]!);
  const z = (): number[] => balls.map(() => 0);
  return {
    v: 1, d: balls.map((_, i) => i + 1), ov: col(0), sb: balls.map(() => null), lg: balls.map((b) => (b[4] === 0 ? 1 : 0)), st: col(2), bo: col(1), rb: col(3), wd: col(4), nb: z(), by: z(), lb: z(), pe: z(), w: col(5),
    sh: col(6), ln: col(7), le: col(8), ct: col(9), wp: balls.map(() => -1), wx: col(10), wy: col(11), ev: {},
    pl: [['A', 'a'], ['B', 'b'], ['X', 'x'], ['Y', 'y']], ph: ['R', 'L', '', ''], shots: ['drive', 'pull'], lines: ['outside offstump', 'on the stumps'], lens: ['full', 'good length'], tags: [],
  };
}
const inn = { n: 1, team: 'T', batters: [{ name: 'A', out: { type: 'bowled', delivery: 3, bowler: 'X', bowlerId: 'x' } }], phases: [{ key: 'powerplay', firstOver: 0, lastOver: 0 }, { key: 'middle', firstOver: 1, lastOver: 5 }] } as never;
const balls = trackedBalls(inn, file([
  [0, 2, 0, 4, 0, 0, 0, 0, 0, 1, 100, 100],
  [0, 2, 0, 0, 0, 0, 1, 1, 1, 0, -1, -1],
  [0, 2, 1, 0, 0, 1, -1, 0, 1, -1, 150, 120],
  [1, 3, 1, 6, 0, 0, 0, 0, 0, 1, 200, 50],
  [1, 3, 1, 0, 1, 0, -1, -1, -1, -1, -1, -1],
]));

describe('tracked balls', () => {
  it('carries the hand, the phase of the over and the position', () => {
    expect(balls[0]).toMatchObject({ hand: 'R', phase: 'powerplay', over: 1, ballInOver: 1, x: 100, y: 100, shot: 'drive', control: 1 });
    expect(balls[3]).toMatchObject({ hand: 'L', phase: 'middle', runs: 6 });
    expect(balls[1]!.control).toBe(0);
    expect(balls[2]!.bowlerOut).toBe(true);
    expect(balls[4]).toMatchObject({ wide: true, legal: false, ballInOver: 1 });
  });
  it('lists the balls that have a position as shots, dot balls too', () => {
    expect(balls.filter(hasPosition)).toHaveLength(3);
    expect(shotsOf(balls).map((s) => [s.runs, s.out])).toEqual([[4, false], [0, true], [6, false]]);
  });
});

describe('pitch map rows and the wicket map', () => {
  it('groups legal balls by length and line and counts the bowler\'s wickets', () => {
    const { rows, bowled, tracked } = pitchRowsOf(balls);
    expect(bowled).toBe(4);
    expect(tracked).toBe(4);
    const cell = rows.find((r) => r.length === 'full' && r.line === 'outside offstump')!;
    expect(cell).toMatchObject({ balls: 2, runs: 10, fours: 1, sixes: 1, dots: 0 });
    const grid = wicketGrid(rows);
    expect(grid.flat().reduce((a, c) => a + c.wickets, 0)).toBe(1);
  });
});

describe('shot mix', () => {
  it('counts the balls faced with a label by shot and phase', () => {
    const cells = shotMixCellsOf(balls);
    expect(cells.find((c) => c.shot === 'drive' && c.key === 'powerplay')).toMatchObject({ balls: 1, runs: 4, controlKnown: 1, inControl: 1 });
    expect(cells.reduce((a, c) => a + c.balls, 0)).toBe(3);
  });
});

describe('players and the panel filters', () => {
  it('ranks batters by runs and bowlers by wickets', () => {
    expect(rankPlayers(balls, 'bat').map((p) => p.name)).toEqual(['B', 'A']);
    expect(rankPlayers(balls, 'bowl').map((p) => p.name)).toEqual(['X', 'Y']);
  });
  it('narrows to one player and to a group of the other side', () => {
    expect(pick(balls, 'bat', 'a', { kind: 'all' })).toHaveLength(2);
    expect(pick(balls, 'bowl', null, { kind: 'hand', hand: 'L' })).toHaveLength(3);
    expect(pick(balls, 'bat', 'b', { kind: 'player', id: 'y' })).toHaveLength(2);
  });
  it('states the sample', () => {
    expect(sampleLine(balls, hasPosition)).toBe('4 balls, 3 with tracking');
  });
});

describe('the 30% rule', () => {
  const b = (n: number, tracked: number, positioned: number) => ({ coverage: { balls: n, tracked, positioned } }) as unknown as MatchBundle;
  it('draws a chart when at least 30% of the balls have the field', () => {
    expect(enoughTracking(b(100, 30, 0), 'tracked')).toBe(true);
    expect(enoughTracking(b(100, 29, 90), 'tracked')).toBe(false);
    expect(enoughTracking(b(100, 90, 29), 'positioned')).toBe(false);
    expect(enoughTracking(b(0, 0, 0), 'tracked')).toBe(false);
  });
});

const DATA = '../data/export/m';
describe.skipIf(!existsSync(`${DATA}/bundle`))('against the exported matches', () => {
  const ids = existsSync(`${DATA}/bundle`) ? readdirSync(`${DATA}/bundle`).filter((n) => n.endsWith('.json')).filter((_, i) => i % 300 === 0).slice(0, 20) : [];
  it('the balls with a position and the tracked balls equal the match coverage', () => {
    let checked = 0;
    for (const name of ids) {
      const bundle = JSON.parse(readFileSync(`${DATA}/bundle/${name}`, 'utf8')) as MatchBundle;
      let positioned = 0, tracked = 0, n = 0;
      for (const i of bundle.innings.filter((x) => !x.super)) {
        const path = `${DATA}/balls/${bundle.match.id}_${i.n}.json`;
        if (!existsSync(path)) continue;
        const f = JSON.parse(readFileSync(path, 'utf8')) as BallFile;
        if (!f.wx) continue;
        for (const t of trackedBalls(i, f)) { n += 1; if (hasPosition(t)) positioned += 1; if (t.shot !== null || t.line !== null || t.length !== null || hasPosition(t)) tracked += 1; }
      }
      if (n === 0) continue;
      expect(n).toBe(bundle.coverage.balls);
      expect(positioned).toBe(bundle.coverage.positioned);
      expect(tracked).toBe(bundle.coverage.tracked);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
