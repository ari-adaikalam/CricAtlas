import { describe, expect, it } from 'vitest';
import {
  resetForFormat, visibleOptions, anySet, ballFiltersFromParams, ballFiltersToParams, blockedBy, countBalls, DEFAULT_BALL_FILTERS, normaliseBall, options, passes, type BallFilters, type Combo,
} from '../ballFilters';

const combo = (over: Partial<Combo>): Combo => ({ phase: 'powerplay', band: 0, superOver: false, innings: 1, wickets: 'low', result: 'won', balls: 10, ...over });
const f = (over: Partial<BallFilters>): BallFilters => ({ ...DEFAULT_BALL_FILTERS, ...over });
const combos: Combo[] = [
  combo({}),
  combo({ phase: 'death', innings: 2, wickets: 'high', result: 'lost', balls: 5 }),
  combo({ phase: 'middle', superOver: true, innings: 3, balls: 2 }),
];

describe('passing and counting', () => {
  it('leaves Super Overs out by default and counts them when asked', () => {
    expect(countBalls(combos, f({}), false)).toBe(15);
    expect(countBalls(combos, f({ superOvers: 'included' }), false)).toBe(17);
    expect(countBalls(combos, f({ superOvers: 'only' }), false)).toBe(2);
  });
  it('filters by phase, innings, wickets and result', () => {
    expect(countBalls(combos, f({ phase: 'death' }), false)).toBe(5);
    expect(countBalls(combos, f({ innings: '2', result: 'lost' }), false)).toBe(5);
    expect(countBalls(combos, f({ wickets: 'high', phase: 'powerplay' }), false)).toBe(0);
  });
  it('uses overs bands in Tests and has no Super Overs there', () => {
    const t = [combo({ phase: null, band: 2, superOver: true, balls: 4 })];
    expect(passes(t[0]!, f({ phase: 'band2' }), true)).toBe(true);
    expect(passes(t[0]!, f({ phase: 'band1' }), true)).toBe(false);
    expect(passes(t[0]!, f({}), true)).toBe(true);
  });
});

describe('blocking from the data', () => {
  it('blocks an option with no balls together with the other choices and names the cause', () => {
    expect(blockedBy(combos, f({ wickets: 'high' }), 'phase', 'powerplay', 'bat', false)).toBe('6 or more wickets down');
    expect(blockedBy(combos, f({ wickets: 'high' }), 'phase', 'death', 'bat', false)).toBeNull();
  });
  it('does not block an option that has balls', () => {
    expect(blockedBy(combos, f({}), 'phase', 'middle', 'bat', false)).not.toBeNull();
    expect(blockedBy(combos, f({ superOvers: 'included' }), 'phase', 'middle', 'bat', false)).toBeNull();
  });
  it('drops a choice that no longer has balls', () => {
    expect(normaliseBall(combos, f({ phase: 'powerplay', wickets: 'high' }), false)).toEqual(f({ phase: 'powerplay', wickets: 'any' }));
  });
});

describe('options and URLs', () => {
  it('words innings by view and format', () => {
    expect(options('innings', 'bat', false).map((o) => o.label)).toEqual(['All innings', 'Batting first', 'Chasing']);
    expect(options('innings', 'bowl', false).map((o) => o.label)).toEqual(['All innings', 'Bowling first', 'Defending']);
    expect(options('innings', 'bat', true)).toHaveLength(5);
    expect(options('result', 'bat', true).map((o) => o.value)).toContain('draw');
    expect(options('result', 'bat', false).map((o) => o.value)).not.toContain('draw');
  });
  it('round-trips and ignores unknown values', () => {
    const value = f({ phase: 'death', innings: '2', superOvers: 'only' });
    const params = new URLSearchParams(); ballFiltersToParams(value, params);
    expect(ballFiltersFromParams(params, 'bat', false)).toEqual(value);
    expect(ballFiltersFromParams(new URLSearchParams('phase=drop&inn=9&so=<x>'), 'bat', false)).toEqual(DEFAULT_BALL_FILTERS);
    expect(anySet(value)).toBe(true);
    expect(anySet(DEFAULT_BALL_FILTERS)).toBe(false);
  });
});

describe('phase options follow the format', () => {
  const hundred = [combo({ phase: 'powerplay' }), combo({ phase: 'rest' })];
  const t20 = [combo({ phase: 'powerplay' }), combo({ phase: 'middle' }), combo({ phase: 'death' })];
  const both = [...hundred, ...t20];
  const values = (c: Combo[] | null): string[] => visibleOptions('phase', 'bat', false, c).map((o) => o.value);
  it('lists Powerplay and Rest of innings for The Hundred', () => expect(values(hundred)).toEqual(['all', 'powerplay', 'rest']));
  it('lists Powerplay, Middle and Death for T20 and ODI', () => expect(values(t20)).toEqual(['all', 'powerplay', 'middle', 'death']));
  it('lists all of them when T20s include The Hundred', () => expect(values(both)).toEqual(['all', 'powerplay', 'middle', 'death', 'rest']));
  it('lists the standard ones while the counts load, and leaves other filters alone', () => {
    expect(values(null)).toEqual(['all', 'powerplay', 'middle', 'death']);
    expect(visibleOptions('innings', 'bat', false, null)).toHaveLength(3);
  });
});

describe('moving between Tests and the other formats', () => {
  it('restarts Phase and Super Overs and keeps what still means the same', () => {
    expect(resetForFormat(f({ phase: 'band2', innings: '2', wickets: 'high', result: 'won', superOvers: 'only' }))).toEqual(f({ innings: '2', wickets: 'high', result: 'won' }));
  });
  it('drops a 3rd or 4th innings and a draw', () => {
    expect(resetForFormat(f({ innings: '4', result: 'draw' }))).toEqual(f({}));
  });
});

describe('hand and opponent', () => {
  it('are read from the URL when valid, and the hand only on the Bowling view', () => {
    const q = new URLSearchParams('bh=left&vs=ba607b88');
    expect(ballFiltersFromParams(q, 'bowl', false)).toEqual(f({ hand: 'left', opponent: 'ba607b88' }));
    expect(ballFiltersFromParams(q, 'bat', false)).toEqual(f({ opponent: 'ba607b88' }));
    expect(ballFiltersFromParams(new URLSearchParams('bh=other&vs=not-an-id'), 'bowl', false)).toEqual(f({}));
  });
  it('round-trip through the URL and count as set', () => {
    const value = f({ hand: 'right', opponent: '462411b3' });
    const params = new URLSearchParams(); ballFiltersToParams(value, params);
    expect(params.toString()).toBe('bh=right&vs=462411b3');
    expect(anySet(value)).toBe(true);
  });
  it('go back to all when the scope has no balls for them, and are not blamed for blocked options', () => {
    expect(normaliseBall([], f({ hand: 'left', opponent: 'ba607b88' }), false)).toEqual(f({}));
    expect(blockedBy(combos, f({ hand: 'left', opponent: 'ba607b88' }), 'phase', 'middle', 'bowl', false)).toBe('');
  });
});
