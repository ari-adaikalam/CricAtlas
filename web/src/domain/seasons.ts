// The By season tile: runs in each calendar year (bars) and the strike rate of that year (line), for the filtered balls.

export interface YearCounts { year: number; runs: number; balls: number; innings: number; dismissals: number }

export interface YearStats extends YearCounts {
  /** Runs per 100 balls, or null in a year with no balls. */
  strikeRate: number | null;
  /** Runs per dismissal, or null with no dismissal that year. */
  average: number | null;
}

/**
 * One entry for every year from the first to the last, so a year the player did not bat shows as a gap and the bars keep an even rhythm.
 * Rates come from the year's own counts.
 */
export function seasonStats(rows: readonly YearCounts[]): YearStats[] {
  if (rows.length === 0) return [];
  const byYear = new Map(rows.map((r) => [r.year, r]));
  const first = Math.min(...rows.map((r) => r.year)), last = Math.max(...rows.map((r) => r.year));
  const out: YearStats[] = [];
  for (let year = first; year <= last; year++) {
    const r = byYear.get(year) ?? { year, runs: 0, balls: 0, innings: 0, dismissals: 0 };
    out.push({ ...r, strikeRate: r.balls > 0 ? (r.runs / r.balls) * 100 : null, average: r.dismissals > 0 ? r.runs / r.dismissals : null });
  }
  return out;
}

/** The top of a bar axis with three equal steps of a round size (1, 2, 2.5, 5 times a power of ten), at or above the largest value. */
export function niceAxis(max: number): { step: number; top: number } {
  if (!(max > 0)) return { step: 1, top: 3 };
  const raw = max / 3;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
  return { step, top: step * 3 };
}

/** Axis labels like '23, two digits with an apostrophe, as the mockup writes them. */
export const shortYear = (year: number): string => `'${String(year).slice(2)}`;

// The bowling By season tile: wickets in each calendar year (bars) and the economy of that year (line).

export interface BowlYearCounts { year: number; wickets: number; conceded: number; balls: number; innings: number }

export interface BowlYearStats extends BowlYearCounts {
  /** Runs conceded per over, or null in a year with no balls. Per five balls in The Hundred. */
  economy: number | null;
  /** Runs conceded per wicket, or null with no wicket that year. */
  average: number | null;
}

/** One entry for every year from the first to the last, so a year the bowler did not bowl shows as a gap. Rates come from the year's own counts. */
export function bowlSeasonStats(rows: readonly BowlYearCounts[], ballsPerOver = 6): BowlYearStats[] {
  if (rows.length === 0) return [];
  const byYear = new Map(rows.map((r) => [r.year, r]));
  const first = Math.min(...rows.map((r) => r.year)), last = Math.max(...rows.map((r) => r.year));
  const out: BowlYearStats[] = [];
  for (let year = first; year <= last; year++) {
    const r = byYear.get(year) ?? { year, wickets: 0, conceded: 0, balls: 0, innings: 0 };
    out.push({ ...r, economy: r.balls > 0 ? (r.conceded / r.balls) * ballsPerOver : null, average: r.wickets > 0 ? r.conceded / r.wickets : null });
  }
  return out;
}
