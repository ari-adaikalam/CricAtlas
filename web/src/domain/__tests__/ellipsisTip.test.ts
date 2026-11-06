import { describe, expect, it } from 'vitest';
import { isTruncated, tipFor, type TextBox } from '../ellipsisTip';

const box = (over: Partial<TextBox>): TextBox => ({ textOverflow: 'ellipsis', lineClamp: 'none', scrollWidth: 100, clientWidth: 100, scrollHeight: 20, clientHeight: 20, ...over });

describe('isTruncated', () => {
  it('is false for text that fits, or that differs by a pixel of rounding', () => {
    expect(isTruncated(box({}))).toBe(false);
    expect(isTruncated(box({ scrollWidth: 101 }))).toBe(false);
  });
  it('is true for ellipsis text wider than its box', () => {
    expect(isTruncated(box({ scrollWidth: 140 }))).toBe(true);
  });
  it('is false for wide text that does not draw an ellipsis', () => {
    expect(isTruncated(box({ textOverflow: 'clip', scrollWidth: 300 }))).toBe(false);
  });
  it('is true for a line clamp that cuts lines', () => {
    expect(isTruncated(box({ textOverflow: 'clip', lineClamp: '2', scrollHeight: 60, clientHeight: 40 }))).toBe(true);
    expect(isTruncated(box({ textOverflow: 'clip', lineClamp: '2', scrollHeight: 40, clientHeight: 40 }))).toBe(false);
  });
});

describe('tipFor', () => {
  it('tidies white space and drops empty text', () => {
    expect(tipFor('  West Indies   v  India \n 2026 ')).toBe('West Indies v India 2026');
    expect(tipFor('   ')).toBeNull();
    expect(tipFor(null)).toBeNull();
  });
});
