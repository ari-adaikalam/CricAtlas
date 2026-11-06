import { describe, expect, it } from 'vitest';
import { emblemFacts, emblemInk, pairPaint } from '../emblem';
import { separation } from '../colours';

describe('emblem facts', () => {
  it('reads the letters and colours of a known team', () => {
    const t = emblemFacts('India');
    expect(t.short).toBe('IND');
    expect(t.c1).toMatch(/^#[0-9A-F]{6}$/i);
  });
  it('gives a team the table lacks a neutral emblem with its initials', () => {
    const t = emblemFacts('Nowhere Strikers United');
    expect(t.short).toBe('NSU');
    expect(t.c1).toBe('#3A3A3A');
  });
  it('picks dark ink on a light colour and white on a dark one', () => {
    expect(emblemInk('#F5C400')).toBe('#141414');
    expect(emblemInk('#1B2A5C')).toBe('#FFFFFF');
  });
});

describe('pair paint', () => {
  it('keeps each side its own colour when they differ', () => {
    const [a, b] = pairPaint('India', 'Australia');
    expect(a.fill).not.toBe(b.fill);
    expect(separation(a.fill, b.fill)).toBeGreaterThanOrEqual(10);
  });
  it('moves the second side off a colour too close to the first', () => {
    // The same team on both sides is as close as colours get: the second side takes its secondary colour (or, failing that, gold or sky).
    const [a, b] = pairPaint('India', 'India');
    expect(a.fill).not.toBe(b.fill);
    expect(separation(a.fill, b.fill)).toBeGreaterThanOrEqual(10);
  });
  it('gives every fill an ink that reads on it', () => {
    for (const side of pairPaint('Namibia', 'Uganda')) expect(['#141414', '#FFFFFF']).toContain(side.ink);
  });
});
