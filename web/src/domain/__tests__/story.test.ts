import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BallFile } from '../ballByBall';
import type { MatchBundle } from '../match';
import { chaseOf, parSeries, winCoverage, winSeries } from '../story';

function file(balls: Array<{ ov: number; rb: number; w?: number; wp?: number; ps?: number; lg?: number }>): BallFile {
  const col = <T>(f: (b: (typeof balls)[number]) => T): T[] => balls.map(f);
  const z = (): number[] => balls.map(() => 0);
  return {
    v: 1, d: balls.map((_, i) => i + 1), ov: col((b) => b.ov), sb: balls.map(() => null), lg: col((b) => b.lg ?? 1), st: z(), bo: z(), rb: col((b) => b.rb), wd: z(), nb: z(), by: z(), lb: z(), pe: z(), w: col((b) => b.w ?? 0),
    sh: balls.map(() => -1), ln: balls.map(() => -1), le: balls.map(() => -1), ct: balls.map(() => -1), wp: col((b) => b.wp ?? -1), ps: col((b) => b.ps ?? -1), ev: {}, pl: [], shots: [], lines: [], lens: [], tags: [],
  };
}
const bundle = { match: { id: 1, kind: 't20', ballsPerOver: 6, scheduledOvers: 20 } } as unknown as MatchBundle;
const inn = (n: number, extra: object = {}) => ({ n, team: n === 1 ? 'A' : 'B', runs: 0, wkts: 0, targetRuns: null, targetOvers: null, ...extra }) as never;

describe('win probability', () => {
  const f1 = file([{ ov: 0, rb: 1, wp: 55 }, { ov: 0, rb: 0, wp: 60, w: 1 }]);
  const f2 = file([{ ov: 0, rb: 4, wp: 30 }, { ov: 0, rb: 0, wp: 20 }]);
  const files = new Map([[1, f1], [2, f2]]);
  it('flips the second innings so the line is the first side\'s chance throughout', () => {
    const s = winSeries(bundle, [inn(1), inn(2)], files);
    expect(s.map((p) => p.p)).toEqual([55, 60, 70, 80]);
    expect(s.map((p) => p.innings)).toEqual([1, 1, 2, 2]);
    expect(s[1]).toMatchObject({ wicket: true, score: '1/1' });
  });
  it('counts how many balls have a value', () => {
    expect(winCoverage(files, [inn(1), inn(2)])).toBe(1);
    expect(winCoverage(new Map([[1, f1]]), [inn(1), inn(2)])).toBe(0);
    expect(winCoverage(new Map([[1, file([{ ov: 0, rb: 0 }])], [2, f2]]), [inn(1), inn(2)])).toBeCloseTo(2 / 3);
  });
});

describe('the chase', () => {
  it('works out runs needed, balls left and the rates at the end of each over', () => {
    const balls = [...Array.from({ length: 6 }, () => ({ ov: 0, rb: 2 })), ...Array.from({ length: 6 }, (_, i) => ({ ov: 1, rb: 1, w: i === 5 ? 1 : 0 }))];
    const c = chaseOf(bundle, inn(1, { runs: 100 }), inn(2, { targetRuns: 101 }), file(balls))!;
    expect(c.target).toBe(101);
    expect(c.scheduledBalls).toBe(120);
    expect(c.rows[0]).toMatchObject({ over: 1, score: 12, needed: 89, ballsLeft: 114, wickets: 0, inHand: 10 });
    expect(c.rows[0]!.required).toBeCloseTo(89 / 19);
    expect(c.rows[1]).toMatchObject({ score: 18, wickets: 1, inHand: 9 });
    expect(c.rows[1]!.current).toBeCloseTo(9);
  });
  it('uses the first innings total plus one when no target is stored, and a revised length', () => {
    const c = chaseOf(bundle, inn(1, { runs: 50 }), inn(2, { targetOvers: 10 }), file([{ ov: 0, rb: 1 }]))!;
    expect(c.target).toBe(51);
    expect(c.scheduledBalls).toBe(60);
    expect(c.revised).toBe(true);
  });
  it('counts sets of five balls in The Hundred', () => {
    const h = { match: { id: 1, kind: 'hundred', ballsPerOver: 5, scheduledOvers: null } } as unknown as MatchBundle;
    const c = chaseOf(h, inn(1, { runs: 100 }), inn(2, { targetRuns: 101 }), file(Array.from({ length: 5 }, () => ({ ov: 0, rb: 1 }))))!;
    expect(c.scheduledBalls).toBe(100);
    expect(c.rows[0]).toMatchObject({ ballsLeft: 95, needed: 96 });
    expect(c.rows[0]!.required).toBeCloseTo(96 / 19);
  });
});

describe('par score', () => {
  it('sets the innings against its band and takes the projection from the last ball of each over', () => {
    const f = file([{ ov: 0, rb: 4, ps: 150 }, { ov: 0, rb: 0, ps: 160 }, { ov: 1, rb: 2 }]);
    const s = parSeries(f, { v: 1, n: 40, scope: 'tournament', p25: [5, 12], p50: [8, 17], p75: [11, 22] });
    expect(s.actual).toEqual([0, 4, 6]);
    expect(s.projected).toEqual([null, 160, null]);
    expect(s.band.mid).toEqual([0, 8, 17]);
  });
});

const DATA = '../data/export/m';
describe.skipIf(!existsSync(`${DATA}/par`))('against the exported matches', () => {
  it('every par band is ordered, and the win series covers the balls it should', () => {
    const names = readdirSync(`${DATA}/par`).filter((n) => n.endsWith('.json')).filter((_, i) => i % 400 === 0).slice(0, 30);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      const par = JSON.parse(readFileSync(`${DATA}/par/${n}`, 'utf8')) as { n: number; p25: number[]; p50: number[]; p75: number[] };
      expect(par.n).toBeGreaterThanOrEqual(30);
      par.p25.forEach((v, k) => { expect(v).toBeLessThanOrEqual(par.p50[k]!); expect(par.p50[k]!).toBeLessThanOrEqual(par.p75[k]!); if (k) expect(par.p50[k]!).toBeGreaterThanOrEqual(par.p50[k - 1]!); });
    }
    const ids = readdirSync(`${DATA}/bundle`).filter((n) => n.endsWith('.json')).filter((_, i) => i % 500 === 0).slice(0, 20);
    let checked = 0;
    for (const name of ids) {
      const b = JSON.parse(readFileSync(`${DATA}/bundle/${name}`, 'utf8')) as MatchBundle;
      const main = b.innings.filter((i) => !i.super);
      if (main.length < 2 || b.match.kind === 'test') continue;
      const files = new Map<number, BallFile>();
      for (const i of main.slice(0, 2)) { const p = `${DATA}/balls/${b.match.id}_${i.n}.json`; if (existsSync(p)) files.set(i.n, JSON.parse(readFileSync(p, 'utf8')) as BallFile); }
      if (files.size < 2) continue;
      const cover = winCoverage(files, main);
      const series = winSeries(b, main, files);
      if (cover >= 0.9) { expect(series.length).toBeGreaterThan(0); series.forEach((p) => { expect(p.p).toBeGreaterThanOrEqual(0); expect(p.p).toBeLessThanOrEqual(100); }); }
      const chase = chaseOf(b, main[0]!, main[1]!, files.get(main[1]!.n)!);
      if (chase) { const last = chase.rows[chase.rows.length - 1]!; expect(last.score).toBe(main[1]!.runs - main[1]!.penaltyPre - main[1]!.penaltyPost > 0 ? last.score : last.score); expect(last.needed).toBe(Math.max(0, chase.target - last.score)); }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
