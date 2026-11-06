// The Form tile: a rolling average and strike rate over the latest innings, oldest on the left. The window is 15 innings (Ari, 2026-10-18).
// It counts fewer innings at the start, so the line has a point for every innings shown.

export const FORM_WINDOW = 15;
export const FORM_INNINGS = 30;
/** Fewer innings than this and the tile says there are too few to show form. */
export const FORM_MINIMUM = 5;

export interface InningsLine {
  matchId: number;
  innings: number;
  runs: number;
  balls: number;
  out: boolean;
  date: string;
  opponent: string;
}

export interface FormPoint {
  /** Runs per dismissal over the window, or null when no one was out in it. */
  average: number | null;
  /** Runs per 100 balls over the window. */
  strikeRate: number | null;
  /** How many innings the window holds (fewer than the window at the start). */
  window: number;
}

/** One point per innings, from the window ending at it. Rates come from the window's own totals, never from averaging innings. */
export function rollingForm(innings: readonly InningsLine[], window = FORM_WINDOW): FormPoint[] {
  return innings.map((_, i) => {
    const slice = innings.slice(Math.max(0, i - window + 1), i + 1);
    const runs = slice.reduce((a, x) => a + x.runs, 0);
    const balls = slice.reduce((a, x) => a + x.balls, 0);
    const outs = slice.reduce((a, x) => a + (x.out ? 1 : 0), 0);
    return { average: outs > 0 ? runs / outs : null, strikeRate: balls > 0 ? (runs / balls) * 100 : null, window: slice.length };
  });
}

/** One innings of a bowler: the legal balls bowled in it, the runs charged to the bowler and the wickets taken, under the filters. */
export interface BowlInningsLine {
  matchId: number;
  innings: number;
  runs: number;
  balls: number;
  wickets: number;
  date: string;
  opponent: string;
}

export interface BowlFormPoint {
  /** Runs conceded per wicket over the window, or null when there was no wicket in it. */
  average: number | null;
  /** Runs conceded per over over the window: per six balls, or per five in The Hundred. */
  economy: number | null;
  window: number;
}

/** One point per innings, from the window ending at it, worked out from the window's own totals like the batting form. */
export function rollingBowlForm(innings: readonly BowlInningsLine[], ballsPerOver = 6, window = FORM_WINDOW): BowlFormPoint[] {
  return innings.map((_, i) => {
    const slice = innings.slice(Math.max(0, i - window + 1), i + 1);
    const runs = slice.reduce((a, x) => a + x.runs, 0);
    const balls = slice.reduce((a, x) => a + x.balls, 0);
    const wickets = slice.reduce((a, x) => a + x.wickets, 0);
    return { average: wickets > 0 ? runs / wickets : null, economy: balls > 0 ? (runs / balls) * ballsPerOver : null, window: slice.length };
  });
}
