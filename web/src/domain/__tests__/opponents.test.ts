import { describe, expect, it } from 'vitest';
import { opponentPhases, opponentRows, smallSample, sortOpponents, type OpponentCell } from '../opponents';

const cell = (id: string, key: string | null, c: Partial<OpponentCell>): OpponentCell => ({ id, name: id.toUpperCase(), style: null, key, balls: 0, runs: 0, outs: 0, dots: 0, controlKnown: 0, inControl: 0, ...c });

describe('opponent rows', () => {
  const cells = [
    cell('a', 'powerplay', { balls: 20, runs: 30, outs: 1, dots: 10, controlKnown: 10, inControl: 8 }),
    cell('a', 'death', { balls: 10, runs: 30, outs: 1, dots: 2 }),
    cell('b', 'middle', { balls: 6, runs: 3, outs: 0, dots: 4 }),
    cell('c', null, { balls: 40, runs: 20, outs: 2, dots: 20 }),
  ];
  it('adds the phases of an opponent and works out the rates', () => {
    const rows = opponentRows(cells, 'bat', false);
    const a = rows.find((r) => r.id === 'a')!;
    expect(a).toMatchObject({ balls: 30, runs: 60, outs: 2, average: 30, rate: 200, dotShare: 40, controlShare: 80, small: false });
    expect(rows.find((r) => r.id === 'b')).toMatchObject({ small: true, average: null });
  });
  it('uses economy for a bowler, per five balls in The Hundred', () => {
    expect(opponentRows([cell('a', 'rest', { balls: 20, runs: 20 })], 'bowl', false)[0]?.rate).toBe(6);
    expect(opponentRows([cell('a', 'rest', { balls: 20, runs: 20 })], 'bowl', false, true)[0]?.rate).toBe(5);
  });
  it('marks 30 balls in Tests and 12 elsewhere', () => { expect(smallSample(true)).toBe(30); expect(smallSample(false)).toBe(12); });
  it('sorts by balls, by outs then balls, or by rate', () => {
    const rows = opponentRows(cells, 'bat', false);
    expect(sortOpponents(rows, 'balls').map((r) => r.id)).toEqual(['c', 'a', 'b']);
    expect(sortOpponents(rows, 'outs').map((r) => r.id)).toEqual(['c', 'a', 'b']);
    expect(sortOpponents(rows, 'rate').map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });
  it('builds the heat map from the opponents with most balls and leaves unphased balls out of the columns', () => {
    const heat = opponentPhases(cells, 'bat', 't20', false, 0, 2);
    expect(heat.columns.map((c) => c.key)).toEqual(['powerplay', 'middle', 'death']);
    expect(heat.rows.map((r) => r.id)).toEqual(['c', 'a']);
    expect(heat.rows[1]?.cells.powerplay).toMatchObject({ rate: 150, outs: 1 });
    expect(heat.rows[1]?.cells.middle?.rate).toBeNull();
    expect(heat.max).toBe(300);
  });
});

describe('heat scale', () => {
  it('lists every opponent and takes the colour scale from cells with enough balls', () => {
    const cells = [
      cell('a', 'powerplay', { balls: 30, runs: 30 }), cell('a', 'death', { balls: 30, runs: 60 }),
      cell('b', 'powerplay', { balls: 1, runs: 6 }), cell('c', 'death', { balls: 2, runs: 0 }),
    ];
    const heat = opponentPhases(cells, 'bat', 't20', false, 12);
    expect(heat.rows.map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect([heat.min, heat.max]).toEqual([100, 200]);
    const allSmall = opponentPhases([cell('b', 'powerplay', { balls: 1, runs: 6 })], 'bat', 't20', false, 12);
    expect([allSmall.min, allSmall.max]).toEqual([600, 600]);
  });
});
