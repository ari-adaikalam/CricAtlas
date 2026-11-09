import { describe, expect, it } from 'vitest';
import { economyByBall, progressionSpan, quantile, wicketsByBin, type ProgressionBall } from '../progression';

describe('progression', () => {
  it('takes the span from the longest format in scope', () => {
    expect(progressionSpan(new Set(['TEST']), false)).toBe(120);
    expect(progressionSpan(new Set(['ODI', 'T20']), false)).toBe(60);
    expect(progressionSpan(new Set(['T20']), false)).toBe(24);
    expect(progressionSpan(new Set(['T20']), true)).toBe(20);
  });
  it('interpolates quantiles', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
  });
  it('takes the running economy across innings and drops balls few innings reached', () => {
    const balls: ProgressionBall[] = [];
    for (let i = 0; i < 12; i++) { balls.push({ innings: `a${i}`, ball: 1, runs: 1, wicket: false }); balls.push({ innings: `a${i}`, ball: 2, runs: 2 + (i % 2), wicket: false }); }
    balls.push({ innings: 'a0', ball: 3, runs: 5, wicket: false });
    const out = economyByBall(balls, 24);
    expect(out.map((p) => p.ball)).toEqual([1, 2]);
    expect(out[0]).toMatchObject({ innings: 12, median: 6, low: 6, high: 6 });
    expect(out[1]?.median).toBeCloseTo(((2.5) / 2) * 6);
  });
  it('works out wickets per 100 balls in eight bins that tile the span', () => {
    const balls: ProgressionBall[] = Array.from({ length: 24 }, (_, i) => ({ innings: 'x', ball: i + 1, runs: 0, wicket: i === 0 || i === 1 }));
    const bins = wicketsByBin(balls, 24);
    expect(bins).toHaveLength(8);
    expect(bins[0]).toMatchObject({ from: 1, to: 3, balls: 3, wickets: 2 });
    expect(bins[0]?.per100).toBeCloseTo(66.67, 1);
    expect(bins.reduce((a, b) => a + b.balls, 0)).toBe(24);
    const odi = wicketsByBin([], 60);
    expect(odi[0]?.from).toBe(1);
    expect(odi[7]?.to).toBe(60);
    expect(odi.every((b, i, a) => i === 0 || b.from === (a[i - 1]?.to ?? 0) + 1)).toBe(true);
  });
});
