import type { SummaryRow } from './batting';

// Records: Career highs and Best performances. Everything is worked out from one row for each innings (bat_innings and bowl_innings in the export, Super Overs left
// out), so the numbers follow the Format, Competition and Season choices and the tiles never disagree with each other.

export interface BatInnings {
  match_id: number;
  innings: number;
  tournament_key: string | null;
  season: string;
  date: string;
  venue: string | null;
  team: string;
  opponent: string;
  /** The opponent's team id, for the link. */
  opponent_id?: string | null;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  is_out: boolean;
  balls_to_50: number | null;
  balls_to_100: number | null;
  chasing: boolean;
}

export interface BowlInnings {
  match_id: number;
  innings: number;
  format: string;
  tournament_key: string | null;
  season: string;
  date: string;
  venue: string | null;
  team: string;
  opponent: string;
  /** The opponent's team id, for the link. */
  opponent_id?: string | null;
  balls: number;
  runs: number;
  wickets: number;
  hat_tricks: number;
  maidens: number;
  dots: number;
  /** The spell is long enough for an economy to mean something (24 balls in T20, 30 in ODIs, 60 in Tests, 10 in The Hundred). */
  economy_counts: boolean;
}

export interface Card { value: string; label: string }

const int = new Intl.NumberFormat('en');
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const max = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => (b > a ? b : a)) : null);
const min = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => (b < a ? b : a)) : null);
const count = <T,>(xs: readonly T[], pick: (x: T) => boolean): number => xs.reduce((a, x) => a + (pick(x) ? 1 : 0), 0);
const many = (n: number, one: string, other: string): string => (n === 1 ? one : other);
const dash = (n: number | null, show: (v: number) => string = (v) => int.format(v)): string => (n === null ? '-' : show(n));

/** Overs as the scorecard writes them: 3.4 is three overs and four balls. */
export const oversOf = (balls: number): string => `${Math.floor(balls / 6)}${balls % 6 ? `.${balls % 6}` : ''}`;

/** The spell length an economy needs, written for the label: one format names its overs, a mix says what each format needs. */
function economyLabel(rows: readonly BowlInnings[], hundred: boolean, word: 'best' | 'worst'): string {
  if (hundred) return `${word} economy per 5 balls, 10 balls or more`;
  const formats = [...new Set(rows.map((r) => r.format))];
  const overs: Record<string, string> = { T20: '4 overs', ODI: '5 overs', TEST: '10 overs' };
  return formats.length === 1 && overs[formats[0]!] ? `${word} economy, ${overs[formats[0]!]} or more` : `${word} economy, 4 overs in T20, 5 in ODIs, 10 in Tests`;
}

/** Sums a value for each group (a season, a match, an opponent) and returns the groups. */
function grouped<T>(rows: readonly T[], key: (r: T) => string | number, fold: (rows: readonly T[]) => number): number[] {
  const map = new Map<string | number, T[]>();
  for (const r of rows) { const k = key(r); const list = map.get(k); if (list) list.push(r); else map.set(k, [r]); }
  return [...map.values()].map(fold);
}

/** The top score first, then fewest balls, then the latest match, then a fixed order so a refresh never reshuffles a tie. */
export function rankBatting(rows: readonly BatInnings[]): BatInnings[] {
  return [...rows].sort((a, b) => b.runs - a.runs || a.balls - b.balls || b.date.localeCompare(a.date) || b.match_id - a.match_id || b.innings - a.innings);
}

/** The most wickets first, then fewest runs, then the latest match. */
export function rankBowling(rows: readonly BowlInnings[]): BowlInnings[] {
  return [...rows].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs || b.date.localeCompare(a.date) || b.match_id - a.match_id || b.innings - a.innings);
}

const score = (r: Pick<BatInnings, 'runs' | 'is_out'>): string => `${r.runs}${r.is_out ? '' : '*'}`;
const figures = (wickets: number, runs: number): string => `${wickets}/${runs}`;

/** The best of a list of [wickets, runs] pairs: most wickets, then fewest runs. */
function bestFigures(pairs: ReadonlyArray<readonly [number, number]>): readonly [number, number] | null {
  let best: readonly [number, number] | null = null;
  for (const p of pairs) if (!best || p[0] > best[0] || (p[0] === best[0] && p[1] < best[1])) best = p;
  return best;
}

/**
 * The 16 batting cards. Fifties are 50 to 99 and hundreds 100 or more, as in the summary. A duck is 0 out. The best strike rate needs a score of 30 or more.
 * The biggest partnership comes from the partnership table (the batter and a partner, runs from both bats and the extras while they were in).
 */
