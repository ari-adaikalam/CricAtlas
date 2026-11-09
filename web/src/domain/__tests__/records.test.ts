import { describe, expect, it } from 'vitest';
import { battingCards, battingList, bowlingCards, bowlingList, oversOf, rankBatting, recordSides, searchRows, type BatInnings, type BowlInnings } from '../records';
import type { SummaryRow } from '../batting';

const bat = (o: Partial<BatInnings>): BatInnings => ({ match_id: 1, innings: 1, tournament_key: null, season: '2020', date: '2020-01-01', venue: 'Ground A', team: 'X', opponent: 'Y', runs: 0, balls: 10, fours: 0, sixes: 0, is_out: true, balls_to_50: null, balls_to_100: null, chasing: false, ...o });
const bowl = (o: Partial<BowlInnings>): BowlInnings => ({ match_id: 1, innings: 1, format: 'T20', tournament_key: null, season: '2020', date: '2020-01-01', venue: 'Ground A', team: 'X', opponent: 'Y', balls: 24, runs: 24, wickets: 0, hat_tricks: 0, maidens: 0, dots: 6, economy_counts: true, ...o });
const value = (cards: Array<{ label: string; value: string }>, label: string): string => (cards.find((c) => c.label === label) ?? cards.find((c) => c.label.startsWith(label)))?.value ?? 'missing';

describe('batting cards', () => {
  const rows = [
    bat({ match_id: 1, runs: 120, balls: 100, fours: 10, sixes: 3, balls_to_50: 40, balls_to_100: 85, season: '2019', is_out: false, chasing: true }),
    bat({ match_id: 2, runs: 120, balls: 90, fours: 12, sixes: 1, balls_to_50: 35, balls_to_100: 80, season: '2019', date: '2020-03-01' }),
    bat({ match_id: 3, runs: 55, balls: 30, sixes: 6, balls_to_50: 28, season: '2021', is_out: false }),
    bat({ match_id: 4, runs: 0, balls: 3, season: '2021' }),
    bat({ match_id: 5, runs: 0, balls: 2, is_out: false, season: '2021' }),
  ];
  const cards = battingCards(rows, 211);
  it('has 16 cards', () => expect(cards).toHaveLength(16));
  it('takes the highest score from the fewest balls on a tie, and marks a not out', () => {
    expect(rankBatting(rows)[0]!.match_id).toBe(2);
    expect(value(cards, 'highest score')).toBe('120');
  });
  it('finds the fastest 50 and 100 and the most sixes and fours', () => {
    expect(value(cards, 'balls for the fastest 50')).toBe('28');
    expect(value(cards, 'balls for the fastest 100')).toBe('80');
    expect(value(cards, 'sixes in one')).toBe('6');
    expect(value(cards, 'fours in one')).toBe('12');
  });
  it('counts a duck only when out, and fifties apart from hundreds', () => {
    expect(value(cards, 'duck')).toBe('1');
    expect(value(cards, 'fifty')).toBe('1');
    expect(value(cards, 'hundreds')).toBe('2');
    expect(value(cards, 'not outs')).toBe('3');
  });
  it('picks the best season, the chase score and the partnership', () => {
    expect(cards.find((c) => c.label.startsWith('runs in the best season'))).toEqual({ value: '240', label: 'runs in the best season, 2019' });
    expect(value(cards, 'highest score chasing')).toBe('120*');
    expect(value(cards, 'biggest partnership')).toBe('211');
  });
  it('needs 30 runs for the best strike rate', () => expect(value(cards, 'best strike rate')).toBe('183.3'));
  it('shows dashes with no innings', () => {
    const none = battingCards([], null);
    expect(none.filter((c) => c.value === '-').length).toBeGreaterThan(8);
    expect(value(none, 'runs')).toBe('0');
  });
});

describe('batting list', () => {
  const rows = [bat({ match_id: 1, runs: 50, balls: 40, opponent: 'India', venue: 'Lord\'s', date: '2019-07-01' }), bat({ match_id: 2, runs: 50, balls: 40, opponent: 'Pakistan', date: '2021-05-02' }), bat({ match_id: 3, runs: 7, is_out: false })];
  it('ranks ties by the latest match and writes the not out star', () => {
    const list = battingList(rows);
    expect(list.map((r) => r.key)).toEqual(['2:1', '1:1', '3:1']);
    expect(list[2]!.main).toBe('7*');
    expect(list[0]!.rank).toBe(1);
  });
  it('searches opponent, ground, year and score', () => {
    const list = battingList(rows);
    expect(searchRows(list, 'india')).toHaveLength(1);
    expect(searchRows(list, "lord")).toHaveLength(1);
    expect(searchRows(list, '2021')).toHaveLength(1);
    expect(searchRows(list, '7*')).toHaveLength(1);
    expect(searchRows(list, '')).toHaveLength(3);
  });
});

