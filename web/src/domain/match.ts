import { BUILT, TOURNAMENT_PAGES } from './links';
/**
 * The Match page's bundle (tools/match_files.py) and the wording of the summary: the result line, the legend, the score of each side and the players worth naming.
 * Pure functions with no browser code, so the wording is tested once.
 */

export type MatchKind = 'test' | 'odi' | 't20' | 'hundred';

export interface Dismissal {
  type: string;
  bowler: string | null;
  bowlerId: string | null;
  fielders: string[];
  delivery: number;
  wicketNumber: number;
  over: number;
  ball: number;
  ballText: string;
}

export interface BatterCard { id: string | null; name: string; runs: number; balls: number; fours: number; sixes: number; out: Dismissal | null }
export interface BowlerCard { id: string | null; name: string; balls: number; maidens: number; runs: number; wkts: number; dots: number; wd: number; nb: number }

export interface FowEntry { n: number; runs: number; id: string | null; name: string; batRuns: number; batBalls: number; ballText: number | null; over: number; ball: number; type: string; shot: string | null; delivery: number }
export interface Stand { wkt: number; a: { id: string | null; name: string; runs: number; balls: number }; b: { id: string | null; name: string; runs: number; balls: number }; runs: number; balls: number; first: number }
export interface PhaseRow { key: string; firstOver: number; lastOver: number; runs: number; balls: number; wkts: number; dots: number; fours: number; sixes: number; extras: { wd: number; nb: number; b: number; lb: number; pen: number } }
export interface FielderRow { id: string | null; name: string; sub: boolean; c: number; st: number; ro: number }
export interface ReviewRow { ballText: number | null; over: number; team: string; batter: string; batterId: string | null; decision: string; umpiresCall: boolean; type: string | null }

export interface InningsCard {
  /** Present on an innings of the match itself, absent on a Super Over. */
  fow?: FowEntry[];
  /** Batters who retired (hurt or not out), with the score at that moment. They are not wickets and are not in `fow`. */
  retired?: FowEntry[];
  partnerships?: Stand[];
  phases?: PhaseRow[];
  fielding?: FielderRow[];
  reviews?: ReviewRow[];
  n: number;
  team: string;
  teamId: string;
  runs: number;
  wkts: number;
  balls: number;
  deliveries: number;
  overs: string;
  super: boolean;
  declared: boolean;
  extras: { wd: number; nb: number; b: number; lb: number; pen: number };
  targetRuns: number | null;
  targetOvers: number | null;
  penaltyPre: number;
  penaltyPost: number;
  batters: BatterCard[];
  bowlers: BowlerCard[];
  didNotBat: Array<{ id: string | null; name: string }>;
}

export interface Replacement {
  kind: string;
  reason: string;
  team: string | null;
  role: string | null;
  innings: number | null;
  delivery: number | null;
  playerIn: string;
  playerInId: string | null;
  playerOut: string;
  playerOutId: string | null;
  ballText?: number | null;
  over?: number | null;
}

export interface MatchInfo {
  id: number;
  date: string;
  endDate: string | null;
  season: string | null;
  gender: string;
  format: string;
  type: string;
  kind: MatchKind;
  tournament: { key: string | null; name: string | null; kind: string | null };
  stage: { name: string | null; cls: string | null; group: string | null };
  number: number | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  ballsPerOver: number;
  scheduledOvers: number | null;
  teams: Array<{ name: string; id: string }>;
  toss: { winner: string | null; decision: string | null };
  result: { winner: string | null; winnerId: string | null; runs: number | null; wickets: number | null; outcome: string | null; method: string | null; eliminator: string | null; byInnings: boolean };
  potm: Array<{ name: string; id: string | null; team?: string | null; award?: { n: number; series: boolean } | null }>;
  officials: Partial<Record<'umpire' | 'tv_umpire' | 'match_referee' | 'reserve_umpire', string[]>>;
}

export interface MatchBundle {
  v: 1;
  match: MatchInfo;
  innings: InningsCard[];
  coverage: { balls: number; winProb: number; projected: number; tracked: number; positioned: number; /** Balls with both a line and a length: `tracked` counts a ball with any tracking field, so it is higher. */ pitched?: number; reviews: number };
  replacements: Replacement[];
}

import { dateText } from './dates';

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** Innings of the match itself, without Super Overs, in the order they were batted. */
export const mainInnings = (b: MatchBundle): InningsCard[] => b.innings.filter((i) => !i.super);
export const superInnings = (b: MatchBundle): InningsCard[] => b.innings.filter((i) => i.super);
/** The two sides with the one that batted first on the left, as a scoreboard reads (Ari, 2026-10-20). With no innings, the order the data names them. */
export function sides(b: MatchBundle): [string, string] {
  const [x, y] = [b.match.teams[0]!.name, b.match.teams[1]!.name];
  const first = mainInnings(b)[0]?.team;
  return first === y ? [y, x] : [x, y];
}