export function battingCards(rows: readonly BatInnings[], biggestPartnership: number | null): Card[] {
  const ranked = rankBatting(rows);
  const top = ranked[0];
  const chase = ranked.find((r) => r.chasing);
  const seasonRuns = new Map<string, number>();
  for (const r of rows) seasonRuns.set(r.season, (seasonRuns.get(r.season) ?? 0) + r.runs);
  let bestSeason: [string, number] | null = null;
  for (const e of seasonRuns) if (!bestSeason || e[1] > bestSeason[1] || (e[1] === bestSeason[1] && e[0] > bestSeason[0])) bestSeason = e;
  const rate = max(rows.filter((r) => r.runs >= 30 && r.balls > 0).map((r) => (r.runs / r.balls) * 100));
  const hundreds = count(rows, (r) => r.runs >= 100), fifties = count(rows, (r) => r.runs >= 50 && r.runs < 100), ducks = count(rows, (r) => r.runs === 0 && r.is_out), notOuts = count(rows, (r) => !r.is_out);
  return [
    { value: top ? score(top) : '-', label: 'highest score' },
    { value: dash(min(rows.flatMap((r) => (r.balls_to_50 === null ? [] : [r.balls_to_50])))), label: 'balls for the fastest 50' },
    { value: dash(min(rows.flatMap((r) => (r.balls_to_100 === null ? [] : [r.balls_to_100])))), label: 'balls for the fastest 100' },
    { value: dash(max(rows.map((r) => r.sixes))), label: 'sixes in one innings' },
    { value: dash(max(rows.map((r) => r.fours))), label: 'fours in one innings' },
    { value: bestSeason ? int.format(bestSeason[1]) : '-', label: bestSeason ? `runs in the best season, ${bestSeason[0]}` : 'runs in the best season' },
    { value: dash(max(rows.map((r) => r.balls))), label: 'balls in the longest innings' },
    { value: chase ? score(chase) : '-', label: 'highest score chasing' },
    { value: int.format(hundreds), label: many(hundreds, 'hundred', 'hundreds') },
    { value: int.format(fifties), label: many(fifties, 'fifty', 'fifties') },
    { value: int.format(ducks), label: many(ducks, 'duck', 'ducks') },
    { value: int.format(notOuts), label: many(notOuts, 'not out', 'not outs') },
    { value: dash(biggestPartnership), label: 'biggest partnership' },
    { value: dash(rate, (v) => v.toFixed(1)), label: 'best strike rate in an innings of 30 or more' },
    { value: int.format(sum(rows.map((r) => r.runs))), label: many(sum(rows.map((r) => r.runs)), 'run', 'runs') },
    { value: int.format(new Set(rows.map((r) => r.match_id)).size), label: many(new Set(rows.map((r) => r.match_id)).size, 'match', 'matches') },
  ];
}

/**
 * The 16 bowling cards. A match is every innings the bowler bowled in it. Balls, economy and maidens leave The Hundred out unless every innings is The Hundred's, since
 * it has five-ball sets and no maidens, and then they are in balls and per five balls, with dot balls in place of maidens.
 */
export function bowlingCards(rows: readonly BowlInnings[]): Card[] {
  const hundred = rows.length > 0 && rows.every((r) => r.tournament_key === 'hnd');
  const timed = hundred ? rows : rows.filter((r) => r.tournament_key !== 'hnd');
  const per = hundred ? 5 : 6;
  const econ = (r: BowlInnings): number => (r.runs / r.balls) * per;
  const counted = timed.filter((r) => r.economy_counts && r.balls > 0);
  const byMatch = (pick: (r: BowlInnings) => number) => grouped(rows, (r) => r.match_id, (g) => sum(g.map(pick)));
  const matchFigures = (() => { const map = new Map<number, [number, number]>(); for (const r of rows) { const m = map.get(r.match_id) ?? [0, 0]; m[0] += r.wickets; m[1] += r.runs; map.set(r.match_id, m); } return [...map.values()]; })();
  const opponentFigures = (() => { const map = new Map<string, [number, number]>(); for (const r of rows) { const m = map.get(r.opponent) ?? [0, 0]; m[0] += r.wickets; m[1] += r.runs; map.set(r.opponent, m); } return [...map.values()]; })();
  const seasonWickets = grouped(rows, (r) => r.season, (g) => sum(g.map((r) => r.wickets)));
  const best = bestFigures(rows.map((r) => [r.wickets, r.runs] as const));
  const bestMatch = bestFigures(matchFigures);
  const bestOpponent = bestFigures(opponentFigures);
  const wickets = sum(rows.map((r) => r.wickets));
  const fiveFors = count(rows, (r) => r.wickets >= 5), hatTricks = sum(rows.map((r) => r.hat_tricks)), withWicket = count(rows, (r) => r.wickets > 0), tenFors = count(byMatch((r) => r.wickets), (w) => w >= 10);
  const balls = sum(timed.map((r) => r.balls));
  const worst = max(counted.map(econ));
  const bestEcon = min(counted.map(econ));
  const ballsText = (b: number): string => (hundred ? int.format(b) : oversOf(b));
  const innings = timed.length;
  return [
    { value: best ? figures(best[0], best[1]) : '-', label: 'best figures' },
    { value: bestMatch ? figures(bestMatch[0], bestMatch[1]) : '-', label: 'best match figures' },
    { value: int.format(fiveFors), label: many(fiveFors, 'five-wicket haul', 'five-wicket hauls') },
    { value: dash(max(seasonWickets)), label: 'wickets in the best season' },
    { value: dash(bestEcon, (v) => v.toFixed(2)), label: economyLabel(timed, hundred, 'best') },
    { value: dash(max(timed.map((r) => r.balls)), ballsText), label: hundred ? 'balls in the longest spell' : 'overs in the longest spell' },
    { value: int.format(hatTricks), label: many(hatTricks, 'hat-trick', 'hat-tricks') },
    { value: dash(max(timed.map((r) => (hundred ? r.dots : r.maidens)))), label: hundred ? 'dot balls in one innings' : 'maidens in one innings' },
    { value: int.format(wickets), label: many(wickets, 'wicket', 'wickets') },
    { value: int.format(withWicket), label: many(withWicket, 'innings with a wicket', 'innings with a wicket') },
    { value: bestOpponent ? figures(bestOpponent[0], bestOpponent[1]) : '-', label: 'best figures against one opponent' },
    { value: int.format(tenFors), label: many(tenFors, 'ten-wicket match', 'ten-wicket matches') },
    { value: wickets > 0 && balls > 0 ? (balls / wickets).toFixed(1) : '-', label: 'balls per wicket' },
    { value: dash(worst, (v) => v.toFixed(2)), label: economyLabel(timed, hundred, 'worst') },
    { value: innings > 0 ? (hundred ? (balls / innings).toFixed(1) : (balls / 6 / innings).toFixed(1)) : '-', label: hundred ? 'balls bowled per innings' : 'overs bowled per innings' },
    { value: int.format(new Set(rows.map((r) => r.match_id)).size), label: many(new Set(rows.map((r) => r.match_id)).size, 'match', 'matches') },
  ];
}

