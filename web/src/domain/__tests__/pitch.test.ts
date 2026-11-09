import { describe, expect, it } from 'vitest';
import { BANDS, LANES, cellsFrom, controlShare, lanesFor, summarise, type PitchRow } from '../pitch';

const row = (length: string, line: string, over: Partial<PitchRow> = {}): PitchRow => ({ length, line, balls: 10, dots: 5, scoring: 3, fours: 1, sixes: 0, wickets: 1, runs: 7, inControl: 6, controlKnown: 8, ...over });

describe('pitch cells', () => {
  it('places rows by band and lane and drops unknown labels', () => {
    const cells = cellsFrom([row('good length', 'outside offstump'), row('full toss', 'wide down leg'), row('bouncer', 'on the stumps'), row('yorker', 'leg stump')]);
    expect(cells.map((c) => [c.band, c.lane])).toEqual([[3, 1], [0, 4]]);
  });
  it('summarises per band and in total', () => {
    const { bands, total } = summarise(cellsFrom([row('good length', 'outside offstump'), row('good length', 'on the stumps', { balls: 4, runs: 2 }), row('short', 'down leg')]));
    expect(bands[3]?.balls).toBe(14);
    expect(bands[3]?.runs).toBe(9);
    expect(total.balls).toBe(24);
    expect(bands[0]?.balls).toBe(0);
  });
  it('reports the control share, or none without labels', () => {
    expect(controlShare({ inControl: 6, controlKnown: 8 })).toBe(75);
    expect(controlShare({ inControl: 0, controlKnown: 0 })).toBeNull();
  });
  it('mirrors the lanes for a left-hander', () => {
    expect(lanesFor('R')[0]?.key).toBe('wide outside offstump');
    expect(lanesFor('L')[0]?.key).toBe('wide down leg');
    expect(LANES[0]?.key).toBe('wide outside offstump');
  });
  it('has bands in order from the stumps outward', () => {
    expect(BANDS.every((b, i) => i === 0 || (BANDS[i - 1]?.to === b.from))).toBe(true);
  });
});

import { landingGrid } from '../pitch';

describe('landing grid', () => {
  const row = { length: 'good length', line: 'outside offstump', balls: 20, dots: 10, scoring: 6, fours: 3, sixes: 1, wickets: 0, runs: 30, inControl: 0, controlKnown: 0 };
  it('works out the share of dots, boundaries and runs per ball for a cell', () => {
    expect(landingGrid([row], 'dots')[3]![1]).toEqual({ balls: 20, value: 0.5 });
    expect(landingGrid([row], 'boundaries')[3]![1]).toEqual({ balls: 20, value: 0.2 });
    expect(landingGrid([row], 'rpb')[3]![1]).toEqual({ balls: 20, value: 1.5 });
    expect(landingGrid([row], 'dots')[0]![0]).toEqual({ balls: 0, value: null });
  });
});
