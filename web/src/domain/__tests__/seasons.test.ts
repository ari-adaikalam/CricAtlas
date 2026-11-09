import { describe, expect, it } from 'vitest';
import { niceAxis, seasonStats, shortYear } from '../seasons';

describe('season stats', () => {
  const rows = [{ year: 2020, runs: 300, balls: 200, innings: 10, dismissals: 6 }, { year: 2023, runs: 100, balls: 100, innings: 3, dismissals: 0 }];
  const out = seasonStats(rows);
  it('has an entry for every year from the first to the last', () => expect(out.map((y) => y.year)).toEqual([2020, 2021, 2022, 2023]));
  it('leaves a year with no balls as a gap', () => expect(out[1]).toMatchObject({ runs: 0, strikeRate: null, average: null }));
  it('works rates out from the year, and no average without a dismissal', () => {
    expect(out[0]).toMatchObject({ strikeRate: 150, average: 50 });
    expect(out[3]).toMatchObject({ strikeRate: 100, average: null });
  });
  it('is empty with no rows', () => expect(seasonStats([])).toEqual([]));
});

describe('bar axis', () => {
  it('uses three equal round steps at or above the largest value', () => {
    const a = niceAxis(1620);
    expect(a.top).toBeGreaterThanOrEqual(1620);
    expect(a.top).toBe(a.step * 3);
    expect([1, 2, 2.5, 5].includes(a.step / Math.pow(10, Math.floor(Math.log10(a.step))))).toBe(true);
  });
  it('copes with small and empty values', () => {
    expect(niceAxis(2).top).toBeGreaterThanOrEqual(2);
    expect(niceAxis(0)).toEqual({ step: 1, top: 3 });
  });
  it('writes years short', () => expect(shortYear(2023)).toBe("'23"));
});

import { bowlSeasonStats } from '../seasons';

describe('bowling seasons', () => {
  it('fills the gap years and works out economy and average from the year counts', () => {
    const out = bowlSeasonStats([{ year: 2020, wickets: 4, conceded: 120, balls: 120, innings: 5 }, { year: 2022, wickets: 0, conceded: 30, balls: 24, innings: 1 }]);
    expect(out.map((y) => y.year)).toEqual([2020, 2021, 2022]);
    expect(out[0]).toMatchObject({ economy: 6, average: 30 });
    expect(out[1]).toMatchObject({ economy: null, average: null, wickets: 0 });
    expect(out[2]?.average).toBeNull();
  });
  it('counts five-ball overs in The Hundred', () => expect(bowlSeasonStats([{ year: 2023, wickets: 1, conceded: 30, balls: 25, innings: 1 }], 5)[0]?.economy).toBe(6));
});
