import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BallFile } from '../ballByBall';
import type { MatchBundle } from '../match';
import { blockStats, bowlingOf, cumulative, matchupGrid, matchupsOf, overStats, sourceSlices, sourceTotals, spellsOf, SPELL_GAP, type BowlerOver } from '../analysis';

/** A ball file of the given balls: [over, bowler, striker, bat runs, wide, wicket]. */
function file(balls: Array<[number, number, number, number, number, number]>): BallFile {
  const z = (): number[] => balls.map(() => 0);
  return {
    v: 1, d: balls.map((_, i) => i + 1), ov: balls.map((b) => b[0]), sb: balls.map(() => null), lg: balls.map((b) => (b[4] === 0 ? 1 : 0)), st: balls.map((b) => b[2]), bo: balls.map((b) => b[1]),
    rb: balls.map((b) => b[3]), wd: balls.map((b) => b[4]), nb: z(), by: z(), lb: z(), pe: z(), w: balls.map((b) => b[5]), sh: balls.map(() => -1), ln: balls.map(() => -1), le: balls.map(() => -1), ct: balls.map(() => -1), wp: balls.map(() => -1),
    ev: {}, pl: [['A', 'a'], ['B', 'b'], ['X', 'x'], ['Y', 'y']], shots: [], lines: [], lens: [], tags: [],
  };
}
const over = (n: number, runs: number[]): Array<[number, number, number, number, number, number]> => runs.map((r) => [n, 2, 0, r, 0, 0]);

describe('over statistics', () => {
  it('adds runs and wickets by over and builds the running score', () => {
    const f = file([...over(0, [1, 0, 4, 0, 0, 0]), ...over(1, [6, 0, 0, 0, 0, 1]), ...over(2, [2, 2, 0, 0, 0, 0])]);
    f.w[11] = 1;
    const s = overStats(f);
    expect(s.map((o) => o.runs)).toEqual([5, 7, 4]);
    expect(s.map((o) => o.wickets)).toEqual([0, 1, 0]);
    expect(cumulative(s)).toEqual([0, 5, 12, 16]);
  });
  it('counts a wide as runs in the over', () => {
    const f = file([[0, 2, 0, 0, 1, 0], [0, 2, 0, 0, 0, 0]]);
    expect(overStats(f)[0]!.runs).toBe(1);
  });
  it('makes blocks of 20 overs, the last one short', () => {
    const stats = Array.from({ length: 45 }, () => ({ runs: 3, wickets: 0, balls: 6 }));
    const blocks = blockStats(stats);
    expect(blocks.map((b) => [b.from, b.to, b.runs])).toEqual([[1, 20, 60], [21, 40, 60], [41, 45, 15]]);
  });
});

describe('run sources', () => {
  it('splits the runs by source and joins the small ones as Other', () => {
    const f = file([...over(0, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), ...over(1, [4, 4, 4, 4, 4, 4, 4, 4, 4, 4]), [2, 2, 0, 0, 1, 0]]);
    f.by[0] = 0;
    const t = sourceTotals(f);
    expect(t.one).toBe(10); expect(t.four).toBe(40); expect(t.wd).toBe(1);
    const slices = sourceSlices(t);
    expect(slices.reduce((a, s) => a + s.runs, 0)).toBe(51);
    expect(slices.find((s) => s.key === 'wd')).toBeUndefined();
    expect(slices.find((s) => s.key === 'other')?.parts).toEqual(['Wides 1']);
    expect(slices.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 6);
  });
  it('has no slices for an innings with no runs', () => { expect(sourceSlices(sourceTotals(file([[0, 2, 0, 0, 0, 0]])))).toEqual([]); });
});