/** "178", "177/6", "312/6d". A side that is all out shows the runs alone, as scorecards do. */
export function scoreText(i: InningsCard): string {
  if (i.declared) return `${i.runs}/${i.wkts}d`;
  return i.wkts >= 10 ? `${i.runs}` : `${i.runs}/${i.wkts}`;
}

/** What a side scored in the match: its one innings, or each of a Test side's innings joined by "&". */
export function teamScore(b: MatchBundle, team: string): string {
  return mainInnings(b).filter((i) => i.team === team).map(scoreText).join(' & ');
}

/** Balls the side had left when it won a chase, from the scheduled balls (the revised overs when there are any). 0 when none are known. */
export function ballsLeft(b: MatchBundle): number {
  const m = b.match;
  if (m.kind === 'test') return 0;
  const chase = mainInnings(b).at(-1);
  if (!chase || chase.n < 2) return 0;
  const overs = chase.targetOvers ?? m.scheduledOvers;
  if (overs === null || overs === undefined) return 0;
  const whole = Math.floor(overs);
  const scheduled = whole * m.ballsPerOver + Math.round((overs - whole) * 10);
  return Math.max(0, scheduled - chase.balls);
}

/** "Team B won by 4 wickets, with 4 balls left", "Match drawn", "Match tied. Team B won the Super Over". */
export function resultText(b: MatchBundle): string {
  const m = b.match, r = m.result;
  const method = r.method === 'D/L' ? ' (DLS method)' : '';
  if (r.outcome === 'no result') return 'No result';
  if (r.outcome === 'draw') return 'Match drawn';
  if (r.outcome === 'tie') {
    const decider = r.eliminator ? `. ${r.eliminator} won the ${superInnings(b).length ? 'Super Over' : 'eliminator'}` : '';
    return `Match tied${decider}${method}`;
  }
  if (!r.winner) return 'No result';
  if (r.method === 'Awarded' && r.runs === null && r.wickets === null) return `${r.winner} awarded the match`;
  if (r.runs !== null) return `${r.winner} won by ${r.byInnings ? `an innings and ${plural(r.runs, 'run')}` : plural(r.runs, 'run')}${method}`;
  if (r.wickets !== null) {
    const left = ballsLeft(b);
    const tail = left > 0 && r.winner === mainInnings(b).at(-1)?.team ? `, with ${plural(left, 'ball')} left` : '';
    return `${r.winner} won by ${r.byInnings ? `an innings and ${plural(r.wickets, 'wicket')}` : plural(r.wickets, 'wicket')}${tail}${method}`;
  }
  return `${r.winner} won${method}`;
}

/** The side whose card carries the red top edge: the winner, or the winner of the Super Over. */
export function winningSide(b: MatchBundle): string | null {
  return b.match.result.winner ?? b.match.result.eliminator;
}

const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** "Five days", from the first and last date of a Test. Empty when the data has no end date. */
export function daysText(m: MatchInfo): string {
  if (!m.endDate) return '';
  const days = Math.round((Date.parse(m.endDate) - Date.parse(m.date)) / 86_400_000) + 1;
  if (!(days >= 1)) return '';
  return `${days <= 10 ? WORDS[days]! : days} ${days === 1 ? 'day' : 'days'}`;
}

/** The competition, the stage and the match number, for the banner: "Indian Premier League, Final, match 1". */
export function titleText(b: MatchBundle): string {
  const m = b.match;
  const title = [m.tournament.name, m.stage.name].filter(Boolean).join(', ');
  // An international match with no event name is named by its format.
  const plain = m.kind === 'test' ? 'Test match' : m.kind === 'odi' ? 'One Day International' : m.kind === 'hundred' ? 'The Hundred' : m.type === 'Intl' ? 'T20 International' : 'T20 match';
  const name = title || plain;
  return m.number !== null && name ? `${name}, match ${m.number}` : name;
}

/**
 * The strip's competition name when it has a page of its own: the text of the strip split into the name (a link to the Tournament page) and the rest, which together read as `stripContext`. Null when the
 * match has no competition or the competition has no page, and the strip stays one piece of text.
 */
export function stripLink(b: MatchBundle): { key: string; name: string; rest: string } | null {
  const { key, name } = b.match.tournament;
  if (!key || !name || !BUILT.tournament || !TOURNAMENT_PAGES.has(key)) return null;
  const text = stripContext(b);
  return text.startsWith(name) ? { key, name, rest: text.slice(name.length) } : null;
}

