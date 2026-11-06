import { describe, expect, it } from 'vitest';
import { applyFilters, formatTag, NO_FILTERS, OTHER_COMPETITIONS, options, resultOf, searchMatches, sortMatches, teamLabels, type Filters } from '../matchesRoot';
import type { ListMatch } from '@/data/matchList';

let next = 1;
const match = (o: Partial<ListMatch>): ListMatch => ({
  id: next++, date: '2024-04-01', kind: 't20', international: false, female: false, team1: { id: 'a|ipl|male', name: 'A' }, team2: { id: 'b|ipl|male', name: 'B' }, winner: 0, score1: '180/5', score2: '170/8', margin: 'by 10 runs',
  competition: 'Indian Premier League', key: 'ipl', season: '2024', stage: null, venue: 'G1', country: 'India', potm: { id: 'p1', name: 'Some Player' }, tossWinner: 0, tossDecision: 1, batFirst: 0, ...o,
});
const ms = [
  match({}),
  match({ date: '2024-05-01', stage: 'Final', winner: 1, batFirst: 0, margin: 'by 5 wickets (12 balls left)', venue: 'G2', country: 'UAE' }),
  match({ kind: 'test', international: true, key: null, competition: 'A tour of B', season: '2023/24', margin: 'drawn', winner: -1, score1: '300 & 200/4d', score2: '280', tossDecision: 2, date: '2024-01-10', team1: { id: 'india|intl|male', name: 'India' }, team2: { id: 'england|intl|male', name: 'England' } }),
  match({ female: true, margin: 'no result', winner: -1, score1: '', score2: '', team1: { id: 'india|intl|female', name: 'India' }, team2: { id: 'england|intl|female', name: 'England' }, key: null, international: true, date: '2024-02-02' }),
];
const f = (o: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...o });

describe('matches list', () => {
  it('classifies a result and tags a format', () => {
    expect(ms.map(resultOf)).toEqual(['Won', 'Won', 'Drawn', 'No result']);
    expect(resultOf(match({ winner: -1, margin: 'tied' }))).toBe('Tied');
    expect(ms.map(formatTag)).toEqual(['T20', 'T20', 'Test', 'T20I']);
  });
  it('combines filters, including who won and the toss', () => {
    expect(applyFilters(ms, f({ competition: 'ipl', result: 'Won' }))).toHaveLength(2);
    expect(applyFilters(ms, f({ wonBy: 'Team chasing' })).map((m) => m.margin)).toEqual(['by 5 wickets (12 balls left)']);
    expect(applyFilters(ms, f({ wonBy: 'Team batting first' })).map((m) => m.margin)).toEqual(['by 10 runs']);
    expect(applyFilters(ms, f({ toss: 'Chose to field' })).map((m) => m.kind)).toEqual(['test']);
    expect(applyFilters(ms, f({ competition: OTHER_COMPETITIONS }))).toHaveLength(2);
    expect(applyFilters(ms, f({ gender: 'Women' }))).toHaveLength(1);
  });
  it('counts each option under the other filters', () => {
    const o = options(ms, f({ gender: 'Women' }), 'format', new Map(), new Map());
    expect(o.find((x) => x.value === 't20')!.matches).toBe(1);
    expect(o.find((x) => x.value === 'test')!.matches).toBe(0);
    expect(options(ms, f({ gender: 'Women' }), 'gender', new Map(), new Map()).find((x) => x.value === 'Men')!.matches).toBe(3);
  });
  it('tells a name used by two teams apart in the Team filter', () => {
    const l = teamLabels(ms);
    expect(l.get('india|intl|male')).toBe('India (men)');
    expect(l.get('india|intl|female')).toBe('India (women)');
    expect(l.get('a|ipl|male')).toBe('A');
  });
  it('sorts newest first by default, by venue on request', () => {
    expect(sortMatches(ms, { key: 'date', dir: -1 })[0]!.date).toBe('2024-05-01');
    expect(sortMatches(ms, { key: 'venue', dir: 1 })[0]!.venue).toBe('G1');
  });
  it('searches teams, venue, competition, stage and player, every word', () => {
    expect(searchMatches(ms, 'final g2')).toHaveLength(1);
    expect(searchMatches(ms, 'vs final g2')).toHaveLength(1);
    expect(searchMatches(ms, 'some player')).toHaveLength(4);
    expect(searchMatches(ms, 'tour')).toHaveLength(1);
    expect(searchMatches(ms, '')).toHaveLength(4);
  });
});
