import { describe, expect, it } from 'vitest';
import { rollingForm, type InningsLine } from '../form';

const inn = (runs: number, balls: number, out: boolean, i = 0): InningsLine => ({ matchId: i, innings: 1, runs, balls, out, date: '2024-01-01', opponent: 'X' });

describe('rolling form', () => {
  it('uses the totals of the window, not an average of innings', () => {
    const line = [inn(100, 50, true), inn(0, 50, true), inn(20, 20, false)];
    const form = rollingForm(line, 2);
    expect(form[1]).toEqual({ average: 50, strikeRate: 100, window: 2 });
    // window of the last two: 20 runs, 70 balls, one out
    expect(form[2]?.average).toBe(20);
    expect(form[2]?.strikeRate).toBeCloseTo((20 / 70) * 100);
  });
  it('starts with a shorter window so every innings has a point', () => {
    const form = rollingForm(Array.from({ length: 5 }, (_, i) => inn(10, 10, true, i)), 3);
    expect(form.map((p) => p.window)).toEqual([1, 2, 3, 3, 3]);
  });
  it('leaves the average empty while no one has been out', () => {
    const form = rollingForm([inn(30, 20, false), inn(40, 25, false)], 15);
    expect(form.map((p) => p.average)).toEqual([null, null]);
    expect(form[1]?.strikeRate).toBeCloseTo((70 / 45) * 100);
  });
  it('returns nothing for no innings', () => expect(rollingForm([])).toEqual([]));
});

import { rollingBowlForm } from '../form';

describe('bowling form', () => {
  const line = (runs: number, balls: number, wickets: number) => ({ matchId: 1, innings: 1, runs, balls, wickets, date: '2024-01-01', opponent: 'X' });
  it('works out each point from the window totals', () => {
    const f = rollingBowlForm([line(30, 24, 1), line(20, 24, 0), line(50, 24, 2)], 6, 2);
    expect(f[0]).toMatchObject({ average: 30, economy: 7.5, window: 1 });
    expect(f[1]).toMatchObject({ average: 50, economy: 6.25, window: 2 });
    expect(f[2]).toMatchObject({ average: 35, window: 2 });
  });
  it('leaves the average empty with no wicket and counts five-ball overs in The Hundred', () => {
    expect(rollingBowlForm([line(20, 20, 0)], 6)[0]?.average).toBeNull();
    expect(rollingBowlForm([line(20, 20, 0)], 5)[0]?.economy).toBe(5);
  });
});
