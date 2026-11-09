import { battingTotals, type SummaryRow } from './batting';
import { careerGroups, HUNDRED_KEY, type CareerGroup, type Scope } from './profile';

// The profile tables: Batting and fielding (Mat to 6s, then Ct and St) and Bowling (Mat to NB). Counts that the player summary already holds come from it,
// and what it cannot hold (a high score is not out or out, the best figures, catches) comes from the per-innings rows below.

export interface BatInnings extends Scope { runs: number; out: boolean }
export interface FieldCount extends Scope { catches: number; stumpings: number }
export interface BowlInnings extends Scope { matchId: number; wickets: number; runs: number; wides: number; noBalls: number }

export interface BattingLine {
  label: string;
  matches: number; innings: number; notOuts: number; runs: number;
  /** The highest innings, with a star when the batter was not out in it. */
  highScore: string;
  average: number | null; ballsFaced: number; strikeRate: number | null;
  hundreds: number; fifties: number; fours: number; sixes: number;
  catches: number; stumpings: number;
}

export interface Figures { wickets: number; runs: number }
export interface BowlingLine {
  label: string;
  matches: number; innings: number; balls: number; runs: number; wickets: number;
  bestInnings: Figures | null; bestMatch: Figures | null;
  average: number | null;
  economy: number | null;
  strikeRate: number | null;
  /** Four wickets exactly, five or more, and ten or more in a match. */
  fourWickets: number; fiveWickets: number; tenWickets: number;
  wides: number; noBalls: number;
  /** The row is The Hundred alone, so its economy is runs per five-ball over. */
  hundred: boolean;
}

const sum = <T,>(items: readonly T[], pick: (t: T) => number): number => items.reduce((a, t) => a + pick(t), 0);

/** The highest score, taking a not out innings over an out one on a tie. */
export function highScoreOf(innings: readonly Pick<BatInnings, 'runs' | 'out'>[]): string {
  let best: Pick<BatInnings, 'runs' | 'out'> | null = null;
  for (const i of innings) if (!best || i.runs > best.runs || (i.runs === best.runs && best.out && !i.out)) best = i;
  return best ? `${best.runs}${best.out ? '' : '*'}` : '-';
}

/** The better of two figures: more wickets, then fewer runs. */
export const betterFigures = (a: Figures | null, b: Figures): Figures => (!a || b.wickets > a.wickets || (b.wickets === a.wickets && b.runs < a.runs) ? b : a);

export function bestOf(items: readonly Figures[]): Figures | null {
  let best: Figures | null = null;
  for (const i of items) if (i.wickets > 0) best = betterFigures(best, i);
  return best;
}

export function battingLines(rows: readonly SummaryRow[], bat: readonly BatInnings[], field: readonly FieldCount[]): BattingLine[] {
  return careerGroups(rows).map((g: CareerGroup) => {
    const t = battingTotals(g.rows);
    const mine = bat.filter(g.includes), fielded = field.filter(g.includes);
    return {
      label: g.label, matches: t.matches, innings: t.innings, notOuts: t.notOuts, runs: t.runs, highScore: mine.length ? highScoreOf(mine) : String(t.highScore),
      average: t.average, ballsFaced: t.ballsFaced, strikeRate: t.strikeRate, hundreds: t.hundreds, fifties: t.fifties, fours: t.fours, sixes: t.sixes,
      catches: sum(fielded, (f) => f.catches), stumpings: sum(fielded, (f) => f.stumpings),
    };
  });
}

/** Bowling rows for the groups in which the player bowled a ball. A match's figures add up the player's innings in it. */
export function bowlingLines(rows: readonly SummaryRow[], bowl: readonly BowlInnings[]): BowlingLine[] {
  const lines: BowlingLine[] = [];
  for (const g of careerGroups(rows)) {
    const balls = sum(g.rows, (r) => r.balls_bowled ?? 0);
    if (balls === 0) continue;
    const mine = bowl.filter(g.includes);
    const wickets = sum(g.rows, (r) => r.wickets ?? 0), runs = sum(g.rows, (r) => r.runs_conceded ?? 0);
    const matches = new Map<number, Figures>();
    for (const i of mine) { const m = matches.get(i.matchId) ?? { wickets: 0, runs: 0 }; matches.set(i.matchId, { wickets: m.wickets + i.wickets, runs: m.runs + i.runs }); }
    const hundred = g.rows.length > 0 && g.rows.every((r) => r.tournament_key === HUNDRED_KEY);
    lines.push({
      label: g.label, matches: sum(g.rows, (r) => r.appearances ?? 0), innings: mine.length, balls, runs, wickets,
      bestInnings: bestOf(mine), bestMatch: bestOf([...matches.values()]),
      average: wickets > 0 ? runs / wickets : null,
      economy: (runs / balls) * (hundred ? 5 : 6),
      strikeRate: wickets > 0 ? balls / wickets : null,
      fourWickets: mine.filter((i) => i.wickets === 4).length, fiveWickets: mine.filter((i) => i.wickets >= 5).length,
      tenWickets: [...matches.values()].filter((m) => m.wickets >= 10).length,
      wides: sum(mine, (i) => i.wides), noBalls: sum(mine, (i) => i.noBalls), hundred,
    });
  }
  return lines;
}

export const figuresText = (f: Figures | null): string => (f ? `${f.wickets}/${f.runs}` : '-');
