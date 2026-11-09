import { describe, expect, it } from 'vitest';
import { findMatches, matchLine, matchSub, prepareMatches, rankMatches, type MatchSearchPayload } from '../matchSearch';

// Rows: id, date, team1, team2, tournament, season, venue, city, winner, runs, wickets, outcome, kind, female, stage
const payload: MatchSearchPayload = {
  v: 1,
  columns: [],
  lists: { team: ['India', 'England', 'Australia'], tour: ['England tour of India', 'Indian Premier League', 'The Ashes'], season: ['2024', '2008', '2023/24'], venue: ['Eden Gardens', 'MCG'], city: ['Kolkata', 'Melbourne'], outcome: ['', 'draw', 'tie'], stage: ['', 'Final'] },
  rows: [
    [1, 20240312, 0, 1, 0, 0, 0, 0, 0, 28, -1, 0, 0, 0, 0],
    [2, 20080418, 0, 2, 1, 1, 0, 0, 1, -1, 4, 0, 2, 0, 1],
    [3, 20231226, 2, 1, 2, 2, 1, 1, -1, -1, -1, 1, 0, 0, 0],
  ],
};
const matches = prepareMatches(payload);

describe('match search, all results and the Men, Women choice', () => {
  it('lists every match of a team, the team ahead of a competition that merely starts alike', () => {
    // Match 5 is England v Australia in the Indian Premier League: it starts with "india", but it comes after the matches of the team India.
    const more = prepareMatches({ ...payload, rows: [...payload.rows, [5, 20250101, 1, 2, 1, 1, 0, 0, 0, 1, -1, 0, 2, 0, 0]] });
    expect(findMatches('india', more).map((h) => h.id)).toEqual([1, 2, 5]);
    expect(findMatches('ind', more).map((h) => h.id)).toEqual([1, 2, 5]);
  });
  it('lists every match between two teams for "ind vs aus"', () => {
    expect(findMatches('ind vs aus', matches).map((h) => h.id)).toEqual([2]);
  });
  it('narrows to men or women', () => {
    expect(findMatches('', matches, 'women').map((h) => h.id)).toEqual([]);
    expect(findMatches('', matches, 'men').map((h) => h.id)).toEqual([1, 3, 2]);
    const mixed: MatchSearchPayload = { ...payload, rows: [...payload.rows, [4, 20240101, 0, 1, 0, 0, 0, 0, 0, 5, -1, 0, 2, 1, 0]] };
    const all = prepareMatches(mixed);
    expect(findMatches('', all, 'women').map((h) => h.id)).toEqual([4]);
    expect(findMatches('india', all, 'men').map((h) => h.id)).toEqual([1, 2, 3].filter((id) => id !== 3));
  });
  it('says the format: Test, ODI, T20I, T20 and The Hundred', () => {
    const rows = [[1, 20240101, 0, 1, 0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1], [2, 20240102, 0, 1, 0, 0, 0, 0, 0, 1, -1, 0, 1, 0, 0, 1], [3, 20240103, 0, 1, 0, 0, 0, 0, 0, 1, -1, 0, 2, 0, 0, 1], [4, 20240104, 0, 1, 0, 0, 0, 0, 0, 1, -1, 0, 2, 0, 0, 0], [5, 20240105, 0, 1, 0, 0, 0, 0, 0, 1, -1, 0, 3, 0, 0, 0]];
    const all = prepareMatches({ ...payload, rows });
    expect(all.map((m) => m.hit.format)).toEqual(['Test', 'ODI', 'T20I', 'T20', 'The Hundred']);
  });
  it('writes the second line of a result without the date', () => {
    expect(matchSub(matches.find((m) => m.hit.id === 2)!.hit)).toBe('Indian Premier League 2008, Eden Gardens');
  });
});

describe('match search', () => {
  it('lists the latest matches when nothing is typed', () => {
    expect(rankMatches('', matches).map((h) => h.id)).toEqual([1, 3, 2]);
  });
  it('needs every typed word to match, in any order, ignoring v and vs', () => {
    expect(rankMatches('england v india', matches).map((h) => h.id)).toEqual([1]);
    expect(rankMatches('india 2008', matches).map((h) => h.id)).toEqual([2]);
    expect(rankMatches('nothing here', matches)).toEqual([]);
  });
  it('finds a match by the usual abbreviations of its teams, in any order', () => {
    expect(rankMatches('ind v eng', matches).map((h) => h.id)).toEqual([1]);
    expect(rankMatches('aus vs ind', matches).map((h) => h.id)).toEqual([2]);
  });
  it('matches a ground, a city, a competition and a stage', () => {
    expect(rankMatches('eden', matches).map((h) => h.id)).toEqual([1, 2]);
    expect(rankMatches('melbourne', matches).map((h) => h.id)).toEqual([3]);
    expect(rankMatches('premier final', matches).map((h) => h.id)).toEqual([2]);
  });
  it('forgives a typo in a long word', () => {
    expect(rankMatches('austrlia', matches).map((h) => h.id)).toEqual([3, 2]);
  });
  it('writes the result and the line under a hit', () => {
    const [a, b, c] = [1, 2, 3].map((id) => matches.find((m) => m.hit.id === id)!.hit);
    expect(a!.result).toBe('India won by 28 runs');
    expect(b!.result).toBe('Australia won by 4 wickets');
    expect(c!.result).toBe('Match drawn');
    expect(matchLine(b!)).toBe('Indian Premier League 2008, Eden Gardens, 18 Apr 2008');
  });
  it('cleans odd characters out of the typed text', () => {
    expect(rankMatches('india%_', matches).map((h) => h.id)).toEqual([1, 2]);
  });
});
