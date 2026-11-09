import { describe, expect, it } from 'vitest';
import { applyFilters, bowlingGroup, NO_FILTERS, options, roleGroup, searchPlayers, sortPlayers, type Filters } from '../playersRoot';
import type { ListPlayer } from '@/data/playerList';

const player = (o: Partial<ListPlayer>): ListPlayer => ({ id: 'a', name: 'A Player', fullName: null, gender: 'male', country: 'India', role: 'top-order batter', batting: 'right-hand bat', bowling: null, image: null, firstYear: 2010, lastYear: 2024, matches: 100, runs: 3000, wickets: 0, fmts: ['ODI'], leagues: [], ...o });
const ps = [
  player({ id: '1', name: 'V Kohli', fullName: 'Virat Kohli', matches: 800, runs: 37000, wickets: 13, fmts: ['TEST', 'ODI', 'T20I', 'T20'], leagues: ['ipl'], firstYear: 2008, lastYear: 2026, bowling: 'right-arm medium' }),
  player({ id: '2', name: 'JJ Bumrah', role: 'bowler', batting: 'right-hand bat', bowling: 'right-arm fast', matches: 300, runs: 400, wickets: 450, firstYear: 2016, lastYear: 2026, leagues: ['ipl'], fmts: ['TEST', 'ODI'] }),
  player({ id: '3', name: 'S Mandhana', fullName: 'Smriti Mandhana', gender: 'female', batting: 'left-hand bat', matches: 250, runs: 8000, firstYear: 2013, lastYear: 2026, leagues: ['wpl'] }),
  player({ id: '4', name: 'No Profile', country: null, role: null, batting: null, matches: 2, runs: 1, firstYear: 2021, lastYear: 2021 }),
  player({ id: '5', name: 'R Ashwin', role: 'bowling allrounder', bowling: 'right-arm offbreak', firstYear: 2010, lastYear: 2024 }),
];
const f = (o: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...o });

describe('players list', () => {
  it('groups roles and bowling styles', () => {
    expect(['top-order batter', 'bowler', 'bowling allrounder', 'wicketkeeper batter', 'wicketkeeper', null].map(roleGroup)).toEqual(['Batters', 'Bowlers', 'Allrounders', 'Wicketkeeper batters', 'Wicketkeeper batters', null]);
    expect(['right-arm fast', 'right-arm medium', 'slow left-arm orthodox', 'legbreak googly', null].map(bowlingGroup)).toEqual(['Pace', 'Pace', 'Spin', 'Spin', 'None']);
  });
  it('combines filters and leaves a player with no value out of that filter', () => {
    expect(applyFilters(ps, f({ role: 'Bowlers' })).map((p) => p.name)).toEqual(['JJ Bumrah']);
    expect(applyFilters(ps, f({ hand: 'Left-hand bat' })).map((p) => p.name)).toEqual(['S Mandhana']);
    expect(applyFilters(ps, f({ gender: 'Women', league: 'wpl' })).map((p) => p.name)).toEqual(['S Mandhana']);
    expect(applyFilters(ps, f({ runs: '10,000 or more' })).map((p) => p.name)).toEqual(['V Kohli']);
    expect(applyFilters(ps, f({ era: 'Debuted 2020 to 2026' })).map((p) => p.name)).toEqual(['No Profile']);
    expect(applyFilters(ps, f({ status: 'Last played before 2025' })).map((p) => p.name)).toEqual(['No Profile', 'R Ashwin']);
  });
  it('counts each option under the other filters', () => {
    const o = options(ps, f({ gender: 'Women' }), 'role');
    expect(o.find((x) => x.value === 'Batters')!.players).toBe(1);
    expect(o.find((x) => x.value === 'Bowlers')!.players).toBe(0);
    expect(options(ps, f({ gender: 'Women' }), 'gender').find((x) => x.value === 'Men')!.players).toBe(4);
  });
  it('lists the countries once and names leagues', () => {
    expect(options(ps, NO_FILTERS, 'country').map((x) => x.value)).toEqual(['India']);
    expect(options(ps, NO_FILTERS, 'league', new Map([['ipl', 'Indian Premier League']])).map((x) => x.label)).toEqual(['Indian Premier League', 'wpl']);
  });
  it('searches the name and the full name, a name that starts with the text first', () => {
    expect(searchPlayers(ps, 'virat').map((p) => p.name)).toEqual(['V Kohli']);
    expect(searchPlayers(ps, 'smri')[0]!.name).toBe('S Mandhana');
    expect(searchPlayers(ps, '')).toHaveLength(5);
  });
  it('sorts with the most matches breaking a tie', () => {
    expect(sortPlayers(ps, { key: 'wickets', dir: -1 })[0]!.name).toBe('JJ Bumrah');
    expect(sortPlayers(ps, { key: 'name', dir: 1 })[0]!.name).toBe('JJ Bumrah');
  });
});
