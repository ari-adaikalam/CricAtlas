import { describe, expect, it } from 'vitest';
import { cellText, dateText, defaultScope, findSlice, oversText, scopesOf, searchLists, switchGender, type RecordList, type RecordsIndex } from '../recordLists';

const scope = (key: string, label: string, kind: RecordsIndex['scopes'][number]['kind'], gender: 'male' | 'female', matches = 100) => ({ key, label, kind, gender, bpo: 6, matches, lists: {} });
const index: RecordsIndex = {
  categories: [['batting', 'Batting records']], since: 2001,
  scopes: [scope('t-ipl', 'Indian Premier League', 'tournament', 'male', 1200), scope('t20i-male', 'T20Is', 't20i', 'male'), scope('test-male', 'Tests', 'test', 'male'), scope('test-female', 'Tests', 'test', 'female'),
           scope('t-wc-m', "Men's T20 World Cup", 'tournament', 'male', 300), scope('t-wc-f', "Women's T20 World Cup", 'tournament', 'female', 200), scope('league-male', 'T20 leagues (all)', 'league', 'male')],
};

describe('overs', () => {
  it('writes balls as overs and balls for six-ball and five-ball overs', () => {
    expect(oversText(123)).toBe('20.3');
    expect(oversText(120)).toBe('20.0');
    expect(oversText(123, 5)).toBe('24.3');
    expect(oversText(0)).toBe('0.0');
  });
});

describe('cells', () => {
  it('writes numbers with the decimals of their kind and a dash for no value', () => {
    expect(cellText('dec2', 54.0512, 6)).toBe('54.05');
    expect(cellText('dec1', 183.5443, 6)).toBe('183.5');
    expect(cellText('num', 14278, 6)).toBe('14,278');
    expect(cellText('overs', 39001, 6)).toBe('6500.1');
    expect(cellText('score', '264*', 6)).toBe('264*');
    expect(cellText('num', null, 6)).toBe('-');
  });
  it('writes a date as day, month and year', () => {
    expect(dateText('2024-10-07')).toBe('7 Oct 2024');
  });
});

describe('scopes', () => {
  it('lists the formats first, then the competitions with the most matches first, for one gender', () => {
    expect(scopesOf(index, 'male').map((s) => s.key)).toEqual(['test-male', 't20i-male', 'league-male', 't-ipl', 't-wc-m']);
    expect(scopesOf(index, 'female').map((s) => s.key)).toEqual(['test-female', 't-wc-f']);
  });
  it('opens on the scope in the address, else Tests for men', () => {
    expect(defaultScope(index, 't-ipl')!.key).toBe('t-ipl');
    expect(defaultScope(index, 'nothing')!.key).toBe('test-male');
    expect(defaultScope(index, null)!.key).toBe('test-male');
  });
  it('moves to the same format or competition of the other gender, else to the first scope there', () => {
    expect(switchGender(index, index.scopes.find((s) => s.key === 'test-male')!, 'female')!.key).toBe('test-female');
    expect(switchGender(index, index.scopes.find((s) => s.key === 't-wc-m')!, 'female')!.key).toBe('t-wc-f');
    expect(switchGender(index, index.scopes.find((s) => s.key === 't-ipl')!, 'female')!.key).toBe('test-female');
  });
});

describe('search', () => {
  const lists = ['Most runs in a career', 'Most runs in an innings', 'Highest score', 'Best figures in an innings'].map((title, i) => ({ id: String(i), title, note: null, cols: [], rows: [] }) as RecordList);
  it('keeps the lists whose title has every word', () => {
    expect(searchLists(lists, 'most runs').map((l) => l.id)).toEqual(['0', '1']);
    expect(searchLists(lists, 'innings figures').map((l) => l.id)).toEqual(['3']);
    expect(searchLists(lists, '  ').length).toBe(4);
    expect(searchLists(lists, 'zzz')).toEqual([]);
  });
});

describe('slices', () => {
  const slices = { year: [{ key: 'y2019', label: '2019', matches: 40, lists: [1, 2] }], team: [{ key: 't-india', label: 'India', matches: 300, lists: [3, 4] }] };
  it('finds a slice in whichever kind it is', () => {
    expect(findSlice(slices, 'y2019')?.label).toBe('2019');
    expect(findSlice(slices, 't-india')?.matches).toBe(300);
  });
  it('finds nothing for a missing key or no slices', () => {
    expect(findSlice(slices, 'g-lords')).toBeNull();
    expect(findSlice(null, 'y2019')).toBeNull();
    expect(findSlice(slices, null)).toBeNull();
  });
});
