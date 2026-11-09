import { describe, expect, it } from 'vitest';
import { FIELD_CENTRE, FIELD_RADIUS, RING } from '../wagon';
import { bandOf, ringBands } from '../ring';
import type { Shot } from '../shots';

const shot = (x: number, y: number, runs: number): Shot => ({ x, y, runs, out: false, shot: null, bowler: null, over: 1, ballInOver: 1 });
const atFraction = (f: number): [number, number] => [FIELD_CENTRE.x + FIELD_RADIUS * f, FIELD_CENTRE.y];

describe('ring bands', () => {
  it('puts the centre inside the ring and cuts the outside at 0.75 and 1', () => {
    expect(bandOf(FIELD_CENTRE.x, RING.centreY)).toBe(0);
    expect(bandOf(...atFraction(0.6))).toBe(1);
    expect(bandOf(...atFraction(0.8))).toBe(2);
    expect(bandOf(...atFraction(1.1))).toBe(3);
  });
  it('adds runs and balls to each band and shares the runs', () => {
    const t = ringBands([shot(FIELD_CENTRE.x, RING.centreY, 1), shot(FIELD_CENTRE.x, RING.centreY, 0), shot(...atFraction(0.8), 4), shot(...atFraction(1.1), 6)]);
    expect(t.bands.map((b) => b.balls)).toEqual([2, 0, 1, 1]);
    expect(t.bands.map((b) => b.runs)).toEqual([1, 0, 4, 6]);
    expect(t.bands[0]).toMatchObject({ strikeRate: 50, share: 1 / 11 });
    expect(t.bands[1]!.strikeRate).toBeNull();
    expect(t.insideShare).toBeCloseTo(1 / 11);
    expect(t.runs).toBe(11);
  });
  it('is all zero with no balls', () => expect(ringBands([]).runs).toBe(0));
});
