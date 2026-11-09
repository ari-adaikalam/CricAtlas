import { describe, expect, it } from 'vitest';
import { directionsByInnings, duelDismissals, duelPhase, duelTotals, duelYears, type DuelInnings } from '../compareDuel';

const d = (o: Partial<DuelInnings>): DuelInnings => ({ dir: 'ab', matchId: 1, innings: 1, date: '2020-01-01', format: 'ODI', tournament_key: null, balls: 10, runs: 12, fours: 1, sixes: 0, dismissal: null, phases: { powerplay: { balls: 10, runs: 12 } }, ...o });

describe('duel totals', () => {
  const xs = [d({ balls: 20, runs: 30, dismissal: 'bowled' }), d({ matchId: 2, balls: 10, runs: 40, dismissal: null, sixes: 3 }), d({ matchId: 3, balls: 6, runs: 2, dismissal: 'caught' })];
  const t = duelTotals(xs);
  it('adds balls, runs and dismissals and works out the rates', () => {
    expect(t).toMatchObject({ innings: 3, balls: 36, runs: 72, outs: 2, sixes: 3 });
    expect(t.strikeRate).toBeCloseTo(200);
    expect(t.average).toBe(36);
    expect(t.ballsPerWicket).toBe(18);
    expect(t.economy).toBeCloseTo(12);
  });
  it('takes the highest score, a not out ahead of an out on the same runs, and the bowler\'s best innings', () => {
    expect(t.highScore).toBe(40);
    expect(t.highScoreNotOut).toBe(true);
    expect(t.best).toEqual({ w: 1, r: 2 });
    expect(duelTotals([d({ runs: 50, dismissal: 'lbw' }), d({ matchId: 2, runs: 50 })]).highScoreNotOut).toBe(true);
  });
  it('counts economy per 5 balls in The Hundred and has no numbers for no balls', () => {
    expect(duelTotals(xs, true).economy).toBeCloseTo(10);
    expect(duelTotals([]).strikeRate).toBeNull();
  });
});

describe('duel splits', () => {
  it('shows the direction with more innings first', () => {
    expect(directionsByInnings([d({ dir: 'ba' }), d({ dir: 'ba', matchId: 2 }), d({ dir: 'ab', matchId: 3 })])).toEqual(['ba', 'ab']);
    expect(directionsByInnings([])).toEqual(['ab', 'ba']);
  });
  it('counts dismissals by type in the player page\'s order', () => {
    const shares = duelDismissals([d({ dismissal: 'caught' }), d({ dismissal: 'caught and bowled', matchId: 2 }), d({ dismissal: 'bowled', matchId: 3 }), d({ matchId: 4 })]);
    expect(shares.map((s) => [s.label, s.wickets])).toEqual([['Caught', 2], ['Bowled', 1], ['LBW', 0], ['Stumped', 0], ['Other', 0]]);
  });
  it('gives a strike rate for a year only when there was a ball in it', () => {
    expect(duelYears([d({ date: '2019-05-01', balls: 10, runs: 5 })], [2019, 2020])).toEqual([50, null]);
  });
  it('works out a phase from the balls in it', () => {
    const p = duelPhase([d({ phases: { death: { balls: 12, runs: 24 } } }), d({ matchId: 2, phases: { death: { balls: 6, runs: 6 } } })], 'death');
    expect(p.balls).toBe(18);
    expect(p.strikeRate).toBeCloseTo(166.67, 1);
    expect(p.economy).toBeCloseTo(10);
    expect(duelPhase([], 'death').strikeRate).toBeNull();
  });
});
