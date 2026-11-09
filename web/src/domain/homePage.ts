// The Home page's sections below the replay: the shape of home.json (tools/home_files.py) and the words made from it.

export type LeaderKey = 'runs' | 'wickets' | 'sixes';
export const LEADER_TITLES: ReadonlyArray<readonly [LeaderKey, string]> = [['runs', 'Most runs'], ['wickets', 'Most wickets'], ['sixes', 'Most sixes']];

/** One match of a day, as written: id, year, the two teams as [id, name], the winner (0, 1 or -1), the margin as the match list words it, the competition and the player of the match. */
export type DayRow = [number, number, [string, string], [string, string], number, string, string, [string, string] | null];

/** A notable ball as written: match id, innings, the ball as the scorecard writes it ("19.4"), the two team names and the year. */
export type NotableBall = [number, number, string, string, string, number];

export interface HomeFile {
  v: number;
  matches: number;
  balls: number;
  competitions: number;
  since: number;
  leaders: Record<LeaderKey, Array<[string, string, number]>>;
  days: Record<string, DayRow[]>;
  notable: NotableBall[];
}

export interface DayMatch { id: number; year: number; title: string; teams: [{ id: string; name: string }, { id: string; name: string }]; competition: string; result: string; potm: { id: string; name: string } | null }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function dayKey(month: number, day: number): string {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "17 October". */
export function dayText(month: number, day: number): string {
  return `${day} ${MONTHS[month - 1] ?? ''}`;
}

/** How the match ended in a sentence: "India won by 4 wickets", "Match drawn", "Match tied", "No result". */
export function resultLine(row: DayRow): string {
  const [, , a, b, winner, margin] = row;
  if (winner === 0 || winner === 1) return `${(winner === 0 ? a : b)[1]} won ${margin}`.trim();
  if (margin.startsWith('drawn')) return 'Match drawn';
  if (margin.startsWith('tied')) return 'Match tied';
  return 'No result';
}

/** The matches of a calendar day, newest first, as the page shows them. */
export function dayMatches(file: HomeFile, month: number, day: number): DayMatch[] {
  return (file.days[dayKey(month, day)] ?? []).map((row) => ({
    id: row[0], year: row[1], title: `${row[2][1]} v ${row[3][1]}`, teams: [{ id: row[2][0], name: row[2][1] }, { id: row[3][0], name: row[3][1] }], competition: row[6], result: resultLine(row),
    potm: row[7] ? { id: row[7][0], name: row[7][1] } : null,
  }));
}

/** A big count for the stat tiles: "5.8 million" from 5,852,078 and "14,585" below a million. */
export function bigCount(n: number): { value: number; decimals: number; suffix: string } {
  return n >= 1_000_000 ? { value: Math.round(n / 100_000) / 10, decimals: 1, suffix: ' million' } : { value: n, decimals: 0, suffix: '' };
}

/** The words for one notable ball: "ball 19.4 of India v Pakistan, 2022", split so the match can be a link. */
export function ballLine(b: NotableBall): { matchId: number; ball: string; title: string } {
  return { matchId: b[0], ball: b[2], title: `${b[3]} v ${b[4]}, ${b[5]}` };
}
