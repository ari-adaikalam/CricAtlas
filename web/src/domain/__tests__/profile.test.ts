import { describe, expect, it } from 'vitest';
import type { SummaryRow } from '../batting';
import { bowlFigures, bowlFormClass, careerRows, formClass, teamAbbreviation } from '../profile';

const row = (format: string, matches: number, over: Partial<SummaryRow> = {}): SummaryRow => ({
  player_id: 'p', format, tournament_key: null, tournament_name: null, season: '2020', gender: 'male', matches, appearances: matches, innings: matches, runs: matches * 30, balls_faced: matches * 30, fours: 0, sixes: 0,
  fifties: 0, hundreds: 0, ducks: 0, dismissals: matches, high_score: 50, bowling_matches: null, balls_bowled: null, runs_conceded: null, wickets: null, dot_balls: null, ...over,
});

describe('career rows', () => {
  it('adds International and T20s rows and lists leagues after the formats', () => {
    const rows = [row('TEST', 10), row('ODI', 20), row('T20', 5), row('T20', 40, { tournament_key: 'ipl', tournament_name: 'Indian Premier League', filter_section: 'Leagues' })];
    const out = careerRows(rows);
    expect(out.map((r) => r.label)).toEqual(['International', 'T20s', 'Tests', 'ODIs', 'T20Is', 'Indian Premier League']);
    expect(out[0]?.totals.matches).toBe(35);
    expect(out[1]?.totals.matches).toBe(45);
  });
  it('has no combined row for a single format', () => {
    expect(careerRows([row('TEST', 10)]).map((r) => r.label)).toEqual(['Tests']);
  });
});

describe('form', () => {
  it('colours by runs and not out', () => {
    expect(formClass({ runs: 71, notOut: false, opponent: 'X' })).toBe('hi');
    expect(formClass({ runs: 29, notOut: false, opponent: 'X' })).toBe('mid');
    expect(formClass({ runs: 4, notOut: false, opponent: 'X' })).toBe('lo');
    expect(formClass({ runs: 52, notOut: true, opponent: 'X' })).toBe('no');
  });
  it('abbreviates team names and sums the last runs', () => {
    expect(teamAbbreviation('Australia')).toBe('AUS');
    expect(teamAbbreviation('Royal Challengers Bengaluru')).toBe('RCB');
    expect(bowlFigures({ wickets: 3, runs: 25, opponent: 'A' })).toBe('3/25');
    expect([0, 1, 2, 3, 5].map((wickets) => bowlFormClass({ wickets, runs: 20, opponent: 'A' }))).toEqual(['lo', 'lo', 'mid', 'hi', 'hi']);
  });
});
