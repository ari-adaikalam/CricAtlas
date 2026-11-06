import { describe, expect, it } from 'vitest';
import { initialisms, plain, queryTokens, scoreWords, shortsOf, splitGender, splitVersus, wordsOf } from '../searchCore';

describe('reading a typed text', () => {
  it('cleans accents, dots, hyphens and case', () => {
    expect(plain("  O'Brien, de-Villiers  ")).toBe('o brien de villiers');
    expect(plain('Dušan')).toBe('dusan');
  });
  it('drops the words that only join two sides', () => {
    expect(queryTokens('ind vs aus')).toEqual(['ind', 'aus']);
    expect(queryTokens('RCB v GT')).toEqual(['rcb', 'gt']);
    expect(queryTokens('v kohli')).toEqual(['kohli']);
  });
  it('splits two sides only when there are words on both', () => {
    expect(splitVersus('ind vs aus')).toEqual(['ind', 'aus']);
    expect(splitVersus('kohli v bumrah')).toEqual(['kohli', 'bumrah']);
    expect(splitVersus('v kohli vs j bumrah')).toEqual(['v kohli', 'j bumrah']);
    expect(splitVersus('v kohli')).toBeNull();
    expect(splitVersus('india vs')).toBeNull();
    expect(splitVersus('india')).toBeNull();
  });
});

describe('short letters of a name', () => {
  it('reads initials, and a short capital word letter by letter', () => {
    expect(initialisms('Royal Challengers Bengaluru')).toEqual(['rcb']);
    expect(initialisms('Indian Premier League')).toEqual(['ipl']);
    expect(initialisms('MS Dhoni')).toEqual(['msd', 'md']);
    expect(initialisms('AB de Villiers')).toContain('abdv');
    expect(initialisms('Kohli')).toEqual([]);
  });
});

describe('scoring a thing for a typed text', () => {
  const rcb = [...wordsOf('Royal Challengers Bengaluru'), ...shortsOf('Royal Challengers Bengaluru')];
  it('matches in any order, as a start, with the short letters, or not at all', () => {
    expect(scoreWords(['rcb'], rcb)).toBe(0);
    expect(scoreWords(['royal'], rcb)).toBe(0);
    expect(scoreWords(['beng', 'roy'], rcb)).toBe(2);
    expect(scoreWords(['rcb', 'csk'], rcb)).toBeNull();
  });
  it('charges a worse field more', () => {
    expect(scoreWords(['lord'], [...wordsOf('Lords', 2)])).toBe(3);
    expect(scoreWords(['lord'], [...wordsOf('Lords', 0)])).toBe(1);
  });
  it('allows a typo in a word of five letters or more only', () => {
    expect(scoreWords(['kholi'], wordsOf('Kohli'))).toBe(3);
    expect(scoreWords(['khol'], wordsOf('Kohli'))).toBeNull();
    expect(scoreWords(['rohiit'], wordsOf('Rohit'))).toBe(3);
  });
});

import { eventWords, personWords, teamWords } from '../searchCore';
import { rankPlayers, type Candidate } from '../search';

describe('what each kind of thing is searched by', () => {
  it('finds a team by its short name, its short letters or an earlier name', () => {
    expect(scoreWords(['rcb'], teamWords('Royal Challengers Bengaluru'))).toBe(0);
    expect(scoreWords(['ind'], teamWords('India'))).toBe(0);
    expect(scoreWords(['afg'], teamWords('Afghanistan'))).toBe(0);
    expect(scoreWords(['bangalore'], teamWords('Royal Challengers Bengaluru', ['Royal Challengers Bangalore']))).toBe(0);
    expect(scoreWords(['dubai'], teamWords('Abu Dhabi Knight Riders', ['Dubai Knight Riders']))).toBe(1);
    expect(scoreWords(['rcb'], teamWords('Gujarat Titans'))).toBeNull();
    expect(scoreWords(['bangalore'], teamWords('Royal Challengers Bengaluru'))).toBe(0);
    expect(scoreWords(['windies'], teamWords('West Indies'))).toBe(0);
  });
  it('finds an event by its short letters and short names', () => {
    expect(scoreWords(['ipl'], eventWords('Indian Premier League'))).toBe(0);
    expect(scoreWords(['wc'], eventWords("Men's Cricket World Cup"))).toBe(0);
    expect(scoreWords(['wc'], eventWords("Women's T20 World Cup"))).toBe(0);
    expect(scoreWords(['ipl'], eventWords('Big Bash League'))).toBeNull();
  });
  it('finds a person by the short letters of the name', () => {
    expect(scoreWords(['msd'], personWords('MS Dhoni', 'Mahendra Singh Dhoni'))).toBe(1);
    expect(scoreWords(['abd'], personWords('AB Dinda'))).toBe(scoreWords(['abd'], personWords('AB de Villiers')));
    expect(scoreWords(['virat', 'kohli'], personWords('V Kohli', 'Virat Kohli'))).toBe(0);
  });
});

describe('ranking players', () => {
  const player = (playerId: string, name: string, fullName: string | null, matches: number): Candidate => ({ playerId, name, fullName, country: null, role: null, first: null, last: null, matches });
  const people = [player('1', 'AB Dinda', 'Ashok Bhim Dinda', 20), player('2', 'AB de Villiers', 'Abraham Benjamin de Villiers', 420), player('3', 'Abdul Razzaq', null, 330)];
  it('puts the player with most matches first when the short letters fit more than one', () => {
    expect(rankPlayers('abd', people, 3).map((p) => p.playerId)[0]).toBe('2');
  });
  it('finds a player by first name, surname or both', () => {
    const kohli = [player('9', 'V Kohli', 'Virat Kohli', 500)];
    for (const q of ['virat', 'kohli', 'v kohli', 'virat kohli', 'vk']) expect(rankPlayers(q, kohli, 3).length, q).toBe(1);
  });
});

describe('words that say men or women', () => {
  it('takes the word out and returns the gender', () => {
    expect(splitGender('australia women')).toEqual({ rest: 'australia', gender: 'women' });
    expect(splitGender("Women's world cup")).toEqual({ rest: 'world cup', gender: 'women' });
    expect(splitGender('mens ipl')).toEqual({ rest: 'ipl', gender: 'men' });
    expect(splitGender('women')).toEqual({ rest: '', gender: 'women' });
    expect(splitGender('women ipl')).toEqual({ rest: 'wpl', gender: 'women' });
    expect(splitGender('womens bbl 2024')).toEqual({ rest: 'wbbl 2024', gender: 'women' });
    expect(splitGender('ipl').rest).toBe('ipl');
  });
  it('leaves a name that only contains the letters', () => {
    expect(splitGender('mendis')).toEqual({ rest: 'mendis', gender: null });
    expect(splitGender('ind vs aus')).toEqual({ rest: 'ind vs aus', gender: null });
  });
});

describe('gender in a player search', () => {
  const p = (playerId: string, name: string, gender: 'M' | 'F'): Candidate => ({ playerId, name, fullName: null, country: null, role: null, first: null, last: null, matches: 10, gender });
  it('narrows to women when the text says so, whatever the toggle says', () => {
    const people = [p('1', 'Ellyse Perry', 'F'), p('2', 'Perry Jones', 'M')];
    expect(rankPlayers('perry women', people, 5, 'all').map((x) => x.playerId)).toEqual(['1']);
    expect(rankPlayers('perry women', people, 5, 'men').map((x) => x.playerId)).toEqual(['1']);
    expect(rankPlayers('perry', people, 5, 'all').length).toBe(2);
  });
});
