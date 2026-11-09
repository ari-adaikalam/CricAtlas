import { describe, expect, it } from 'vitest';
import { rankTeams, rankTournaments, teamLine } from '../navSearch';
import type { RootTeam } from '../teamsRoot';
import type { TournamentInfo } from '../tournament';

const team = (o: Partial<RootTeam>): RootTeam => ({ id: 'x|intl|male', name: 'India', gender: 'male', national: true, matches: 100, won: 50, lost: 40, nr: 2, rate: 0.5, titles: 1, firstYear: 2001, lastYear: 2026, comps: [], fmts: [], country: 'India', league: null, earlier: [], ...o });
const tour = (o: Partial<TournamentInfo>): TournamentInfo => ({ key: 'ipl', name: 'Indian Premier League', kind: 'league', gender: 'male', editions: 18, firstSeason: '2007/08', lastSeason: '2026', matches: 1243, teams: 15, formats: [], champion: null, titles: [], ...o });

describe('nav search teams and tournaments', () => {
  it('lists nothing for no text, and the biggest team first', () => {
    const ts = [team({ id: 'a', name: 'India Women', gender: 'female', matches: 50 }), team({ id: 'b', name: 'India', matches: 900 })];
    expect(rankTeams('', ts, 3)).toEqual([]);
    expect(rankTeams('india', ts, 3).map((t) => t.id)).toEqual(['b', 'a']);
  });
  it('follows the men or women choice', () => {
    const ts = [team({ id: 'a', gender: 'female' }), team({ id: 'b' })];
    expect(rankTeams('india', ts, 3, 'women').map((t) => t.id)).toEqual(['a']);
    expect(rankTournaments('premier', [tour({}), tour({ key: 'wpl', gender: 'female' })], 3, 'men').map((t) => t.key)).toEqual(['ipl']);
  });
  it('finds a tournament by any word of its name', () => {
    expect(rankTournaments('premier league indian', [tour({})], 3).map((t) => t.key)).toEqual(['ipl']);
  });
  it('describes a team in one line', () => {
    expect(teamLine(team({ gender: 'female' }))).toBe("Women's national team, 2001 to 2026");
  });
});