/** The short name of the format for the strip: Test, ODI, T20I, T20 or The Hundred. */
export const formatTag = (b: MatchBundle): string => (b.match.kind === 'test' ? 'Test' : b.match.kind === 'odi' ? 'ODI' : b.match.kind === 'hundred' ? 'The Hundred' : b.match.type === 'Intl' ? 'T20I' : 'T20');

/**
 * The line under the strip that says which match it is (Ari, 2026-10-21): the competition or series, its stage and the match number, the format, then the ground and the dates, in the words of the
 * summary banner. A match with no competition name is already named by its format, so the format is not said twice.
 */
export function stripContext(b: MatchBundle): string {
  const m = b.match, named = Boolean([m.tournament.name, m.stage.name].filter(Boolean).length);
  const title = titleText(b), tag = formatTag(b);
  return [title, named && !title.includes(tag) ? tag : '', placeLine(b)].filter(Boolean).join(' \u00A0|\u00A0 ');
}

/** The side that won the toss and what it chose, for the coin beside its name. */
export function tossOf(b: MatchBundle): { team: string; decision: string } | null {
  const { winner, decision } = b.match.toss;
  return winner && decision ? { team: winner, decision } : null;
}

const REASON: Record<string, string> = { impact_player: 'impact player', concussion_substitute: 'concussion substitute', supersub: 'supersub', covid_replacement: 'Covid replacement' };

export interface SubMark { dir: 'in' | 'out'; title: string }

/**
 * Who came into the match and who went out of it, from `match_replacements` (the impact player, the concussion substitute, the supersub, a Covid replacement). A player is marked
 * by id, or by name when the data has no id. Replacements of a role inside the match (a bowler replaced after an injury) are not marked, since both players were already in it.
 */
export function subMarks(b: MatchBundle): Map<string, SubMark> {
  const marks = new Map<string, SubMark>();
  for (const r of b.replacements) {
    if (r.kind !== 'match') continue;
    const why = REASON[r.reason] ? ` (${REASON[r.reason]})` : '';
    marks.set(r.playerInId ?? r.playerIn, { dir: 'in', title: `Came in for ${r.playerOut}${why}` });
    marks.set(r.playerOutId ?? r.playerOut, { dir: 'out', title: `Replaced by ${r.playerIn}${why}` });
  }
  return marks;
}

/** The mark of one player, by id and then by name. */
export function subMarkOf(marks: Map<string, SubMark>, id: string | null, name: string): SubMark | undefined {
  return (id ? marks.get(id) : undefined) ?? marks.get(name);
}

export interface TopBatter { id: string | null; name: string; runs: number; balls: number; notOut: boolean }
export interface TopBowler { id: string | null; name: string; wkts: number; runs: number; balls: number }

const isOut = (c: BatterCard): boolean => c.out !== null && c.out.type !== 'retired hurt' && c.out.type !== 'retired not out';

/** The best batting of one innings, most runs first, then fewer balls. */
export function inningsBatters(i: InningsCard, n = 4): TopBatter[] {
  return i.batters.filter((c) => c.balls > 0 || c.runs > 0).map((c) => ({ id: c.id, name: c.name, runs: c.runs, balls: c.balls, notOut: !isOut(c) }))
    .sort((a, c) => c.runs - a.runs || a.balls - c.balls).slice(0, n);
}

/** The best bowling of one innings (the side that fielded): most wickets, then fewest runs, then more balls. */
export function inningsBowlers(i: InningsCard, n = 4): TopBowler[] {
  return [...i.bowlers].sort((a, c) => c.wkts - a.wkts || a.runs - c.runs || c.balls - a.balls).slice(0, n).map(({ id, name, wkts, runs, balls }) => ({ id, name, wkts, runs, balls }));
}

/** The overs a bowler bowled: "4", "3.2", and balls in The Hundred. */
export function bowledText(b: MatchBundle, balls: number): string {
  if (b.match.kind === 'hundred') return String(balls);
  const per = b.match.ballsPerOver || 6;
  return balls % per === 0 ? String(balls / per) : `${Math.floor(balls / per)}.${balls % per}`;
}

/** The dates of a match: "29 May 2023", and for a Test "9 to 12 Sep 2026", "30 Sep to 3 Oct 2026" or "30 Dec 2025 to 3 Jan 2026". */
export function datesText(m: MatchInfo): string {
  if (!m.endDate || m.endDate === m.date) return dateText(m.date);
  const [a, z] = [m.date, m.endDate];
  if (a.slice(0, 7) === z.slice(0, 7)) return `${dateText(a, {})} to ${dateText(z)}`;
  if (a.slice(0, 4) === z.slice(0, 4)) return `${dateText(a, { month: true })} to ${dateText(z)}`;
  return `${dateText(a)} to ${dateText(z)}`;
}

