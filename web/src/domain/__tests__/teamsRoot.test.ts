import { describe, expect, it } from 'vitest';
import { applyFilters, NO_FILTERS, options, searchTeams, sortTeams, toRoot, type Filters } from '../teamsRoot';
import type { TeamIndexRow } from '@/data/teamData';

const row = (o: Partial<TeamIndexRow>): TeamIndexRow => ({ id: 'india|intl|male', name: 'India', gender: 'male', national: true, matches: 100, firstYear: 2001, lastYear: 2026, hasReviews: false, earlier: [], won: 60, lost: 30, nr: 5, titles: 3, comps: ['t20-world-cup-male'], fmts: ['ODI', 'T20I'], ...o });
const teams = [
  toRoot(row({})),
  toRoot(row({ id: 'chennai-super-kings|ipl|male', name: 'Chennai Super Kings', national: false, matches: 266, won: 148, lost: 116, nr: 1, titles: 5, firstYear: 2008, comps: ['ipl'], fmts: ['T20'], earlier: ['Chennai Super Kings Old'] })),
  toRoot(row({ id: 'mumbai-indians|wpl|female', name: 'Mumbai Indians', gender: 'female', national: false, matches: 37, won: 23, lost: 14, nr: 0, titles: 2, firstYear: 2023, comps: ['wpl'], fmts: ['T20'] })),
  toRoot(row({ id: 'nepal|intl|male', name: 'Nepal', matches: 50, won: 20, lost: 25, nr: 5, titles: 0, firstYear: 2019, lastYear: 2024, comps: [], fmts: ['T20I'] })),
];
const f = (o: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...o });

describe('teams list', () => {
  it('counts the win rate over matches with a result and the country of a league', () => {
    expect(teams[0]!.rate).toBeCloseTo(60 / 95, 6);
    expect(teams[1]).toMatchObject({ country: 'India', league: 'IPL' });
    expect(teams[0]!.country).toBe('India');
  });
  it('combines filters and keeps a team with no match for a rate out of a rate filter', () => {
    expect(applyFilters(teams, f({ type: 'Franchise', gender: 'Men' })).map((t) => t.name)).toEqual(['Chennai Super Kings']);
    expect(applyFilters(teams, f({ rate: '60% or more' })).map((t) => t.name)).toEqual(['India', 'Mumbai Indians']);
    expect(applyFilters(teams, f({ status: 'Not active since 2024' })).map((t) => t.name)).toEqual(['Nepal']);
    expect(applyFilters(teams, f({ era: 'First match 2020 to 2026' }))).toHaveLength(1);
  });
  it('counts each option under the other filters and none under its own', () => {
    const o = options(teams, f({ gender: 'Women' }), 'type');
    expect(o.find((x) => x.value === 'Franchise')!.teams).toBe(1);
    expect(o.find((x) => x.value === 'National team')!.teams).toBe(0);
    // the gender options are counted without the gender choice itself
    expect(options(teams, f({ gender: 'Women' }), 'gender').find((x) => x.value === 'Men')!.teams).toBe(3);
  });
  it('names the leagues from the tournament names and lists a competition once', () => {
    const o = options(teams, NO_FILTERS, 'league', new Map([['ipl', 'Indian Premier League']]));
    expect(o.map((x) => x.label)).toEqual(['Indian Premier League', 't20-world-cup-male', 'wpl']);
  });
  it('sorts with the most matches breaking a tie, and a team with no rate last', () => {
    expect(sortTeams(teams, { key: 'matches', dir: -1 })[0]!.name).toBe('Chennai Super Kings');
    expect(sortTeams(teams, { key: 'name', dir: 1 })[0]!.name).toBe('Chennai Super Kings');
    expect(sortTeams([...teams, toRoot(row({ id: 'x|intl|male', name: 'X', matches: 2, won: 0, lost: 0, nr: 2 }))], { key: 'rate', dir: -1 }).at(-1)!.name).toBe('X');
  });
  it('searches the name and earlier names, ignoring accents and punctuation', () => {
    expect(searchTeams(teams, 'super').map((t) => t.name)).toEqual(['Chennai Super Kings']);
    expect(searchTeams(teams, 'old').map((t) => t.name)).toEqual(['Chennai Super Kings']);
    expect(searchTeams(teams, '')).toHaveLength(4);
  });
});
