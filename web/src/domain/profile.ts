import { battingTotals, type BattingTotals, type SummaryRow } from './batting';

// What the profile state shows: the batting and fielding table (International, T20s, each format, each league), and the form strip.

export interface CareerRow { label: string; totals: BattingTotals }

/** Where a match sits: its format, whether it is a league match, and its tournament key. Summary rows and per-innings rows both reduce to this. */
export interface Scope { format: string; league: boolean; key: string | null }

export const scopeOfSummary = (r: SummaryRow): Scope => ({ format: r.format, league: r.filter_section === 'Leagues', key: r.tournament_key });

/** The Hundred's tournament key. Its economy is runs per five-ball over. */
export const HUNDRED_KEY = 'hnd';

export interface CareerGroup {
  label: string;
  includes: (s: Scope) => boolean;
  /** The summary rows of the group. */
  rows: SummaryRow[];
}

const isT20i = (s: Scope): boolean => s.format === 'T20' && !s.league;
const SINGLE: Array<[string, (s: Scope) => boolean]> = [['Tests', (s) => s.format === 'TEST'], ['ODIs', (s) => s.format === 'ODI'], ['T20Is', isT20i]];

/**
 * The groups of the career tables, in the order of the mockup: International (Tests, ODIs and T20Is together, only when the player has two or more
 * of them), T20s (all T20, only when there are two or more T20 competitions), each format, then each league with most matches first.
 * One definition serves the batting and the bowling table.
 */
export function careerGroups(rows: readonly SummaryRow[]): CareerGroup[] {
  const make = (label: string, includes: (s: Scope) => boolean): CareerGroup => ({ label, includes, rows: rows.filter((r) => includes(scopeOfSummary(r))) });
  const present = SINGLE.filter(([, pick]) => rows.some((r) => pick(scopeOfSummary(r))));
  const leagueKeys = new Map<string, Set<string | null>>();
  for (const r of rows) {
    if (r.filter_section !== 'Leagues') continue;
    const name = r.tournament_name ?? r.tournament_key ?? 'League';
    leagueKeys.set(name, (leagueKeys.get(name) ?? new Set()).add(r.tournament_key));
  }
  const out: CareerGroup[] = [];
  if (present.length > 1) out.push(make('International', (s) => present.some(([, pick]) => pick(s))));
  const t20Competitions = (present.some(([label]) => label === 'T20Is') ? 1 : 0) + leagueKeys.size;
  if (t20Competitions > 1) out.push(make('T20s', (s) => s.format === 'T20'));
  for (const [label, pick] of present) out.push(make(label, pick));
  const leagues = [...leagueKeys].map(([label, keys]) => make(label, (s) => s.league && keys.has(s.key)));
  const matches = (g: CareerGroup): number => g.rows.reduce((a, r) => a + (r.appearances ?? 0), 0);
  return [...out, ...leagues.sort((a, b) => matches(b) - matches(a))];
}

/** The batting rows of the career table. Counts add up across a group's rows, and a rate is worked out from the group's own totals. */
export function careerRows(rows: readonly SummaryRow[]): CareerRow[] {
  return careerGroups(rows).map((g) => ({ label: g.label, totals: battingTotals(g.rows) }));
}

export interface FormInnings { runs: number; notOut: boolean; opponent: string; /** The opponent's team id and the match, for the links. Absent in a profile built before they were added. */ opponentId?: string | null; matchId?: number }
export type FormClass = 'hi' | 'mid' | 'lo' | 'no';

/** Colour class of a form box: white for not out, gold from 50, sky from 20, grey below. */
export const formClass = (innings: FormInnings): FormClass => (innings.notOut ? 'no' : innings.runs >= 50 ? 'hi' : innings.runs >= 20 ? 'mid' : 'lo');

/** A short team label for under a form box. One word gives its first three letters, more words give their initials. */
export function teamAbbreviation(team: string): string {
  const words = team.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return (words[0] ?? '').slice(0, 3).toUpperCase();
  return words.slice(0, 4).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

/** "last 10: 442 runs" for the strip. */

/** One innings of a bowler in the profile strip: the wickets and runs charged, and the team bowled against. */
export interface BowlFormInnings { wickets: number; runs: number; opponent: string; opponentId?: string | null; matchId?: number }

/** Colour class of a bowling form box: gold from three wickets, sky for two, grey for none or one. (A bowler has no not out, so white is not used.) */
export const bowlFormClass = (innings: BowlFormInnings): FormClass => (innings.wickets >= 3 ? 'hi' : innings.wickets === 2 ? 'mid' : 'lo');

/** The figures a box shows, wickets over runs: "3/25". */
export const bowlFigures = (innings: BowlFormInnings): string => `${innings.wickets}/${innings.runs}`;