describe('spells', () => {
  const o = (n: number): BowlerOver => ({ over: n, runs: 4, balls: 6, wickets: 0, maiden: false });
  it('keeps overs 1, 3 and 6 in one spell: a gap of up to two overs is the same spell', () => {
    expect(SPELL_GAP).toBe(2);
    const s = spellsOf([o(0), o(2), o(5)]);
    expect(s).toHaveLength(1);
    expect(s[0]!.figures.overs).toBe(3);
  });
  it('starts a new spell after a longer gap, and a lone over is a spell of its own', () => {
    const s = spellsOf([o(0), o(2), o(9)]);
    expect(s.map((x) => [x.from, x.to, x.overs.length])).toEqual([[0, 2, 2], [9, 9, 1]]);
  });
  it('lists the bowlers in the order they first bowled, with figures', () => {
    const inn = { batters: [{ name: 'A', out: { type: 'bowled', bowler: 'X', bowlerId: 'x', delivery: 3 } }, { name: 'B', out: { type: 'run out', bowler: null, bowlerId: null, delivery: 9 } }] } as never;
    const f = file([...over(0, [0, 0, 1, 0, 0, 0]), ...over(1, [0, 0, 0, 0, 0, 0])]);
    f.bo = f.bo.map((_, i) => (i < 6 ? 2 : 3)); f.w[2] = 1; f.w[8] = 1;
    const rows = bowlingOf(f, inn);
    expect(rows.map((r) => r.name)).toEqual(['X', 'Y']);
    expect(rows[0]!.figures).toMatchObject({ overs: 1, balls: 6, runs: 1, wickets: 1, maidens: 0 });
    expect(rows[1]!.figures).toMatchObject({ runs: 0, wickets: 0, maidens: 1 });
  });
});

describe('matchups', () => {
  it('pairs each batter with each bowler, wides are not balls faced and run outs are not the bowler\'s', () => {
    const inn = { batters: [{ name: 'A', out: { type: 'bowled', delivery: 2 } }, { name: 'B', out: { type: 'run out', delivery: 4 } }] } as never;
    const f = file([[0, 2, 0, 4, 0, 0], [0, 2, 0, 0, 0, 1], [0, 2, 1, 1, 0, 0], [0, 2, 1, 0, 0, 1], [0, 2, 1, 0, 1, 0]]);
    const pairs = matchupsOf(f, inn);
    const grid = matchupGrid(pairs);
    expect(grid.batters.map((b) => b.name)).toEqual(['A', 'B']);
    expect(grid.cell(0, 0)).toMatchObject({ balls: 2, runs: 4, out: 1, fours: 1 });
    expect(grid.cell(1, 0)).toMatchObject({ balls: 2, runs: 1, out: 0 });
  });
});

// Against the real files, when they are there: every innings adds up to its scorecard.
const DATA = '../data/export/m';
describe.skipIf(!existsSync(`${DATA}/bundle`))('against the exported matches', () => {
  const ids = existsSync(`${DATA}/bundle`) ? readdirSync(`${DATA}/bundle`).filter((n) => n.endsWith('.json')).filter((_, i) => i % 400 === 0).slice(0, 12) : [];
  it('over runs, wickets, source slices and bowler figures equal the scorecard', () => {
    let checked = 0;
    for (const name of ids) {
      const bundle = JSON.parse(readFileSync(`${DATA}/bundle/${name}`, 'utf8')) as MatchBundle;
      for (const inn of bundle.innings.filter((i) => !i.super)) {
        const path = `${DATA}/balls/${bundle.match.id}_${inn.n}.json`;
        if (!existsSync(path)) continue;
        const f = JSON.parse(readFileSync(path, 'utf8')) as BallFile;
        const stats = overStats(f);
        expect(stats.reduce((a, s) => a + s.runs, 0) - inn.penaltyPre - inn.penaltyPost).toBeLessThanOrEqual(inn.runs);
        expect(stats.reduce((a, s) => a + s.runs, 0)).toBeGreaterThanOrEqual(inn.runs - inn.penaltyPre - inn.penaltyPost - 1);
        expect(sourceSlices(sourceTotals(f)).reduce((a, s) => a + s.runs, 0)).toBe(stats.reduce((a, s) => a + s.runs, 0));
        for (const row of bowlingOf(f, inn, bundle.match.ballsPerOver)) {
          const card = inn.bowlers.find((b) => (row.id ? b.id === row.id : b.name === row.name));
          if (!card) continue;
          expect(row.figures.balls).toBe(card.balls);
          expect(row.figures.runs).toBe(card.runs);
          expect(row.figures.wickets).toBe(card.wkts);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
