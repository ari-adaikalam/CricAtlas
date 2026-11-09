import { describe, expect, it } from 'vitest';
import { batchPlan } from '../pitch';

describe('batchPlan', () => {
  it('draws a handful of balls one at a time, quickly', () => {
    expect(batchPlan(5)).toEqual({ batch: 1, seconds: 0.7 });
  });
  it('groups a bigger sample so the draw stays short', () => {
    const small = batchPlan(60), big = batchPlan(420);
    expect(small.batch).toBeLessThan(big.batch);
    expect(big.seconds).toBeLessThanOrEqual(1.6);
    expect(big.seconds).toBeGreaterThanOrEqual(small.seconds);
  });
  it('never takes more than the cap, however many paths', () => {
    expect(batchPlan(100000).seconds).toBeLessThanOrEqual(1.6);
  });
});
