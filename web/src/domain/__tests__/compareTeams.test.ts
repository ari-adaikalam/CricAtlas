import { describe, expect, it } from 'vitest';
import { boardRows, knockoutRecord, scopeOf, sharedMatches, teamAgg, winsByGround, winsByYear, type TeamData } from '../compareTeams';
import type { TeamFilters, TeamInnings, TeamMatch } from '../team';

let next = 1;
const match = (o: Partial<TeamMatch> = {}): TeamMatch => ({
  id: next++, date: '2024-04-01', season: '2024', year: 2024, format: 'ODI', kind: 'odi', tk: null, tname: null, tkind: null, league: false, event: null, edition: null, stageClass: null, stageName: null,
  venue: 'G1', city: 'C', country: 'X', opp: 'B', oppId: 'b|intl|male', tossWon: true, tossDecision: 'bat', result: 'won', tied: false, byRuns: 10, byWkts: null, byInnings: false, scheduledOvers: 50,
  batFirst: true, potmId: null, potm: null, tracked: 0, trackedOf: 0, dropped: 0, ...o,
});
const inn = (matchId: number, side: 'for' | 'against', runs: number, o: Partial<TeamInnings> = {}): TeamInnings => ({
  matchId, inn: side === 'for' ? 1 : 2, side, superOver: false, runs, wkts: 8, balls: 300, wides: 0, noballs: 0, byes: 0, legbyes: 0, penalty: 0, fours: 0, sixes: 0, declared: false, ...o,
});
const info = (id: string, name: string) => ({ id, name, gender: 'male' as const, national: true, matches: 0, firstYear: 2000, lastYear: 2024, hasReviews: false });
const filters: TeamFilters = { format: 'ODI', competition: null, season: null, opponent: null, venue: null };

describe('Compare teams numbers', () => {
  const m1 = match({ result: 'won' }), m2 = match({ result: 'lost', year: 2023, season: '2023', byRuns: null, byWkts: 4 }), m3 = match({ format: 'TEST', kind: 'test', result: 'draw' });
  const a: TeamData = { info: info('a|intl|male', 'A'), matches: [m1, m2, m3], innings: [inn(m1.id, 'for', 300), inn(m1.id, 'against', 250), inn(m2.id, 'for', 200), inn(m2.id, 'against', 201)] };
  const b: TeamData = { info: info('b|intl|male', 'B'), matches: [match({ result: 'lost', opp: 'A', oppId: 'a|intl|male' })], innings: [] };

  it('puts a team in scope by the format and takes only the matches against one opponent when asked', () => {
    expect(scopeOf(a, filters).ms.map((m) => m.id)).toEqual([m1.id, m2.id]);
    expect(scopeOf(a, filters, 'b|intl|male').ms).toHaveLength(2);
    expect(scopeOf(a, filters, 'c|intl|male').ms).toHaveLength(0);
  });
  it('averages the innings in scope and finds the highest total', () => {
    const t = teamAgg(scopeOf(a, filters));
    expect(t.avgFor).toBe(250);
    expect(t.avgAgainst).toBe(225.5);
    expect(t.highest).toBe(300);
    expect(t.counts.rate).toBe(0.5);
  });
  it('leaves out a Scoreboard category neither team has a number for, and decides the rest', () => {
    const rows = boardRows(teamAgg(scopeOf(a, filters)), teamAgg(scopeOf(b, filters)), null, null);
    expect(rows.find((r) => r.label === 'Matches')).toMatchObject({ a: { v: 2 }, b: { v: 1 } });
    expect(rows.some((r) => r.label === 'Catches')).toBe(false);
  });
  it('lists only the competitions both teams play', () => {
    const both = sharedMatches(a, b);
    expect(both.every((m) => m.format === 'ODI')).toBe(true);
  });
  it('counts wins by year and by ground from the first team side', () => {
    const ms = [m1, m2, match({ result: 'won', year: 2023, venue: 'G2' })];
    expect(winsByYear(ms)).toEqual([{ year: 2023, a: 1, b: 1 }, { year: 2024, a: 1, b: 0 }]);
    expect(winsByGround(ms)[0]).toMatchObject({ ground: 'G1', matches: 2, a: 1, b: 1 });
  });
  it('has no knockout record without tournament editions', () => {
    expect(knockoutRecord(scopeOf(a, filters))).toEqual({ editions: 0, reached: 0, finals: 0, won: 0 });
  });
});