export interface ListRow { key: string; rank: number; matchId: number; main: string; detail: string; opponent: string; opponentName: string; opponentId: string | null; where: string; search: string }

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function when(date: string): string { const d = new Date(`${date}T00:00:00`); return Number.isNaN(d.getTime()) ? date : day.format(d); }
const place = (venue: string | null, date: string): string => `${venue ?? 'Unknown ground'}, ${when(date)}`;

/** Every innings, ranked, in the shape the Best performances list draws. `search` is what the search box matches: opponent, ground, year and score. */
export function battingList(rows: readonly BatInnings[]): ListRow[] {
  return rankBatting(rows).map((r, i) => ({
    key: `${r.match_id}:${r.innings}`, rank: i + 1, matchId: r.match_id, main: score(r),
    detail: `${r.balls} ${r.balls === 1 ? 'ball' : 'balls'}, SR ${r.balls > 0 ? ((r.runs / r.balls) * 100).toFixed(0) : '-'}`,
    opponent: `v ${r.opponent}`, opponentName: r.opponent, opponentId: r.opponent_id ?? null, where: place(r.venue, r.date),
    search: `${r.opponent} ${r.venue ?? ''} ${r.date.slice(0, 4)} ${when(r.date)} ${score(r)}`.toLowerCase(),
  }));
}

export function bowlingList(rows: readonly BowlInnings[]): ListRow[] {
  return rankBowling(rows).map((r, i) => {
    const hundred = r.tournament_key === 'hnd';
    const e = r.balls > 0 ? (r.runs / r.balls) * (hundred ? 5 : 6) : null;
    return {
      key: `${r.match_id}:${r.innings}`, rank: i + 1, matchId: r.match_id, main: figures(r.wickets, r.runs),
      detail: hundred ? `${r.balls} balls, econ (5) ${e === null ? '-' : e.toFixed(2)}` : `${oversOf(r.balls)} overs, econ ${e === null ? '-' : e.toFixed(2)}`,
      opponent: `v ${r.opponent}`, opponentName: r.opponent, opponentId: r.opponent_id ?? null, where: place(r.venue, r.date),
      search: `${r.opponent} ${r.venue ?? ''} ${r.date.slice(0, 4)} ${when(r.date)} ${figures(r.wickets, r.runs)}`.toLowerCase(),
    };
  });
}

/** The rows a search keeps, in rank order. An empty search keeps every row. */
export function searchRows(rows: readonly ListRow[], text: string): ListRow[] {
  const t = text.trim().toLowerCase();
  return t ? rows.filter((r) => r.search.includes(t)) : [...rows];
}

/**
 * Which sides of Records a player gets, judged on the whole career and never on the filters: a batter has 1,000 career runs at an average of 20 or more, a bowler has
 * 50 career wickets, and someone who is neither shows as a batter. A player who is both shows both.
 */
export function recordSides(rows: readonly SummaryRow[]): { bat: boolean; bowl: boolean } {
  const runs = sum(rows.map((r) => r.runs ?? 0)), outs = sum(rows.map((r) => r.dismissals ?? 0)), wickets = sum(rows.map((r) => r.wickets ?? 0));
  const batOk = runs >= 1000 && runs / Math.max(1, outs) >= 20;
  const bowlOk = wickets >= 50;
  return { bat: batOk || !bowlOk, bowl: bowlOk };
}
