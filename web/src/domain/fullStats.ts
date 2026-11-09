// Full stats: the splits behind the profile. Every table is a grouping of the player's innings (one row per innings batted or bowled in), worked out in the browser from the
// innings files, so the numbers follow the Format, Competition and Season choices and agree with the profile's career tables (the Career row's Mat is the matches played, as everywhere; a split row counts the matches that have an innings in it).

export type Kind = 'bat' | 'bowl';

/** What every innings row carries for the splits (tools/export.py, the match context columns). */
export interface StatInnings {
  match_id: number;
  innings: number;
  date: string;
  season: string;
  format: string;
  tournament_key: string | null;
  venue: string | null;
  team: string;
  opponent: string;
  venue_country: string | null;
  venue_continent: string | null;
  home_away: 'home' | 'away' | 'neutral' | null;
  toss: 'won_bat' | 'won_field' | 'lost_bat' | 'lost_field' | null;
  result: 'won' | 'lost' | 'tie' | 'draw' | 'no result' | null;
  team_bat_first: boolean | null;
  team_innings: number | null;
  match_number: number | null;
  stage_class: string | null;
  stage_name: string | null;
  tournament_kind: string | null;
  filter_section: string | null;
}
export interface StatBat extends StatInnings { runs: number; balls: number; fours: number; sixes: number; is_out: boolean; position: number | null }
export interface StatBowl extends StatInnings { balls: number; runs: number; wickets: number }

/** One row of a table: the figures of a group of innings. A figure that has no value is null (shown as a dash). */
export interface BatLine { mat: number; inns: number; no: number; runs: number; hs: number | null; hsNotOut: boolean; avg: number | null; bf: number; sr: number | null; hundreds: number; fifties: number; ducks: number; fours: number; sixes: number }
export interface BowlLine { mat: number; inns: number; balls: number; runs: number; wkts: number; bbiW: number | null; bbiR: number | null; avg: number | null; econ: number | null; sr: number | null; four: number; five: number }

/** What the line functions read, so a group of balls (a phase, a bowler type) can use them as well as an innings. */
export type BatInput = Pick<StatBat, 'match_id' | 'runs' | 'balls' | 'fours' | 'sixes' | 'is_out'>;
export type BowlInput = Pick<StatBowl, 'match_id' | 'balls' | 'runs' | 'wickets'>;

export const battingLine = (rows: readonly BatInput[]): BatLine => {
  let runs = 0, bf = 0, fours = 0, sixes = 0, no = 0, hundreds = 0, fifties = 0, ducks = 0, outs = 0;
  let hs: number | null = null, hsNotOut = false;
  const matches = new Set<number>();
  for (const r of rows) {
    matches.add(r.match_id);
    runs += r.runs; bf += r.balls; fours += r.fours; sixes += r.sixes;
    if (!r.is_out) no += 1; else outs += 1;
    if (r.runs >= 100) hundreds += 1; else if (r.runs >= 50) fifties += 1;
    if (r.runs === 0 && r.is_out) ducks += 1;
    // The high score is the biggest, and a not out stands ahead of an out on the same score.
    if (hs === null || r.runs > hs || (r.runs === hs && !r.is_out && !hsNotOut)) { hs = r.runs; hsNotOut = !r.is_out; }
  }
  return { mat: matches.size, inns: rows.length, no, runs, hs, hsNotOut, avg: outs > 0 ? runs / outs : null, bf, sr: bf > 0 ? (runs / bf) * 100 : null, hundreds, fifties, ducks, fours, sixes };
};

/** `perFive` is true when every ball bowled was The Hundred's, which counts economy per 5 balls. */
export const bowlingLine = (rows: readonly BowlInput[], perFive = false): BowlLine => {
  let balls = 0, runs = 0, wkts = 0, four = 0, five = 0;
  let bbiW: number | null = null, bbiR: number | null = null;
  const matches = new Set<number>();
  for (const r of rows) {
    matches.add(r.match_id);
    balls += r.balls; runs += r.runs; wkts += r.wickets;
    if (r.wickets === 4) four += 1;
    if (r.wickets >= 5) five += 1;
    // The best innings has the most wickets, then the fewest runs.
    if (bbiW === null || r.wickets > bbiW || (r.wickets === bbiW && r.runs < (bbiR ?? Infinity))) { bbiW = r.wickets; bbiR = r.runs; }
  }
  return { mat: matches.size, inns: rows.length, balls, runs, wkts, bbiW, bbiR, avg: wkts > 0 ? runs / wkts : null, econ: balls > 0 ? (runs / balls) * (perFive ? 5 : 6) : null, sr: wkts > 0 ? balls / wkts : null, four, five };
};

/** The first and last year the rows cover, as "2008-2019" or one year. */
export function spanOf(rows: ReadonlyArray<{ date: string }>): string | null {
  if (rows.length === 0) return null;
  let first = rows[0]!.date, last = rows[0]!.date;
  for (const r of rows) { if (r.date < first) first = r.date; if (r.date > last) last = r.date; }
  const a = first.slice(0, 4), b = last.slice(0, 4);
  return a === b ? a : `${a}-${b}`;
}

