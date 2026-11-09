import { describe, expect, it } from 'vitest';
import { overflows, TINY } from '../ScrollGuard';

describe('overflows', () => {
  it('earns no bar for content that fits, for padding, or for a few pixels', () => {
    expect(overflows(100, 100)).toBe(false);
    expect(overflows(100 + TINY, 100)).toBe(false);
  });
  it('earns a bar once the content is taller by more than a few pixels', () => {
    expect(overflows(100 + TINY + 1, 100)).toBe(true);
    expect(overflows(160, 100)).toBe(true);
  });
});
