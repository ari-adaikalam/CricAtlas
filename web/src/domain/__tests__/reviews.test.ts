import { describe, expect, it } from 'vitest';
import { summariseReviews, type ReviewGroup } from '../reviews';

const g = (side: ReviewGroup['side'], decision: string, umpiresCall: boolean, wicket: boolean, n: number): ReviewGroup => ({ side, decision, umpiresCall, wicket, n });

describe('reviews', () => {
  const groups = [
    g('bowling', 'struck down', false, false, 20), g('bowling', 'struck down', true, false, 3), g('bowling', 'upheld', false, true, 10),
    g('batting', 'struck down', false, true, 15), g('batting', 'struck down', true, true, 12), g('batting', 'upheld', false, false, 3),
    g('bowling', 'technical failure', false, false, 1),
  ];
  it('splits each side into struck down, upheld and umpire call', () => {
    const s = summariseReviews(groups);
    expect(s.rows[0]).toMatchObject({ side: 'bowling', total: 33, struckDown: 20, upheld: 10, umpiresCall: 3 });
    expect(s.rows[1]).toMatchObject({ side: 'batting', total: 30, struckDown: 15, upheld: 3, umpiresCall: 12 });
  });
  it('counts the wickets given and kept on review and sets aside other decisions', () => {
    const s = summariseReviews(groups);
    expect(s.wicketsGiven).toBe(10);
    expect(s.wicketsKept).toBe(27);
    expect(s.other).toBe(1);
  });
  it('gives a batter the dismissals a review overturned (their side upheld) and the ones the fielding side won', () => {
    const s = summariseReviews(groups);
    expect(s.rows[1].upheld).toBe(3);
    expect(s.wicketsGiven).toBe(10);
  });
  it('is empty with no reviews', () => expect(summariseReviews([]).rows[0].total).toBe(0));
});