/** The ground and the dates, for the banner: "Narendra Modi Stadium, Ahmedabad, 29 May 2023". The city is left out when the ground's name already holds it. Only a Test shows a range. */
export function placeLine(b: MatchBundle): string {
  const m = b.match;
  const city = m.city && m.venue && !m.venue.toLowerCase().includes(m.city.toLowerCase()) ? m.city : null;
  return [m.venue, city, datesText(m.kind === 'test' ? m : { ...m, endDate: null })].filter(Boolean).join(', ');
}

/** The two lines of the banner under "Match summary": the competition, stage and number (and the length of a Test), then the ground and the dates. */
export function bannerLines(b: MatchBundle): [string, string] {
  const days = b.match.kind === 'test' ? daysText(b.match) : '';
  return [[titleText(b), days].filter(Boolean).join(' \u00A0|\u00A0 '), placeLine(b)];
}

/** What the overs label of the chasing side's bar says when you hover it, for a revised chase: "Target 251 from 42 overs, revised for rain (DLS)". */
export function dlsTip(b: MatchBundle, i: InningsCard): string | null {
  if (b.match.result.method !== 'D/L' || mainInnings(b).at(-1) !== i || i.targetRuns === null) return null;
  const unit = b.match.kind === 'hundred' ? 'balls' : 'overs';
  const size = i.targetOvers === null ? '' : ` from ${b.match.kind === 'hundred' ? Math.round(i.targetOvers * 5) : i.targetOvers} ${unit}`;
  return `Target ${i.targetRuns}${size}, revised for rain (DLS)`;
}

/** The side that followed on in a Test: the side that batted second and then batted again at once. Null when nobody did. The data has no flag for it, so it is read from the order of innings. */
export function followOn(b: MatchBundle): string | null {
  if (b.match.kind !== 'test') return null;
  const [, second, third] = mainInnings(b);
  return second && third && second.team === third.team ? second.team : null;
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th'];

/** What the header bar of an innings says beside the team: the overs of a limited-overs innings ("49.5 ov", "98 balls"), or for a Test which innings it was and its overs ("2nd Innings, 96.2 ov", and "3rd Innings (f/o), 38.4 ov" for a side that followed on). */
export function inningsLabel(b: MatchBundle, i: InningsCard): string {
  if (b.match.kind === 'test') {
    const place = mainInnings(b).indexOf(i) + 1;
    return `${ORDINAL[place] ?? ''} Innings${place === 3 && followOn(b) === i.team ? ' (f/o)' : ''}, ${i.overs} ov`.trim();
  }
  const base = b.match.kind === 'hundred' ? `${i.balls} balls` : `${i.overs} ov`;
  return b.match.result.method === 'D/L' && mainInnings(b).at(-1) === i ? `${base}, DLS` : base;
}

/** The Super Over rounds, one line each: "Namibia 8/0, Uganda 4/1". The innings of a round come in pairs. Empty when there was none. */
export function superOverLines(b: MatchBundle): string[] {
  const so = superInnings(b);
  const lines: string[] = [];
  for (let k = 0; k < so.length; k += 2) lines.push(so.slice(k, k + 2).map((i) => `${i.team} ${scoreText(i)}`).join(', '));
  return lines;
}

/** The player of the match and what they did: names "A Name", figures "41 off 28; 2-30". Figures are the player's own innings in this match, and empty when the data has none. */
export function potm(b: MatchBundle): { names: string; figures: string } | null {
  const first = b.match.potm[0];
  if (!first) return null;
  const inn = mainInnings(b);
  const same = (c: { id: string | null; name: string }): boolean => (first.id ? c.id === first.id : c.name === first.name);
  const bat = inn.flatMap((i) => i.batters.filter((c) => same(c) && (c.balls > 0 || c.runs > 0)));
  const bowl = inn.flatMap((i) => i.bowlers.filter((c) => same(c) && c.balls > 0));
  const figures = [
    bat.length ? bat.map((c) => `${c.runs}${isOut(c) ? '' : '*'} off ${c.balls}`).join(' and ') : '',
    bowl.length ? bowl.map((c) => `${c.wkts}-${c.runs}`).join(' and ') : '',
  ].filter(Boolean).join('; ');
  return { names: b.match.potm.map((p) => p.name).join(' and '), figures };
}

/** "Team A 178 v Team B 177/6" for the strip at the top of the working state. */
export function stripScores(b: MatchBundle): Array<{ team: string; score: string }> {
  return sides(b).map((team) => ({ team, score: teamScore(b, team) }));
}
