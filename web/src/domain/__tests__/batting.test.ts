import { describe, expect, it } from 'vitest';
import { battingTotals, type SummaryRow } from '../batting';

const row = (over: Partial<SummaryRow>): SummaryRow => ({
  player_id: 'aaaaaaaa', format: 'T20', tournament_key: null, tournament_name: null, season: '2024', gender: 'male',
  matches: 0, innings: 0, runs: 0, balls_faced: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0, ducks: 0, dismissals: 0, high_score: 0,
  bowling_matches: null, balls_bowled: null, runs_conceded: null, wickets: null, dot_balls: null, ...over,
});

describe('battingTotals', () => {
  it('adds counts and computes rates from the totals, never by averaging rates', () => {
    const t = battingTotals([
      row({ innings: 2, runs: 100, balls_faced: 50, dismissals: 1, high_score: 80 }),
      row({ innings: 3, runs: 50, balls_faced: 100, dismissals: 3, high_score: 30 }),
    ]);
    expect(t.runs).toBe(150);
    expect(t.strikeRate).toBe(100);
    expect(t.average).toBe(37.5);
    expect(t.highScore).toBe(80);
    expect(t.notOuts).toBe(1);
  });
  it('gives no rate where there is nothing to divide by', () => {
    const t = battingTotals([row({ innings: 1, runs: 10, balls_faced: 0, dismissals: 0 })]);
    expect(t.strikeRate).toBeNull();
    expect(t.average).toBeNull();
  });
  it('treats a bowler-only row as no batting', () => {
    const t = battingTotals([row({ matches: null, innings: null, runs: null, balls_faced: null, dismissals: null, high_score: null })]);
    expect(t.runs).toBe(0);
    expect(t.innings).toBe(0);
  });
});

import { sliceRates } from '../batting';

describe('slice rates', () => {
  it('works rates out from the counts and leaves a missing base empty', () => {
    const r = sliceRates({ balls: 200, runs: 150, dismissals: 3, fours: 10, sixes: 5, dots: 100, controlled: 80, labelled: 100 });
    expect(r.average).toBe(50);
    expect(r.strikeRate).toBe(75);
    expect(r.dotShare).toBe(50);
    expect(r.boundaryShare).toBe(8);
    expect(r.controlShare).toBe(80);
    const none = sliceRates({ balls: 0, runs: 0, dismissals: 0, fours: 0, sixes: 0, dots: 0, controlled: 0, labelled: 0 });
    expect(none.average).toBeNull();
    expect(none.controlShare).toBeNull();
  });
});

describe('matches played', () => {
  it('adds up the matches played, not the matches batted in', () => {
    const rows = [row({ matches: 3, appearances: 5 }), row({ matches: 2, appearances: 2, season: '2021' })];
    expect(battingTotals(rows).matches).toBe(7);
  });
  it('has a row with only matches played (in the XI without batting or bowling) count as played', () => {
    expect(battingTotals([row({ matches: null, innings: null, runs: null, appearances: 4 })]).matches).toBe(4);
  });
});
