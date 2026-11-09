import { describe, expect, it } from 'vitest';
import type { BatterCard, BowlerCard, InningsCard, MatchBundle } from '../match';
import { roundName, roundResult, superBatters, superBowling, superOvers, superRounds, superTitle } from '../superOver';

const bowler = (name: string, balls: number, runs: number, wkts: number): BowlerCard => ({ id: null, name, balls, maidens: 0, runs, wkts, dots: 0, wd: 0, nb: 0 });
const bat = (name: string, runs: number, balls: number, out: BatterCard['out'] = null): BatterCard => ({ id: null, name, runs, balls, fours: 0, sixes: 0, out });
const inn = (n: number, team: string, runs: number, wkts: number, extra: Partial<InningsCard> = {}): InningsCard => ({
  n, team, teamId: team, runs, wkts, balls: 6, deliveries: 6, overs: '1.0', super: n > 2, declared: false, extras: { wd: 0, nb: 0, b: 0, lb: 0, pen: 0 }, targetRuns: null, targetOvers: null, penaltyPre: 0, penaltyPost: 0,
  batters: [], bowlers: [], didNotBat: [], ...extra,
});
const match = (innings: InningsCard[], kind = 't20'): MatchBundle => ({ match: { kind, ballsPerOver: 6 }, innings } as unknown as MatchBundle);

describe('super over rounds', () => {
  const two = match([inn(1, 'A', 150, 5), inn(2, 'B', 150, 6), inn(3, 'B', 12, 1), inn(4, 'A', 13, 0)]);
  const three = match([inn(1, 'A', 150, 5), inn(2, 'B', 150, 6), inn(3, 'B', 19, 1), inn(4, 'A', 19, 0), inn(5, 'A', 17, 1), inn(6, 'B', 17, 0)]);
  it('pairs the Super Over innings into rounds in the order they were batted', () => {
    expect(superRounds(two).map((r) => [r.n, r.first.team, r.second?.team])).toEqual([[1, 'B', 'A']]);
    expect(superRounds(three).map((r) => [r.n, r.first.team, r.second?.team])).toEqual([[1, 'B', 'A'], [2, 'A', 'B']]);
    expect(superRounds(match([inn(1, 'A', 1, 1), inn(2, 'B', 1, 1)]))).toEqual([]);
  });
  it('names a round only when there are several', () => {
    expect(roundName(superRounds(two), 0)).toBe('Super Over');
    expect(roundName(superRounds(three), 1)).toBe('Super Over 2');
  });
  it('says what a round decided, and when it was tied', () => {
    expect(roundResult(superRounds(two), 0)).toBe('B scored 12, A needed 13 and made 13. A won the Super Over by 1 run.');
    expect(roundResult(superRounds(three), 0)).toBe('Both teams scored 19. The Super Over was tied and another was played.');
    expect(roundResult(superRounds(three), 1)).toBe('Both teams scored 17. The Super Over was tied.');
    const short = match([inn(1, 'A', 1, 1), inn(2, 'B', 1, 1), inn(3, 'B', 12, 1), inn(4, 'A', 8, 2)]);
    expect(roundResult(superRounds(short), 0)).toBe('B scored 12, A needed 13 and made 8. B won the Super Over by 4 runs.');
  });
});

describe('super over card wording', () => {
  it('writes the title with the overs, or the balls of a side bowled out early or in The Hundred', () => {
    const b = match([inn(3, 'B', 12, 1)]);
    expect(superTitle(b, b.innings[0]!)).toBe('B batting, 12/1 (1.0 overs)');
    const early = inn(4, 'A', 0, 2, { overs: '0.4', balls: 4 });
    expect(superOvers(match([early]), early)).toBe('0.4 overs');
    expect(superOvers(match([early], 'hundred'), early)).toBe('4 balls');
  });
  it('lists the batters with scorecard wording and the bowlers on one line', () => {
    const i = inn(3, 'B', 12, 1, { batters: [bat('P', 1, 1, { type: 'run out', bowler: null, bowlerId: null, fielders: ['F'], delivery: 1, wicketNumber: 1, over: 0, ball: 1, ballText: '0.1' }), bat('Q', 11, 5)], bowlers: [bowler('Bowl X', 6, 12, 0)] });
    const b = match([i]);
    expect(superBatters(i).map((x) => [x.name, x.how, x.runs, x.balls])).toEqual([['P', 'run out (F)', 1, 1], ['Q', 'not out', 11, 5]]);
    expect(superBowling(b, i)).toBe('Bowl X 1.0-0-12-0');
    expect(superBowling(match([i], 'hundred'), i)).toBe('Bowl X, 6 balls, 12 runs, 0 wickets');
  });
});
