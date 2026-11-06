import type { BatInnings, BowlInnings } from './records';

// Milestones and Pace to milestones. Cards show the 1st, 10th, 25th ... fifty, hundred, five-wicket haul and Player of the match award with the innings (or match) number
// and the month. Pace lists the runs or wickets landmarks, with where the player stands among everyone of the same gender in the same Format and Competition
// by fewest innings (then balls, then the earlier date). Both are career figures: the Season filter does not apply.

/** The counts that get a card. */
export const NTH: readonly number[] = [1, 10, 25, 50, 75, 100, 150, 200, 250, 300];

const RUN_STEPS = [1000, 2500, 5000, 10000, 15000, 20000, 25000, 30000, 35000];
const WICKET_STEPS = [50, 100, 200, 300, 400, 500, 600, 800, 1000];

export function ordinal(n: number): string {
  const r = n % 100;
  return `${n}${r > 10 && r < 14 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Jul 2006" from a yyyy-mm-dd date. */
export function monthOf(date: string): string {
  const [y, m] = date.split('-');
  const i = Number(m) - 1;
  return y && i >= 0 && i < 12 ? `${MONTHS[i]} ${y}` : date;
}

export interface MilestoneCard { ordinal: string; count: number; where: string; month: string }
export interface MilestoneSection { title: string; cards: MilestoneCard[] }

const byDate = <T extends { date: string; match_id: number; innings: number }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.match_id - b.match_id || a.innings - b.innings);

/** Cards for the nth innings that meets a rule, each with the innings number it came in (every innings in the scope counted, in date order). */
function nthCards<T extends { date: string; match_id: number; innings: number }>(rows: readonly T[], meets: (r: T) => boolean): MilestoneCard[] {
  const out: MilestoneCard[] = [];
  let seen = 0;
  byDate(rows).forEach((r, i) => {
    if (!meets(r)) return;
    seen += 1;
    if (NTH.includes(seen)) out.push({ ordinal: ordinal(seen), count: seen, where: `${i + 1} innings`, month: monthOf(r.date) });
  });
  return out;
}

/** The fifty is 50 to 99 and the hundred 100 or more, as the summary counts them. */
export const fiftyCards = (rows: readonly BatInnings[]): MilestoneCard[] => nthCards(rows, (r) => r.runs >= 50 && r.runs < 100);
export const hundredCards = (rows: readonly BatInnings[]): MilestoneCard[] => nthCards(rows, (r) => r.runs >= 100);
export const fiveWicketCards = (rows: readonly BowlInnings[]): MilestoneCard[] => nthCards(rows, (r) => r.wickets >= 5);

/** The nth award, with the number of matches the player had played in the scope when it came. `matches` is each award's match number and date. */
export function awardCards(awards: ReadonlyArray<{ date: string; matchNo: number }>): MilestoneCard[] {
  return [...awards].sort((a, b) => a.date.localeCompare(b.date) || a.matchNo - b.matchNo)
    .flatMap((a, i) => (NTH.includes(i + 1) ? [{ ordinal: ordinal(i + 1), count: i + 1, where: `${a.matchNo} ${a.matchNo === 1 ? 'match' : 'matches'}`, month: monthOf(a.date) }] : []));
}

/** The sections that have at least one card, in the mockup's order. A section nobody has reached is left out. */
export function milestoneSections(parts: { awards: MilestoneCard[]; fifties: MilestoneCard[]; hundreds: MilestoneCard[]; fiveWickets: MilestoneCard[] }): MilestoneSection[] {
  return ([
    { title: 'Player of the match', cards: parts.awards },
    { title: 'Fifties', cards: parts.fifties },
    { title: 'Hundreds', cards: parts.hundreds },
    { title: 'Five-wicket hauls', cards: parts.fiveWickets },
  ] as MilestoneSection[]).filter((s) => s.cards.length > 0);
}

export type PaceSide = 'bat' | 'bowl';

/** Landmarks to list: runs or wickets, with 500 runs or 25 wickets first in T20 cricket and a first wicket for a bowler (which has no rank). */
export function landmarks(side: PaceSide, t20: boolean): number[] {
  return side === 'bat' ? [...(t20 ? [500] : []), ...RUN_STEPS] : [1, ...(t20 ? [25] : []), ...WICKET_STEPS];
}

export function landmarkLabel(side: PaceSide, value: number): string {
  if (side === 'bowl' && value === 1) return 'First wicket';
  return `${new Intl.NumberFormat('en').format(value)} ${side === 'bat' ? 'runs' : 'wickets'}`;
}

export interface PaceFact { landmark: number; player_id: string; name: string; innings_n: number; rank: number; date: string; first_year: number | null }
export interface PaceChip { name: string; innings: number; me: boolean; earlier: boolean }
export interface PaceRow { landmark: number; label: string; innings: number; month: string; rank: number | null; chips: PaceChip[]; top: boolean }

/**
 * The rows for the landmarks the player has reached. The first wicket has no rank. A player in the top 5 gets the five quickest as chips; a rival whose career began
 * before 2001 carries a dagger, since the data starts in 2001 and their early innings are missing.
 */
export function paceRows(side: PaceSide, t20: boolean, playerId: string, facts: readonly PaceFact[]): PaceRow[] {
  return landmarks(side, t20).flatMap((value) => {
    const here = facts.filter((f) => f.landmark === value);
    const mine = here.find((f) => f.player_id === playerId);
    if (!mine) return [];
    const ranked = side === 'bowl' && value === 1 ? false : true;
    const top = ranked && mine.rank <= 5;
    const chips = top ? here.filter((f) => f.rank <= 5).sort((a, b) => a.rank - b.rank || a.innings_n - b.innings_n).map((f) => ({ name: f.name, innings: f.innings_n, me: f.player_id === playerId, earlier: f.player_id !== playerId && f.first_year !== null && f.first_year < 2001 })) : [];
    return [{ landmark: value, label: landmarkLabel(side, value), innings: mine.innings_n, month: monthOf(mine.date), rank: ranked ? mine.rank : null, chips, top }];
  });
}

/** T20 landmarks start lower. A scope is T20 when it is a T20 format or League (all T20 cricket), or one competition whose innings are all T20. */
export function isT20Scope(formats: readonly string[]): boolean {
  return formats.length > 0 && formats.every((f) => f === 'T20');
}
