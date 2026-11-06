import { describe, expect, it } from 'vitest';
import { cleanSearch, editDistance, playerLine, rankPlayers, type Candidate } from '../search';

describe('search text', () => {
  it('drops wildcards, quotes and symbols and trims it', () => {
    expect(cleanSearch("  V Kohli%_ ; drop table x--  ")).toBe('V Kohli drop table x--');
    expect(cleanSearch("O'Brien-Smith")).toBe("O'Brien-Smith");
    expect(cleanSearch('<script>alert(1)</script>')).toBe('script alert 1 script');
  });
  it('keeps letters of other scripts and caps the length', () => {
    expect(cleanSearch('Élodie')).toBe('Élodie');
    expect(cleanSearch('a'.repeat(100))).toHaveLength(40);
  });
});

describe('player line', () => {
  it('writes role, country and years, leaving out what is missing', () => {
    expect(playerLine({ playerId: 'a', name: 'X', country: 'India', role: 'top-order batter', first: 2008, last: 2026 })).toBe('Top-order batter, India, 2008 to 2026');
    expect(playerLine({ playerId: 'a', name: 'X', country: null, role: null, first: 2020, last: 2020 })).toBe('2020');
    expect(playerLine({ playerId: 'a', name: 'X', country: 'Peru', role: null, first: null, last: null })).toBe('Peru');
  });
});

describe('rankPlayers', () => {
  const c = (playerId: string, name: string, fullName: string | null, matches: number): Candidate => ({ playerId, name, fullName, country: 'India', role: null, first: null, last: null, matches });
  const list = [
    c('1', 'V Kohli', 'Virat Kohli', 535), c('2', 'A Kohli', null, 5), c('3', 'RG Sharma', 'Rohit Gurunath Sharma', 500), c('4', 'I Sharma', 'Ishant Sharma', 200), c('5', 'Rohit Sharma', null, 3),
  ];
  const ids = (text: string) => rankPlayers(text, list).map((h) => h.playerId);
  it('finds the full name', () => expect(ids('Virat Kohli')[0]).toBe('1'));
  it('forgives a typo', () => { expect(ids('Rohiit Sharma')[0]).toBe('3'); expect(ids('Rohti Sharma')[0]).toBe('3'); expect(ids('viart kohli')[0]).toBe('1'); });
  it('matches any word order and partial words', () => { expect(ids('kohli virat')[0]).toBe('1'); expect(ids('rohi sha')[0]).toBe('3'); });
  it('puts the more experienced namesake first', () => expect(ids('kohli')).toEqual(['1', '2']));
  it('does not match unrelated names', () => expect(ids('zzzz')).toEqual([]));
  it('lists the most experienced with nothing typed', () => expect(ids('')[0]).toBe('1'));
  it('counts a swap as one edit', () => expect(editDistance('rohti', 'rohit')).toBe(1));
});

describe('players by gender', () => {
  const make = (playerId: string, name: string, gender: 'M' | 'F' | ''): Candidate => ({ playerId, name, fullName: null, country: 'India', role: null, first: 2000, last: 2020, matches: 10, gender });
  const list = [make('a', 'S Mandhana', 'F'), make('b', 'S Dhawan', 'M'), make('c', 'S Unknown', '')];
  it('lists everyone, only men, or only women, and keeps a player with no gender to All', () => {
    expect(rankPlayers('s', list, 8).map((h) => h.playerId).sort()).toEqual(['a', 'b', 'c']);
    expect(rankPlayers('s', list, 8, 'men').map((h) => h.playerId)).toEqual(['b']);
    expect(rankPlayers('s', list, 8, 'women').map((h) => h.playerId)).toEqual(['a']);
  });
});
