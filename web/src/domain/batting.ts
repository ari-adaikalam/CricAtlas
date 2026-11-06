/** One row of player_summary.parquet: a player in one format, competition and season. Batting and bowling columns are empty when the player did not bat or bowl. */
export interface SummaryRow {
  player_id: string;
  format: string;
  tournament_key: string | null;
  tournament_name: string | null;
  /** The tournament list's section, such as Leagues. Empty for an international bilateral match. */
  filter_section?: string | null;
  season: string;
  gender: string;
  /** Matches the player batted in. Mat everywhere reads `appearances` instead. */
  matches: number | null;
  /** Matches played: those in the playing XI of (match_people), for this format, competition and season (2026-10-25). */
  appearances?: number | null;
  innings: number | null;
  runs: number | null;
  balls_faced: number | null;
  fours: number | null;
  sixes: number | null;
  fifties: number | null;
  hundreds: number | null;
  ducks: number | null;
  dismissals: number | null;
  high_score: number | null;
  bowling_matches: number | null;
  balls_bowled: number | null;
  runs_conceded: number | null;
  wickets: number | null;
  dot_balls: number | null;
}

export interface BattingTotals {
  matches: number;
  innings: number;
  notOuts: number;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  ducks: number;
  dismissals: number;
  highScore: number;
  /** Runs per 100 balls, or null with no balls faced. */
  strikeRate: number | null;
  /** Runs per dismissal, or null with no dismissals. */
  average: number | null;
}

const n = (value: number | null | undefined): number => value ?? 0;

/** Adds up summary rows. Counts add across any rows, rates are computed from the totals and never averaged. */
export function battingTotals(rows: readonly SummaryRow[]): BattingTotals {
  let matches = 0, innings = 0, runs = 0, ballsFaced = 0, fours = 0, sixes = 0, fifties = 0, hundreds = 0, ducks = 0, dismissals = 0, highScore = 0;
  for (const r of rows) {
    matches += n(r.appearances); innings += n(r.innings); runs += n(r.runs); ballsFaced += n(r.balls_faced);
    fours += n(r.fours); sixes += n(r.sixes); fifties += n(r.fifties); hundreds += n(r.hundreds);
    ducks += n(r.ducks); dismissals += n(r.dismissals); highScore = Math.max(highScore, n(r.high_score));
  }
  return {
    matches, innings, notOuts: Math.max(0, innings - dismissals), runs, ballsFaced, fours, sixes, fifties, hundreds, ducks, dismissals, highScore,
    strikeRate: ballsFaced > 0 ? (runs / ballsFaced) * 100 : null,
    average: dismissals > 0 ? runs / dismissals : null,
  };
}

/** What Key numbers shows, from the counts of a filtered slice. A rate is worked out from totals, and is null when it has no base. */
export interface SliceRates {
  average: number | null;
  strikeRate: number | null;
  dotShare: number | null;
  boundaryShare: number | null;
  controlShare: number | null;
}

export function sliceRates(s: { balls: number; runs: number; dismissals: number; fours: number; sixes: number; dots: number; controlled: number; labelled: number }): SliceRates {
  const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((100 * part) / whole) : null);
  return {
    average: s.dismissals > 0 ? s.runs / s.dismissals : null,
    strikeRate: s.balls > 0 ? (s.runs / s.balls) * 100 : null,
    dotShare: pct(s.dots, s.balls),
    boundaryShare: pct(s.fours + s.sixes, s.balls),
    controlShare: pct(s.controlled, s.labelled),
  };
}