/** A group of innings and the order it sits in when the table is first drawn (lower first). */
export interface Group<T> { key: string; label: string; order: number; rows: T[] }

type Namer<T> = (row: T) => { key: string; label: string; order: number } | null;

export function groupBy<T>(rows: readonly T[], name: Namer<T>): Group<T>[] {
  const map = new Map<string, Group<T>>();
  for (const row of rows) {
    const n = name(row);
    if (!n) continue;
    const have = map.get(n.key);
    if (have) have.rows.push(row); else map.set(n.key, { key: n.key, label: n.label, order: n.order, rows: [row] });
  }
  return [...map.values()];
}

const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
const text = (v: string | null | undefined): string | null => (v && v.trim() ? v : null);

/** The sections of Full stats and the tables of each split. A table is `groups(rows)`, and a table may be named differently for a bowler. */
export type SplitKey = 'team' | 'ctry' | 'cont' | 'ha' | 'grd' | 'yr' | 'sea' | 'toss' | 'tosq' | 'bfs' | 'tin' | 'min' | 'res' | 'rsq' | 'trn' | 'mno' | 'fin' | 'pos';

const HOME_ORDER: Record<string, number> = { home: 0, away: 1, neutral: 2 };
const TOSS_ORDER = ['won_bat', 'won_field', 'lost_bat', 'lost_field'] as const;
const TOSS_LABEL: Record<(typeof TOSS_ORDER)[number], string> = { won_bat: 'Won toss and batted', won_field: 'Won toss and fielded', lost_bat: 'Lost toss and sent in', lost_field: 'Lost toss and fielded' };
const RESULT_LABEL: Record<string, string> = { won: 'Won match', lost: 'Lost match', draw: 'Drawn match', tie: 'Tied match', 'no result': 'No result' };
const RESULT_ORDER: Record<string, number> = { won: 0, lost: 1, draw: 2, tie: 3, 'no result': 4 };

/** The type of tournament, as the tournaments table classes it: a bilateral series, an ICC event, a domestic league, anything else. */
export function tournamentType(row: Pick<StatInnings, 'tournament_kind' | 'filter_section'>): { key: string; label: string; order: number } {
  if (row.tournament_kind === 'bilateral') return { key: 'bilateral', label: 'Bilateral series', order: 0 };
  if (row.filter_section === 'World Cups and ICC events') return { key: 'icc', label: 'ICC events', order: 1 };
  if (row.tournament_kind === 'league') return { key: 'league', label: 'Domestic league', order: 2 };
  return { key: 'other', label: 'Other tournaments', order: 3 };
}

/** Finals, semi finals, other knockout matches and the rest (league matches and games with no stage). */
export function finalsKind(row: Pick<StatInnings, 'stage_class' | 'stage_name'>): { key: string; label: string; order: number } {
  const name = (row.stage_name ?? '').toLowerCase();
  if (name === 'final') return { key: 'final', label: 'Finals', order: 0 };
  if (name === 'semi final') return { key: 'semi', label: 'Semi finals', order: 1 };
  if (row.stage_class === 'knockout' || row.stage_class === 'placing' || row.stage_class === 'second_phase') return { key: 'knockout', label: 'Other knockouts', order: 2 };
  return { key: 'league', label: 'League matches', order: 3 };
}

/** The namers. `tests` says the table is for Tests (draws exist, a team bats first or second, the match number is "Test 3"). */
export function namerFor<T extends StatInnings>(key: SplitKey, options: { tests: boolean; kind: Kind }): Namer<T> {
  const base = baseNamer<T>(key, options);
  // An innings the data has nothing for (no toss recorded, no match number, no batting position) is a row of its own, so every table adds up to the career row.
  return (row) => base(row) ?? { key: 'unknown', label: 'Not known', order: 9999 };
}

