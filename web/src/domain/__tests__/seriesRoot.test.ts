import { describe, expect, it } from 'vitest';
import type { ListMatch } from '@/data/matchList';
import { applyFilters, buildSeries, bySection, NO_FILTERS, searchSeries, sortSeries, twoSideResult } from '../seriesRoot';

let next = 1;
const m = (o: Partial<ListMatch> = {}): ListMatch => ({
  id: next++, date: '2024-01-01', kind: 'test', international: true, female: false, team1: { id: 'eng|intl|male', name: 'England' }, team2: { id: 'ind|intl|male', name: 'India' }, winner: 0, score1: '', score2: '', margin: 'by 5 wickets',
  competition: 'England tour of India', key: null, season: '2023/24', stage: null, venue: null, country: null, potm: null, tossWinner: -1, tossDecision: 0, batFirst: -1, ...o,
});
const ENG = { id: 'eng|intl|male', name: 'England' }, IND = { id: 'ind|intl|male', name: 'India' };

describe('series rows', () => {
  it('splits one tour into a row for each format, with that format only', () => {
    const rows = buildSeries([m(), m({ date: '2024-02-01' }), m({ kind: 'odi' }), m({ competition: '' })]);
    expect(rows.map((r) => [r.section, r.matches.length]).sort()).toEqual([['ODI', 1], ['Test', 2]]);
  });
  it('puts the touring side first, as the event name says', () => {
    const r = buildSeries([m({ team1: IND, team2: ENG, winner: 1 })])[0]!;
    expect(r.teams.map((t) => t.name)).toEqual(['England', 'India']);
  });
  it('keeps men and women apart, and tells the kind of event', () => {
    const rows = buildSeries([m(), m({ female: true }), m({ competition: 'Indian Premier League', key: 'ipl', kind: 't20', international: false }), m({ competition: 'Asia Cup Qualifier' })]);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.kind).sort()).toEqual(['Bilateral tour', 'Bilateral tour', 'Other event', 'Tournament or league']);
  });
});

describe('result in words', () => {
  it('says who won and the score, the draws, and level series', () => {
    expect(twoSideResult([m(), m(), m({ winner: 1 })], ENG, IND)).toBe('England won 2-1');
    expect(twoSideResult([m(), m({ winner: 1 }), m({ winner: -1, margin: 'drawn' })], ENG, IND)).toBe('Drawn 1-1, 1 drawn');
    expect(twoSideResult([m({ winner: -1, margin: 'no result' }), m({ winner: -1, margin: 'tied' })], ENG, IND)).toBe('Drawn 0-0, 1 tied, 1 no result');
  });
  it('words a single match plainly', () => {
    expect(twoSideResult([m()], ENG, IND)).toBe('England won');
    expect(twoSideResult([m({ winner: -1, margin: 'drawn' })], ENG, IND)).toBe('Drawn');
  });
  it('names the winner of the Final for an event of many sides', () => {
    const t = (o: Partial<ListMatch>) => m({ competition: 'Cup', team1: { id: 'a', name: 'A' }, team2: { id: 'b', name: 'B' }, ...o });
    const r = buildSeries([t({}), t({ team2: { id: 'c', name: 'C' } }), t({ stage: 'Final', winner: 1, date: '2024-02-01' })])[0]!;
    expect(r.result).toBe('B won the Final');
  });
});

describe('filters, search and sorting', () => {
  const rows = buildSeries([m(), m({ female: true, season: '2024', date: '2024-06-01' }), m({ kind: 'odi', competition: 'Pakistan tour of India', team1: { id: 'pak|intl|male', name: 'Pakistan' }, season: '2022' })]);
  it('narrows by gender and team together', () => {
    expect(applyFilters(rows, { ...NO_FILTERS, gender: 'Women' })).toHaveLength(1);
    expect(applyFilters(rows, { ...NO_FILTERS, team: 'pak|intl|male' })).toHaveLength(1);
  });
  it('searches teams and names, ignoring vs', () => {
    expect(searchSeries(rows, 'pakistan vs india')).toHaveLength(1);
    expect(searchSeries(rows, '2024')).toHaveLength(1);
  });
  it('sorts newest first by default and groups by section', () => {
    expect(sortSeries(rows, { key: 'date', dir: -1 })[0]!.season).toBe('2024');
    expect(bySection(rows).map((g) => g.section)).toEqual(['Test', 'ODI']);
  });
});
