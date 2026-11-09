import { describe, expect, it } from 'vitest';
import type { SummaryRow } from '../batting';
import { battingLines, bestOf, bowlingLines, figuresText, highScoreOf, type BatInnings, type BowlInnings } from '../career';

const row = (over: Partial<SummaryRow>): SummaryRow => ({
  player_id: 'p', format: 'TEST', tournament_key: null, tournament_name: null, season: '2020', gender: 'male', matches: 10, innings: 10, runs: 300, balls_faced: 600, fours: 30, sixes: 2,
  fifties: 2, hundreds: 1, ducks: 0, dismissals: 9, high_score: 120, bowling_matches: 10, balls_bowled: 120, runs_conceded: 90, wickets: 6, dot_balls: null, ...over,
});
const scope = (format: string, league = false, key: string | null = null) => ({ format, league, key });

describe('high score', () => {
  it('puts a star on a not out innings and prefers it on a tie', () => {
    expect(highScoreOf([{ runs: 120, out: true }, { runs: 254, out: false }, { runs: 100, out: true }])).toBe('254*');
    expect(highScoreOf([{ runs: 100, out: true }, { runs: 100, out: false }])).toBe('100*');
    expect(highScoreOf([{ runs: 50, out: true }])).toBe('50');
    expect(highScoreOf([])).toBe('-');
  });
});

describe('batting lines', () => {
  const rows = [row({}), row({ format: 'ODI', high_score: 80 })];
  const bat: BatInnings[] = [{ ...scope('TEST'), runs: 120, out: false }, { ...scope('TEST'), runs: 90, out: true }, { ...scope('ODI'), runs: 80, out: true }];
  const field = [{ ...scope('TEST'), catches: 7, stumpings: 0 }, { ...scope('ODI'), catches: 3, stumpings: 1 }];
  const lines = battingLines(rows, bat, field);
  it('lists International first, adds fielding, and takes the high score from the innings', () => {
    expect(lines.map((l) => l.label)).toEqual(['International', 'Tests', 'ODIs']);
    expect(lines[0]).toMatchObject({ catches: 10, stumpings: 1, highScore: '120*', runs: 600 });
    expect(lines[1]).toMatchObject({ catches: 7, highScore: '120*' });
    expect(lines[2]).toMatchObject({ highScore: '80', stumpings: 1 });
  });
});

describe('bowling lines', () => {
  const rows = [row({ balls_bowled: 120, runs_conceded: 90, wickets: 7 })];
  const bowl: BowlInnings[] = [
    { ...scope('TEST'), matchId: 1, wickets: 5, runs: 30, wides: 1, noBalls: 2 },
    { ...scope('TEST'), matchId: 1, wickets: 5, runs: 40, wides: 0, noBalls: 0 },
    { ...scope('TEST'), matchId: 2, wickets: 4, runs: 20, wides: 2, noBalls: 1 },
    { ...scope('TEST'), matchId: 3, wickets: 0, runs: 15, wides: 0, noBalls: 0 },
  ];
  const [line] = bowlingLines(rows, bowl);
  it('finds the best innings and the best match, and the hauls', () => {
    expect(figuresText(line?.bestInnings ?? null)).toBe('5/30');
    expect(figuresText(line?.bestMatch ?? null)).toBe('10/70');
    expect(line).toMatchObject({ innings: 4, fourWickets: 1, fiveWickets: 2, tenWickets: 1, wides: 3, noBalls: 3 });
  });
  it('works the rates out from the totals', () => {
    expect(line?.economy).toBeCloseTo(4.5);
    expect(line?.average).toBeCloseTo(90 / 7);
    expect(line?.strikeRate).toBeCloseTo(120 / 7);
  });
  it('skips a group the player never bowled in, and uses five-ball overs for The Hundred', () => {
    expect(bowlingLines([row({ balls_bowled: null, wickets: null })], [])).toEqual([]);
    const hundred = row({ format: 'T20', tournament_key: 'hnd', tournament_name: 'The Hundred', filter_section: 'Leagues', balls_bowled: 100, runs_conceded: 120, wickets: 5 });
    const [h] = bowlingLines([hundred], []);
    expect(h?.hundred).toBe(true);
    expect(h?.economy).toBeCloseTo(6);
  });
});

describe('best figures', () => {
  it('prefers more wickets then fewer runs, and ignores no wicket', () => {
    expect(bestOf([{ wickets: 3, runs: 10 }, { wickets: 3, runs: 8 }, { wickets: 2, runs: 1 }])).toEqual({ wickets: 3, runs: 8 });
    expect(bestOf([{ wickets: 0, runs: 5 }])).toBeNull();
  });
});