function baseNamer<T extends StatInnings>(key: SplitKey, options: { tests: boolean; kind: Kind }): Namer<T> {
  const bowl = options.kind === 'bowl';
  switch (key) {
    case 'team': return (r) => ({ key: r.opponent, label: r.opponent, order: 0 });
    case 'ctry': return (r) => { const c = text(r.venue_country); return c ? { key: c, label: `In ${c}`, order: 0 } : null; };
    case 'cont': return (r) => { const c = text(r.venue_continent); return c ? { key: c, label: `In ${c}`, order: 0 } : null; };
    case 'ha': return (r) => (r.home_away ? { key: r.home_away, label: r.home_away === 'home' ? 'Home' : r.home_away === 'away' ? 'Away' : 'Neutral', order: HOME_ORDER[r.home_away]! } : null);
    case 'grd': return (r) => { const v = text(r.venue); return v ? { key: v, label: v, order: 0 } : null; };
    case 'yr': return (r) => ({ key: r.date.slice(0, 4), label: r.date.slice(0, 4), order: -Number(r.date.slice(0, 4)) });
    case 'sea': return (r) => ({ key: r.season, label: r.season, order: -Number(r.season.slice(0, 4)) });
    case 'toss': return (r) => (r.toss ? (r.toss.startsWith('won') ? { key: 'won', label: 'Won the toss', order: 0 } : { key: 'lost', label: 'Lost the toss', order: 1 }) : null);
    case 'tosq': return (r) => (r.toss ? { key: r.toss, label: TOSS_LABEL[r.toss], order: TOSS_ORDER.indexOf(r.toss) } : null);
    case 'bfs': return (r) => (r.team_bat_first === null ? null : r.team_bat_first ? { key: 'first', label: 'Matches batting first', order: 0 } : { key: 'second', label: 'Matches fielding first', order: 1 });
    case 'tin': return (r) => (r.team_innings === null ? null : { key: String(r.team_innings), label: `${ordinal(r.team_innings)} ${bowl ? 'fielding' : 'team'} innings`, order: r.team_innings });
    case 'min': return (r) => ({ key: String(r.innings), label: `${ordinal(r.innings)} match innings`, order: r.innings });
    case 'res': return (r) => (r.result ? { key: r.result, label: RESULT_LABEL[r.result] ?? r.result, order: RESULT_ORDER[r.result] ?? 9 } : null);
    case 'rsq': return (r) => {
      if (!r.result || r.team_bat_first === null) return null;
      const second = options.tests ? 'batting second' : 'chasing';
      if (r.result === 'won' || r.result === 'lost') {
        const first = r.team_bat_first;
        return { key: `${r.result}-${first ? 'first' : 'second'}`, label: `${r.result === 'won' ? 'Won' : 'Lost'} ${first ? 'batting first' : second}`, order: (r.result === 'won' ? 0 : 2) + (first ? 0 : 1) };
      }
      return { key: 'other', label: options.tests ? 'Drawn or tied' : 'Tied or no result', order: 4 };
    };
    case 'trn': return (r) => tournamentType(r);
    case 'mno': return (r) => (r.match_number === null ? null : { key: String(r.match_number), label: `${options.tests ? 'Test' : 'Match'} ${r.match_number}`, order: r.match_number });
    case 'fin': return (r) => finalsKind(r);
    case 'pos': return (r) => {
      const p = (r as unknown as StatBat).position;
      return p === null || p === undefined ? null : { key: String(p), label: `Position ${p}`, order: p };
    };
  }
}

export type SortKey = 'label' | 'mat' | 'inns' | 'no' | 'runs' | 'hs' | 'avg' | 'bf' | 'sr' | 'hundreds' | 'fifties' | 'ducks' | 'fours' | 'sixes' | 'balls' | 'wkts' | 'bbi' | 'econ' | 'four' | 'five';

/** The number a column sorts by (null sorts last either way). */
export function sortValue(line: BatLine | BowlLine, key: SortKey): number | null {
  switch (key) {
    case 'bbi': { const b = line as BowlLine; return b.bbiW === null ? null : b.bbiW * 1000 - (b.bbiR ?? 0); }
    case 'hs': return (line as BatLine).hs;
    case 'avg': case 'sr': case 'econ': return (line as unknown as Record<string, number | null>)[key] ?? null;
    default: return ((line as unknown as Record<string, number>)[key] ?? null);
  }
}

/** Rows in the order they are drawn: by the split's own order, then the main figure (runs or wickets), most first. A column the reader chose sorts by that, with the label as the tie. */
export function sortGroups<I extends { group: { label: string; order: number }; line: BatLine | BowlLine }>(groups: readonly I[], sort: { key: SortKey; dir: 1 | -1 } | null, kind: Kind): I[] {
  const main: SortKey = kind === 'bat' ? 'runs' : 'wkts';
  const copy = [...groups];
  if (!sort) return copy.sort((a, b) => a.group.order - b.group.order || (sortValue(b.line, main) ?? -1) - (sortValue(a.line, main) ?? -1) || a.group.label.localeCompare(b.group.label));
  return copy.sort((a, b) => {
    if (sort.key === 'label') return sort.dir * a.group.label.localeCompare(b.group.label);
    const x = sortValue(a.line, sort.key), y = sortValue(b.line, sort.key);
    if (x === null && y === null) return a.group.label.localeCompare(b.group.label);
    if (x === null) return 1;
    if (y === null) return -1;
    return sort.dir * (x - y) || a.group.label.localeCompare(b.group.label);
  });
}

/** The strongest row for a column: the one a table highlights (the best average, the lowest economy), or null when there are fewer than two rows to compare. */
export function bestIndex(values: ReadonlyArray<number | null>, want: 'max' | 'min'): number {
  let best = -1;
  values.forEach((v, i) => {
    if (v === null || (want === 'min' && v <= 0)) return;
    if (best < 0 || (want === 'max' ? v > values[best]! : v < values[best]!)) best = i;
  });
  return values.filter((v) => v !== null).length > 1 ? best : -1;
}
