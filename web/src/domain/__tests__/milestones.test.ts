import { describe, expect, it } from 'vitest';
import { awardCards, fiftyCards, fiveWicketCards, hundredCards, isT20Scope, landmarkLabel, landmarks, milestoneSections, monthOf, ordinal, paceRows, type PaceFact } from '../milestones';
import type { BatInnings, BowlInnings } from '../records';

const bat = (i: number, runs: number): BatInnings => ({ match_id: i, innings: 1, tournament_key: null, season: '2020', date: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10), venue: null, team: 'X', opponent: 'Y', runs, balls: 10, fours: 0, sixes: 0, is_out: true, balls_to_50: null, balls_to_100: null, chasing: false });
const bowl = (i: number, wickets: number): BowlInnings => ({ match_id: i, innings: 1, format: 'T20', tournament_key: null, season: '2020', date: new Date(Date.UTC(2020, 1, 1 + i)).toISOString().slice(0, 10), venue: null, team: 'X', opponent: 'Y', balls: 24, runs: 20, wickets, hat_tricks: 0, maidens: 0, dots: 0, economy_counts: true });

describe('ordinal and month', () => {
  it('writes ordinals', () => expect([1, 2, 3, 4, 10, 11, 12, 13, 21, 22, 25, 101, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '10th', '11th', '12th', '13th', '21st', '22nd', '25th', '101st', '111th']));
  it('writes a month and year', () => { expect(monthOf('2006-07-27')).toBe('Jul 2006'); expect(monthOf('nonsense')).toBe('nonsense'); });
});

describe('cards', () => {
  // 30 innings in date order: every innings from the 2nd is a fifty (scores 60), plus a hundred at innings 5 and 12.
  const rows: BatInnings[] = Array.from({ length: 30 }, (_, k) => bat(k + 1, k === 0 ? 10 : k === 4 || k === 11 ? 120 : 60));
  it('gives the 1st, 10th and 25th fifty with the innings it came in, and keeps hundreds apart', () => {
    const cards = fiftyCards(rows);
    expect(cards.map((c) => c.ordinal)).toEqual(['1st', '10th', '25th']);
    expect(cards[0]).toMatchObject({ where: '2 innings' });
    expect(hundredCards(rows).map((c) => [c.ordinal, c.where])).toEqual([['1st', '5 innings']]);
  });
  it('counts a five-wicket haul from five wickets', () => {
    const cards = fiveWicketCards([bowl(1, 2), bowl(2, 5), bowl(3, 7), bowl(4, 4)]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ ordinal: '1st', where: '2 innings' });
  });
  it('gives awards the match number and orders them by date', () => {
    const cards = awardCards([{ date: '2019-05-01', matchNo: 40 }, { date: '2018-05-01', matchNo: 11 }]);
    expect(cards).toEqual([{ ordinal: '1st', count: 1, where: '11 matches', month: 'May 2018' }]);
    expect(awardCards([{ date: '2018-05-01', matchNo: 1 }])[0]!.where).toBe('1 match');
  });
  it('leaves out a section with no cards', () => {
    const s = milestoneSections({ awards: [], fifties: fiftyCards(rows), hundreds: [], fiveWickets: [] });
    expect(s.map((x) => x.title)).toEqual(['Fifties']);
    expect(milestoneSections({ awards: [], fifties: [], hundreds: [], fiveWickets: [] })).toEqual([]);
  });
});

describe('landmarks', () => {
  it('starts T20 runs at 500 and wickets at 25, and a bowler has a first wicket', () => {
    expect(landmarks('bat', true)[0]).toBe(500);
    expect(landmarks('bat', false)[0]).toBe(1000);
    expect(landmarks('bowl', false).slice(0, 3)).toEqual([1, 50, 100]);
    expect(landmarks('bowl', true).slice(0, 3)).toEqual([1, 25, 50]);
  });
  it('labels them', () => {
    expect(landmarkLabel('bat', 10000)).toBe('10,000 runs');
    expect(landmarkLabel('bowl', 1)).toBe('First wicket');
    expect(landmarkLabel('bowl', 200)).toBe('200 wickets');
  });
  it('is T20 only when every innings is T20', () => {
    expect(isT20Scope(['T20'])).toBe(true);
    expect(isT20Scope(['T20', 'ODI'])).toBe(false);
    expect(isT20Scope([])).toBe(false);
  });
});

describe('pace rows', () => {
  const f = (landmark: number, id: string, name: string, innings_n: number, rank: number, first_year: number | null = 2010): PaceFact => ({ landmark, player_id: id, name, innings_n, rank, date: '2020-03-04', first_year });
  const facts = [
    f(10000, 'me', 'Me', 205, 1), f(10000, 'a', 'A', 240, 2), f(10000, 'b', 'B', 255, 3, 1999), f(10000, 'c', 'C', 260, 4), f(10000, 'd', 'D', 265, 5), f(10000, 'e', 'E', 270, 6),
    f(5000, 'me', 'Me', 110, 12),
    f(1, 'me', 'Me', 3, 40),
  ];
  it('lists reached batting landmarks with the rank and, in the top 5, the five quickest with a dagger on an early career', () => {
    const rows = paceRows('bat', false, 'me', facts);
    expect(rows.map((r) => r.label)).toEqual(['5,000 runs', '10,000 runs']);
    const ten = rows[1]!;
    expect(ten).toMatchObject({ rank: 1, top: true, innings: 205, month: 'Mar 2020' });
    expect(ten.chips.map((c) => c.name)).toEqual(['Me', 'A', 'B', 'C', 'D']);
    expect(ten.chips.find((c) => c.name === 'B')!.earlier).toBe(true);
    expect(ten.chips.find((c) => c.me)!.earlier).toBe(false);
    expect(rows[0]).toMatchObject({ rank: 12, top: false, chips: [] });
  });
  it('gives the first wicket no rank', () => {
    const rows = paceRows('bowl', false, 'me', facts);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'First wicket', rank: null, top: false });
  });
  it('is empty when nothing is reached', () => expect(paceRows('bat', false, 'me', [])).toEqual([]));
});
