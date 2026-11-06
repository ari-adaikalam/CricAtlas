import { describe, expect, it } from 'vitest';
import { ballBinSize, histogram, howOut, outPlaying } from '../dismissals';

describe('dismissal types', () => {
  it('groups caught and bowled with caught and keeps the legend order', () => {
    const out = howOut([{ type: 'caught', n: 6 }, { type: 'caught and bowled', n: 2 }, { type: 'bowled', n: 2 }, { type: 'run out', n: 9 }]);
    expect(out.map((o) => o.label)).toEqual(['Caught', 'Bowled', 'LBW', 'Stumped', 'Other']);
    expect(out[0]).toMatchObject({ wickets: 8, share: 0.8 });
    expect(out[2]?.wickets).toBe(0);
  });
  it('is all zero with no wickets', () => expect(howOut([]).every((o) => o.wickets === 0 && o.share === 0)).toBe(true));
});

describe('out playing', () => {
  it('lists the top five labelled shots and then the unlabelled wickets', () => {
    const rows = [...'abcdefg'].map((s, i) => ({ shot: s, n: 10 - i })).concat([{ shot: null as unknown as string, n: 4 }]);
    const out = outPlaying(rows);
    expect(out.map((r) => r.shot)).toEqual(['a', 'b', 'c', 'd', 'e', null]);
    expect(out[5]?.wickets).toBe(4);
  });
  it('has no Not recorded row when every wicket has a shot', () => expect(outPlaying([{ shot: 'pull', n: 2 }]).some((r) => r.shot === null)).toBe(false));
});

describe('balls faced bins', () => {
  it('sizes by the longest format in scope', () => {
    expect(ballBinSize(new Set(['TEST', 'T20']), false)).toBe(20);
    expect(ballBinSize(new Set(['ODI', 'T20']), false)).toBe(12);
    expect(ballBinSize(new Set(['T20']), false)).toBe(6);
    expect(ballBinSize(new Set(['T20']), true)).toBe(5);
  });
  it('counts each value once with an open last bin', () => {
    const bins = histogram([0, 5, 6, 59, 60, 400], 6);
    expect(bins).toHaveLength(11);
    expect(bins[0]).toMatchObject({ label: '0-5', count: 2 });
    expect(bins[1]?.count).toBe(1);
    expect(bins[9]?.count).toBe(1);
    expect(bins[10]).toMatchObject({ label: '60+', count: 2 });
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(6);
  });
});

import { batterHowOut } from '../dismissals';

describe('batter dismissals', () => {
  it('counts run outs and puts stumped and hit wicket in Other', () => {
    const out = batterHowOut([{ type: 'caught', n: 5 }, { type: 'caught and bowled', n: 1 }, { type: 'run out', n: 2 }, { type: 'stumped', n: 1 }, { type: 'hit wicket', n: 1 }]);
    expect(out.map((o) => [o.label, o.wickets])).toEqual([['Caught', 6], ['Bowled', 0], ['LBW', 0], ['Run out', 2], ['Other', 2]]);
  });
});

import { dismissalMapGrid } from '../dismissals';

describe('dismissal map', () => {
  const rows = [{ length: 'good length', line: 'outside offstump', outs: 5 }, { length: 'good length', line: 'outside offstump', outs: 2 }, { length: 'short', line: 'down leg', outs: 3 }, { length: 'odd', line: 'down leg', outs: 9 }];
  it('adds the dismissals of a cell, drops unknown rows and finds the largest cell', () => {
    const g = dismissalMapGrid(rows, 'R');
    expect(g.cells).toHaveLength(6);
    expect(g.cells[3]![1]).toBe(7);
    expect(g.cells[5]![3]).toBe(3);
    expect(g).toMatchObject({ max: 7, total: 10 });
  });
  it('reverses the lines for a left-hander', () => {
    const l = dismissalMapGrid(rows, 'L');
    expect(l.lanes[0]).toBe('Wide leg');
    expect(l.cells[5]![1]).toBe(3);
  });
});
