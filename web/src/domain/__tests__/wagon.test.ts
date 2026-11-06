import { describe, expect, it } from 'vitest';
import { boundaryFraction, insideRing, zoneName, zoneOf } from '../wagon';

// Expected values come from the dataset's own code (cricket_pipeline/directions.py zone_from_xy, boundary_fraction, inside_ring).
const FROM_DATASET: Array<[number, number, number, number, boolean]> = [
  [180, 165, 8, 0.089918, true], [180, 0, 8, 1.004139, false], [0, 165, 6, 1.008114, false], [363, 165, 2, 1.01163, false],
  [100, 300, 5, 0.797522, false], [250, 40, 1, 0.870441, false], [181, 181, 4, 0.001423, true], [60, 120, 7, 0.752335, false],
  [300, 250, 3, 0.760974, false], [180, 300, 4, 0.65853, false], [90, 90, 7, 0.714649, false], [200, 200, 4, 0.147492, true],
];

describe('wagon geometry matches the dataset', () => {
  it.each(FROM_DATASET)('point %i,%i', (x, y, zone, fraction, ring) => {
    expect(zoneOf(x, y)).toBe(zone);
    expect(boundaryFraction(x, y)).toBeCloseTo(fraction, 5);
    expect(insideRing(x, y)).toBe(ring);
  });
});

describe('zone names', () => {
  it('names the right-hand view', () => {
    expect(zoneName(1, 'R')).toBe('Fine leg');
    expect(zoneName(6, 'R')).toBe('Cover');
  });
  it('mirrors only the name for a left-hander (zone k reads as 9 minus k)', () => {
    expect(zoneName(6, 'L')).toBe('Mid wicket');
    expect(zoneName(1, 'L')).toBe('Third man');
  });
  it('rejects a zone outside 1 to 8', () => {
    expect(() => zoneName(0, 'R')).toThrow(RangeError);
    expect(() => zoneName(9, 'R')).toThrow(RangeError);
  });
});
