// The bowling Reviews tile: the DRS reviews on the bowler's deliveries. What the data's `decision` means was checked against the balls (2026-10-18, Ari chose to
// verify it): it is the verdict on the review, not on the original decision. A review by the batting side that is `upheld` has a ball with no wicket (the batter won, the
// out was overturned) and one that is `struck down` has a wicket on the ball (the review lost, the out stands). A review by the bowling side is the other way round: `upheld`
// has a wicket on the ball (the not out was overturned) and `struck down` has none. `umpires_call` is only ever set on a struck down review (the review lost on the umpire's call).

/** Reviews on a bowler's deliveries, grouped. `side` is who asked, from the ball: the bowling team (the bowler's side) or the batting team. */
export interface ReviewGroup { side: 'bowling' | 'batting'; decision: string; umpiresCall: boolean; wicket: boolean; n: number }

export interface ReviewRow {
  side: 'bowling' | 'batting';
  total: number;
  /** Lost on the umpire's call. */
  umpiresCall: number;
  /** Lost, not on the umpire's call. */
  struckDown: number;
  /** Won: the on-field decision was overturned. */
  upheld: number;
}

export interface ReviewSummary {
  rows: [ReviewRow, ReviewRow];
  /** Wickets that exist because the bowler's side won a review of a not out. */
  wicketsGiven: number;
  /** Wickets the bowler kept because the batter's review of an out was lost. */
  wicketsKept: number;
  /** Reviews with a decision that is neither (a technical failure), not counted above. */
  other: number;
}

export function summariseReviews(groups: readonly ReviewGroup[]): ReviewSummary {
  const row = (side: 'bowling' | 'batting'): ReviewRow => {
    const mine = groups.filter((g) => g.side === side);
    const sum = (pick: (g: ReviewGroup) => boolean): number => mine.filter(pick).reduce((a, g) => a + g.n, 0);
    const umpiresCall = sum((g) => g.decision === 'struck down' && g.umpiresCall);
    const struckDown = sum((g) => g.decision === 'struck down' && !g.umpiresCall);
    const upheld = sum((g) => g.decision === 'upheld');
    return { side, total: umpiresCall + struckDown + upheld, umpiresCall, struckDown, upheld };
  };
  const total = (pick: (g: ReviewGroup) => boolean): number => groups.filter(pick).reduce((a, g) => a + g.n, 0);
  return {
    rows: [row('bowling'), row('batting')],
    wicketsGiven: total((g) => g.side === 'bowling' && g.decision === 'upheld' && g.wicket),
    wicketsKept: total((g) => g.side === 'batting' && g.decision === 'struck down' && g.wicket),
    other: total((g) => g.decision !== 'upheld' && g.decision !== 'struck down'),
  };
}