describe('bowling cards', () => {
  const rows = [
    bowl({ match_id: 1, innings: 1, wickets: 3, runs: 20, balls: 24, hat_tricks: 1, maidens: 1, season: '2019', opponent: 'A' }),
    bowl({ match_id: 1, innings: 2, wickets: 4, runs: 30, balls: 24, season: '2019', opponent: 'A', maidens: 0 }),
    bowl({ match_id: 2, wickets: 5, runs: 30, balls: 24, season: '2020', opponent: 'B', maidens: 2 }),
    bowl({ match_id: 3, wickets: 0, runs: 60, balls: 12, season: '2020', opponent: 'B', economy_counts: false }),
  ];
  const cards = bowlingCards(rows);
  it('has 16 cards', () => expect(cards).toHaveLength(16));
  it('finds best figures, best match figures and best against one opponent', () => {
    expect(value(cards, 'best figures')).toBe('5/30');
    expect(value(cards, 'best match figures')).toBe('7/50');
    expect(value(cards, 'best figures against')).toBe('7/50');
  });
  it('counts hauls, wickets and the best season', () => {
    expect(value(cards, 'five-wicket haul')).toBe('1');
    expect(value(cards, 'wickets in the best season')).toBe('7');
    expect(value(cards, 'wickets')).toBe('12');
    expect(value(bowlingCards([bowl({ wickets: 1 })]), 'wicket')).toBe('1');
    expect(value(cards, 'innings with a wicket')).toBe('3');
    expect(value(cards, 'hat-trick')).toBe('1');
  });
  it('leaves a short spell out of the economy and names the length', () => {
    expect(value(cards, 'best economy')).toBe('5.00');
    expect(value(cards, 'worst economy')).toBe('7.50');
    expect(cards.find((c) => c.label.startsWith('best economy'))!.label).toBe('best economy, 4 overs or more');
  });
  it('finds the most maidens and overs, and the strike rate', () => {
    expect(value(cards, 'maidens in one')).toBe('2');
    expect(value(cards, 'overs in the longest')).toBe('4');
    expect(value(cards, 'balls per wicket')).toBe('7.0');
  });
  it('counts a ten-wicket match from both innings', () => {
    const two = [bowl({ match_id: 9, innings: 1, wickets: 5 }), bowl({ match_id: 9, innings: 3, wickets: 5 }), bowl({ match_id: 10, wickets: 9 })];
    expect(value(bowlingCards(two), 'ten-wicket match')).toBe('1');
  });
  it('uses balls, dot balls and economy per 5 balls when every innings is The Hundred', () => {
    const h = bowlingCards([bowl({ tournament_key: 'hnd', balls: 20, runs: 20, dots: 9, wickets: 2 }), bowl({ match_id: 2, tournament_key: 'hnd', balls: 10, runs: 5, dots: 4, wickets: 1 })]);
    expect(value(h, 'balls in the longest')).toBe('20');
    expect(value(h, 'dot balls in one')).toBe('9');
    expect(value(h, 'best economy per 5')).toBe('2.50');
  });
  it('leaves The Hundred out of overs and maidens in a mixed scope', () => {
    const mixed = bowlingCards([bowl({ balls: 24, maidens: 1 }), bowl({ match_id: 2, tournament_key: 'hnd', balls: 20, maidens: 0 })]);
    expect(value(mixed, 'overs in the longest')).toBe('4');
    expect(value(mixed, 'wickets')).toBe('0');
  });
  it('is empty with no innings', () => expect(bowlingCards([]).filter((c) => c.value === '-').length).toBeGreaterThan(6));
});

describe('bowling list', () => {
  it('ranks by wickets then fewest runs, then the latest, and writes The Hundred in balls', () => {
    const list = bowlingList([bowl({ match_id: 1, wickets: 3, runs: 20 }), bowl({ match_id: 2, wickets: 3, runs: 20, date: '2021-01-01' }), bowl({ match_id: 3, wickets: 3, runs: 15, tournament_key: 'hnd', balls: 20 })]);
    expect(list.map((r) => r.key)).toEqual(['3:1', '2:1', '1:1']);
    expect(list[0]!.detail).toBe('20 balls, econ (5) 3.75');
    expect(list[1]!.detail).toBe('4 overs, econ 5.00');
  });
});

describe('overs', () => { it('writes balls the way a scorecard does', () => { expect(oversOf(24)).toBe('4'); expect(oversOf(23)).toBe('3.5'); expect(oversOf(0)).toBe('0'); }); });

describe('record sides', () => {
  const row = (o: Partial<SummaryRow>): SummaryRow => ({ player_id: 'p', format: 'TEST', tournament_key: null, tournament_name: null, season: '2020', gender: 'male', matches: 1, innings: 1, runs: 0, balls_faced: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0, ducks: 0, dismissals: 0, high_score: 0, bowling_matches: 1, balls_bowled: 0, runs_conceded: 0, wickets: 0, dot_balls: 0, ...o });
  it('is a batter with 1,000 runs at 20, a bowler with 50 wickets, both when both', () => {
    expect(recordSides([row({ runs: 3000, dismissals: 100 })])).toEqual({ bat: true, bowl: false });
    expect(recordSides([row({ runs: 300, dismissals: 100, wickets: 80 })])).toEqual({ bat: false, bowl: true });
    expect(recordSides([row({ runs: 3000, dismissals: 100, wickets: 80 })])).toEqual({ bat: true, bowl: true });
  });
  it('shows a player who is neither as a batter', () => expect(recordSides([row({ runs: 200, dismissals: 20, wickets: 10 })])).toEqual({ bat: true, bowl: false }));
  it('does not count a high total at a low average', () => expect(recordSides([row({ runs: 1500, dismissals: 100 })])).toEqual({ bat: true, bowl: false }));
});
