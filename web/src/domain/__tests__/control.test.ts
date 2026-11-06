import { describe, expect, it } from 'vitest';
import { controlGrid, falseShotTrend, FALSE_SHOT_MINIMUM } from '../control';

describe('control grid', () => {
  const rows = [
    { length: 'good length', line: 'outside offstump', known: 10, inControl: 8 },
    { length: 'good length', line: 'outside offstump', known: 10, inControl: 6 },
    { length: 'short', line: 'down leg', known: 4, inControl: 1 },
  ];
  it('shares the in control balls of a line and length from their own totals', () => {
    const g = controlGrid(rows, 'R');
    expect(g.cells).toHaveLength(6);
    expect(g.cells[0]).toHaveLength(5);
    expect(g.cells[3]![1]).toMatchObject({ balls: 20, share: 0.7 });
    expect(g.cells[5]![3]).toMatchObject({ balls: 4, share: 0.25 });
    expect(g.cells[0]![0]).toEqual({ balls: 0, share: null });
  });
  it('reverses the lines for a left-hander', () => {
    const r = controlGrid(rows, 'R'), l = controlGrid(rows, 'L');
    expect(l.lanes).toEqual([...r.lanes].reverse());
    expect(l.cells[5]![1]).toMatchObject({ balls: 4 });
  });
});

describe('false shot trend', () => {
  const inn = (known: number, falseShots: number) => ({ known, falseShots, date: '2024-01-01', opponent: 'X' });
  it('leaves out short innings and takes the latest ones', () => {
    const t = falseShotTrend([inn(FALSE_SHOT_MINIMUM - 1, 5), inn(20, 4), inn(10, 5), inn(30, 3)], 2);
    expect(t.points.map((p) => p.rate)).toEqual([50, 10]);
    expect(t.average).toBeCloseTo((100 * 8) / 40);
  });
  it('has no average with no innings', () => expect(falseShotTrend([]).average).toBeNull());
});
