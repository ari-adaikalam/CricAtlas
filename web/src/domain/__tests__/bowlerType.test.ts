import { describe, expect, it } from 'vitest';
import { barHalfRange, groupOfStyle, isKnownType, primaryStyle, typeOptions } from '../bowlerType';

describe('bowler type', () => {
  it('uses the first style listed', () => {
    expect(primaryStyle('right-arm offbreak, legbreak')).toBe('right-arm offbreak');
    expect(primaryStyle(null)).toBeNull();
    expect(groupOfStyle('right-arm offbreak, legbreak')).toBe('spin');
    expect(groupOfStyle('right-arm medium, right-arm offbreak')).toBe('pace');
    expect(groupOfStyle('slow left-arm orthodox, left-arm wrist-spin')).toBe('spin');
  });
  it('puts an unclear style in neither group', () => {
    expect(groupOfStyle('right-arm bowler')).toBeNull();
    expect(groupOfStyle(null)).toBeNull();
    expect(groupOfStyle('left-arm slow')).toBe('spin');
    expect(groupOfStyle('right-arm slow-medium')).toBe('pace');
  });
  it('lists All, Pace, Spin and the thirteen labels, with balls for greying', () => {
    const o = typeOptions(new Map([['right-arm fast', 10], ['legbreak', 5], ['right-arm bowler', 3]]));
    expect(o).toHaveLength(16);
    expect(o.slice(0, 3).map((x) => [x.value, x.balls])).toEqual([['all', 18], ['pace', 10], ['spin', 5]]);
    expect(o.find((x) => x.value === 's:legbreak')).toMatchObject({ label: 'Legbreak', balls: 5 });
    expect(o.find((x) => x.value === 's:left-arm fast')?.balls).toBe(0);
  });
  it('accepts only known values from the URL', () => {
    expect(isKnownType('pace')).toBe(true);
    expect(isKnownType('s:legbreak')).toBe(true);
    expect(isKnownType("s:x'; drop")).toBe(false);
    expect(isKnownType('chess')).toBe(false);
  });
});

import { typeRows } from '../bowlerType';

describe('typeRows', () => {
  const rows = [
    { style: 'right-arm medium', balls: 100, runs: 120, outs: 3 },
    { style: 'legbreak', balls: 50, runs: 50, outs: 2 },
    { style: 'right-arm bowler', balls: 50, runs: 50, outs: 0 },
    { style: null, balls: 100, runs: 130, outs: 1 },
  ];
  it('compares each labelled type with the strike rate against all bowlers, most balls first', () => {
    const { rows: out, overall } = typeRows(rows);
    expect(overall).toBeCloseTo((350 / 300) * 100);
    expect(out.map((r) => r.label)).toEqual(['Right-arm medium', 'Legbreak']);
    expect(out[0]).toMatchObject({ strikeRate: 120, outs: 3 });
    expect(out[0]?.difference).toBeCloseTo(120 - (350 / 300) * 100);
    expect(out[1]?.difference).toBeLessThan(0);
  });
  it('is empty with no balls', () => expect(typeRows([])).toEqual({ rows: [], overall: null }));
});

import { shotsByType } from '../bowlerType';

describe('shotsByType', () => {
  const rows = [
    { style: 'right-arm medium', shot: 'pull', balls: 30, runs: 45 }, { style: 'right-arm medium', shot: 'defended', balls: 70, runs: 5 },
    { style: 'legbreak', shot: 'pull', balls: 10, runs: 10 }, { style: 'legbreak', shot: 'sweep', balls: 10, runs: 15 },
    { style: null, shot: 'cut shot', balls: 40, runs: 20 },
  ];
  it('shares add to 100 in each column and rates come from the cell counts', () => {
    const t = shotsByType(rows, 2, 5);
    expect(t.columns.map((c) => c.style)).toEqual(['right-arm medium', 'legbreak']);
    expect(t.rows.map((r) => r.key)).toEqual(['defended', 'pull', 'other']);
    const share = (style: string) => t.rows.reduce((a, r) => a + (r.cells[style]?.share ?? 0), 0);
    expect(share('right-arm medium')).toBeCloseTo(100);
    expect(share('legbreak')).toBeCloseTo(100);
    expect(t.rows[1]?.cells['right-arm medium']).toMatchObject({ balls: 30, share: 30, strikeRate: 150 });
    expect(t.rows[2]?.cells.legbreak).toMatchObject({ balls: 10, share: 50, strikeRate: 150 });
  });
  it('is empty with no tracked balls', () => expect(shotsByType([]).rows).toEqual([]));
});

describe('barHalfRange', () => {
  it('ignores one outlier gap', () => {
    expect(barHalfRange([126, 8, -8, 4, -3])).toBe(10);
    expect(barHalfRange([126, 40, -8, 4])).toBe(50);
  });
  it('has a floor of 10 and copes with few rows', () => {
    expect(barHalfRange([3, -2])).toBe(10);
    expect(barHalfRange([30])).toBe(38);
    expect(barHalfRange([])).toBe(10);
  });
});
