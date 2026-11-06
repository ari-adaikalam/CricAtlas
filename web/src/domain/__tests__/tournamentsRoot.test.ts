import { describe, expect, it } from 'vitest';
import { applyFilters, heldText, isActive, isQualificationLeague, kindLine, noChampionText, lastYearOf, NO_FILTERS, options, searchTournaments, sortTournaments, titlesText, type Filters } from '../tournamentsRoot';
import type { TournamentInfo } from '../tournament';

const t = (o: Partial<TournamentInfo>): TournamentInfo => ({
  key: 'ipl', name: 'Indian Premier League', kind: 'league', gender: 'male', editions: 19, firstSeason: '2007/08', lastSeason: '2026', matches: 1243, teams: 15, formats: ['T20'],
  champion: { id: 'rcb|ipl|male', name: 'Royal Challengers Bengaluru', edition: '2026' }, titles: [{ id: 'csk', name: 'Chennai Super Kings', count: 5 }, { id: 'mi', name: 'Mumbai Indians', count: 5 }], ...o,
});
const ts = [
  t({}),
  t({ key: 'wtc-male', name: "Men's World Test Championship", kind: 'tournament', editions: 3, firstSeason: '2021', lastSeason: '2025', matches: 3, teams: 4, formats: ['TEST'], titles: [{ id: 'a', name: 'A', count: 1 }, { id: 'b', name: 'B', count: 1 }, { id: 'c', name: 'C', count: 1 }, { id: 'd', name: 'D', count: 1 }] }),
  t({ key: 'wpl', name: "Women's Premier League", gender: 'female', editions: 3, firstSeason: '2022/23', lastSeason: '2024', matches: 66, teams: 5, champion: null, titles: [] }),
  t({ key: 'hnd', name: 'The Hundred', formats: ['HUNDRED'], editions: 5, firstSeason: '2021', lastSeason: '2024', matches: 200 }),
];
const f = (o: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...o });

describe('tournaments list', () => {
  it('reads the last year of a season and whether a tournament is still held', () => {
    expect([lastYearOf('2025/26'), lastYearOf('2026'), lastYearOf('2007/08')]).toEqual([2026, 2026, 2008]);
    expect(ts.map(isActive)).toEqual([true, true, false, false]);
  });
  it('combines the four filters', () => {
    expect(applyFilters(ts, f({ kind: 'League', gender: 'Women' })).map((x) => x.key)).toEqual(['wpl']);
    expect(applyFilters(ts, f({ format: 'HUNDRED' })).map((x) => x.key)).toEqual(['hnd']);
    expect(applyFilters(ts, f({ status: 'Not held since 2024' })).map((x) => x.key)).toEqual(['wpl', 'hnd']);
  });
  it('counts each option under the other filters', () => {
    const o = options(ts, f({ kind: 'International tournament' }), 'format');
    expect(o.find((x) => x.value === 'TEST')!.tournaments).toBe(1);
    expect(o.find((x) => x.value === 'T20')!.tournaments).toBe(0);
  });
  it('sorts with the most matches breaking a tie and a tournament with no champion last', () => {
    expect(sortTournaments(ts, { key: 'matches', dir: -1 })[0]!.key).toBe('ipl');
    expect(sortTournaments(ts, { key: 'champion', dir: 1 }).at(-1)!.key).toBe('wpl');
    expect(sortTournaments(ts, { key: 'held', dir: 1 })[0]!.key).toBe('ipl');
  });
  it('writes the titles by name, or how many are level, and the held years', () => {
    expect(titlesText(ts[0]!)).toEqual({ names: [{ id: 'csk', name: 'Chennai Super Kings' }, { id: 'mi', name: 'Mumbai Indians' }], more: null, count: 5 });
    expect(titlesText(ts[1]!)).toEqual({ names: [], more: '4 teams level', count: 1 });
    expect(titlesText(ts[2]!)).toBeNull();
    expect(heldText(ts[0]!)).toBe('2007/08 to 2026');
  });
  it('says a qualification league is one and why it has no champion', () => {
    const q = t({ key: 'odi-world-cup-league-male', name: 'Men\'s Cricket World Cup League', kind: 'tournament', champion: null, titles: [] });
    expect(isQualificationLeague(q)).toBe(true);
    expect(kindLine(q)).toBe('Qualification league, men');
    expect(noChampionText(q)).toBe('No final, the table decides qualification');
    expect(kindLine(ts[2]!)).toBe('League, women');
    expect(noChampionText(ts[2]!)).toBe('No final in the data');
  });
  it('searches the name by every word', () => {
    expect(searchTournaments(ts, 'premier league').map((x) => x.key)).toEqual(['ipl', 'wpl']);
    expect(searchTournaments(ts, "women's premier").map((x) => x.key)).toEqual(['wpl']);
    expect(searchTournaments(ts, '')).toHaveLength(4);
  });
});
