import { describe, expect, it } from 'vitest';
import { formatFits } from '../matchFormat';

describe('formatFits', () => {
  it('lets every match through under All formats', () => {
    for (const f of ['Test', 'ODI', 'T20I', 'T20', 'The Hundred']) expect(formatFits('all', f)).toBe(true);
  });
  it('keeps one format under its chip', () => {
    expect(formatFits('test', 'Test')).toBe(true);
    expect(formatFits('test', 'ODI')).toBe(false);
    expect(formatFits('t20i', 'T20I')).toBe(true);
    expect(formatFits('t20i', 'T20')).toBe(false);
  });
  it('counts a league match, The Hundred included, under T20 leagues', () => {
    expect(formatFits('t20', 'T20')).toBe(true);
    expect(formatFits('t20', 'The Hundred')).toBe(true);
    expect(formatFits('t20', 'T20I')).toBe(false);
  });
});
