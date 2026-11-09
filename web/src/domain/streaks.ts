import type { BatInnings, BowlInnings } from './records';

// Records: Streaks. A streak is a run of consecutive items (innings, spells or matches, in date order) that all meet one condition. Everything is worked out in the browser from
// the innings tables and the player's match list, so the cards follow the Format, Competition and Season choices.

/** One match the player was in: the result for the player's team, and whether the award went to the player. 'other' is a tie, a no result or a draw, which counts as neither a win nor a loss. */
export interface PlayerMatch { match_id: number; date: string; result: 'won' | 'lost' | 'other'; potm: boolean }

export interface Run { len: number; from: string; to: string }

export interface StreakCard {
  label: string;
  /** The longest run, or null when the condition never held. */
  best: Run | null;
  /** The five longest, longest first (a tie goes to the later one). */
  top: Run[];
  /** Said when the condition never held, so an empty card explains itself. */
  why: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2019-03-07 as "Mar 2019". */
export function monthOf(date: string): string {
  const month = Number(date.slice(5, 7));
  return `${MONTHS[month - 1] ?? ''} ${date.slice(0, 4)}`.trim();
}

/** The runs of consecutive true flags, in order, with the dates of their first and last item. */
export function runsOf(flags: readonly boolean[], dates: readonly string[]): Run[] {
  const out: Run[] = [];
  let i = 0;
  while (i < flags.length) {
    if (!flags[i]) { i += 1; continue; }
    let j = i;
    while (j + 1 < flags.length && flags[j + 1]) j += 1;
    out.push({ len: j - i + 1, from: dates[i] ?? '', to: dates[j] ?? '' });
    i = j + 1;
  }
  return out;
}

/** The five longest runs, longest first, and for equal lengths the one that ended later. */
export function longest(runs: readonly Run[]): Run[] {
  return [...runs].sort((a, b) => b.len - a.len || b.to.localeCompare(a.to)).slice(0, 5);
}

interface Item { date: string }
const inOrder = <T extends Item & { match_id: number }>(rows: readonly T[], innings?: (r: T) => number): T[] =>
  [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.match_id - b.match_id || (innings ? innings(a) - innings(b) : 0));

function card(label: string, items: ReadonlyArray<{ date: string }>, holds: (index: number) => boolean, why: string): StreakCard {
  const runs = runsOf(items.map((_, i) => holds(i)), items.map((x) => x.date));
  const top = longest(runs);
  return { label, best: top[0] ?? null, top, why };
}

/** The economy a spell must beat to count for the streak: runs an over in Tests, ODIs and T20, and runs per 5 balls in The Hundred. */
export function economyLimit(row: Pick<BowlInnings, 'format' | 'tournament_key'>): { limit: number; perBalls: 5 | 6 } {
  if (row.tournament_key === 'hnd') return { limit: 5.4, perBalls: 5 };
  if (row.format === 'TEST') return { limit: 2.6, perBalls: 6 };
  if (row.format === 'ODI') return { limit: 4.8, perBalls: 6 };
  return { limit: 6.5, perBalls: 6 };
}

/** A spell's economy against its limit, in the units of its format. */
export const underLimit = (row: Pick<BowlInnings, 'format' | 'tournament_key' | 'balls' | 'runs'>): boolean => {
  const { limit, perBalls } = economyLimit(row);
  return row.balls > 0 && (row.runs / row.balls) * perBalls < limit;
};

/** The wording of the economy card for the spells in the scope: one limit when they share it, a plain name when formats are mixed. */
export function economyLabel(spells: ReadonlyArray<Pick<BowlInnings, 'format' | 'tournament_key'>>): string {
  const limits = new Set(spells.map((s) => { const e = economyLimit(s); return `${e.limit}|${e.perBalls}`; }));
  if (limits.size !== 1) return 'Spells with a low economy';
  const [limit, perBalls] = [...limits][0]!.split('|');
  return perBalls === '5' ? `Spells with economy per 5 balls under ${Number(limit).toFixed(1)}` : `Spells with economy under ${Number(limit).toFixed(1)}`;
}

const matchCards = (matches: readonly PlayerMatch[]): StreakCard[] => {
  const m = inOrder(matches);
  return [
    card('Matches won by the team', m, (i) => m[i]!.result === 'won', 'No match won in these filters'),
    card('Matches lost by the team', m, (i) => m[i]!.result === 'lost', 'No match lost in these filters'),
    card('Player of the match', m, (i) => m[i]!.potm, 'No Player of the match award in these filters'),
  ];
};

/** The batting cards. An innings is one the player came to the crease for, so a match without an innings does not break a streak. */
export function battingStreaks(innings: readonly BatInnings[], matches: readonly PlayerMatch[]): StreakCard[] {
  const b = inOrder(innings, (r) => r.innings);
  return [
    card('Scores of 30 or more', b, (i) => b[i]!.runs >= 30, 'No score of 30 in these filters'),
    card('Scores of 50 or more', b, (i) => b[i]!.runs >= 50, 'No fifty in these filters'),
    card('Hundreds', b, (i) => b[i]!.runs >= 100, 'No hundred in these filters'),
    card('Innings without a duck', b, (i) => b[i]!.runs > 0 || !b[i]!.is_out, 'Out for a duck in every innings in these filters'),
    card('Not outs', b, (i) => !b[i]!.is_out, 'Not out in no innings in these filters'),
    card('Innings below 20', b, (i) => b[i]!.runs < 20, 'Reached 20 in every innings in these filters'),
    ...matchCards(matches),
  ];
}

/** The bowling cards. Only spells long enough for an economy to mean something are in the economy card, so a short spell neither breaks nor extends that streak. */
export function bowlingStreaks(innings: readonly BowlInnings[], matches: readonly PlayerMatch[]): StreakCard[] {
  const w = inOrder(innings, (r) => r.innings);
  const long = w.filter((r) => r.economy_counts);
  return [
    card('Innings with a wicket', w, (i) => w[i]!.wickets >= 1, 'No wicket taken in these filters'),
    card('Innings with 2 or more wickets', w, (i) => w[i]!.wickets >= 2, 'No innings with 2 wickets in these filters'),
    card('Innings without a wicket', w, (i) => w[i]!.wickets === 0, 'Took a wicket in every innings in these filters'),
    card(economyLabel(long), long, (i) => underLimit(long[i]!), 'No spell under the limit in these filters'),
    ...matchCards(matches),
  ];
}
