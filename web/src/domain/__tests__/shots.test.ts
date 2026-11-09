import { describe, expect, it } from 'vitest';
import { handOf, shotKind, zoneTotals, type Shot } from '../shots';

const shot = (x: number, y: number, runs: number): Shot => ({ x, y, runs, out: false, shot: null, bowler: null, over: 0, ballInOver: 1 });

describe('zoneTotals', () => {
  // (100, 300) is zone 5 and (250, 40) is zone 1 in the dataset's geometry.
  const shots = [shot(100, 300, 4), shot(100, 300, 1), shot(250, 40, 6)];
  it('adds runs, fours and sixes per zone', () => {
    const t = zoneTotals(shots);
    expect(t[5]).toEqual({ runs: 5, shots: 2, fours: 1, sixes: 0 });
    expect(t[1]).toEqual({ runs: 6, shots: 1, fours: 0, sixes: 1 });
  });
  it('can stop part way through, for the replay', () => {
    expect(zoneTotals(shots, 1)[5]).toEqual({ runs: 4, shots: 1, fours: 1, sixes: 0 });
    expect(zoneTotals(shots, 0)[5]?.runs).toBe(0);
  });
});

describe('shot helpers', () => {
  it('classes a shot by its runs', () => {
    expect([1, 2, 3, 4, 6].map(shotKind)).toEqual(['run', 'run', 'run', 'four', 'six']);
  });
  it('reads the batting hand', () => {
    expect(handOf('left-hand bat')).toBe('L');
    expect(handOf('right-hand bat')).toBe('R');
    expect(handOf(null)).toBe('R');
  });
});
