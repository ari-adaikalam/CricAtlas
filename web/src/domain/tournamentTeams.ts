import { decided, editionLabel, isKnockout, isLeague, quotaBalls, type Fmt, type TInnings, type TMatch } from './tournament';

// The numbers behind the Teams and matches view. A match with no result is left out of results, scores and margins, and counted in the matches played.

type Innings = ReadonlyMap<number, readonly TInnings[]>;
const mean = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null);
const innOf = (ms: readonly TMatch[], innings: Innings): Array<TInnings & { m: TMatch }> => ms.filter(decided).flatMap((m) => (innings.get(m.id) ?? []).map((i) => ({ ...i, m })));

// ---- Team records -----------------------------------------------------------------------------------

export interface TeamRecord { id: string; name: string; editions: number; played: number; won: number; lost: number; other: number; nr: number; rate: number | null; titles: number; avgFor: number | null; avgAgainst: number | null }
export type RecordKey = 'name' | 'editions' | 'played' | 'won' | 'lost' | 'other' | 'nr' | 'rate' | 'titles' | 'avgFor' | 'avgAgainst';
export interface RecordSort { key: RecordKey; dir: 1 | -1 }

/** One row for each team in the matches. Tie and draw are one column; a tie settled by a Super Over is a win for its winner. Titles are Finals won in the matches given. */
export function teamRecords(ms: readonly TMatch[], innings: Innings, names: ReadonlyMap<string, string>): TeamRecord[] {
  const ids = new Set(ms.flatMap((m) => [m.team1Id, m.team2Id]));
  const inn = innOf(ms, innings);
  return [...ids].map((id): TeamRecord => {
    const mine = ms.filter((m) => m.team1Id === id || m.team2Id === id);
    const won = mine.filter((m) => m.winnerId === id).length, lost = mine.filter((m) => m.winnerId && m.winnerId !== id).length;
    const nr = mine.filter((m) => !decided(m)).length, other = mine.length - won - lost - nr;
    return {
      id, name: names.get(id) ?? id, editions: new Set(mine.map((m) => m.edition)).size, played: mine.length, won, lost, other, nr, rate: mine.length - nr ? won / (mine.length - nr) : null,
      titles: mine.filter((m) => m.stageName === 'Final' && m.winnerId === id).length,
      avgFor: mean(inn.filter((i) => i.batId === id && !i.superOver).map((i) => i.runs)), avgAgainst: mean(inn.filter((i) => i.bowlId === id && !i.superOver).map((i) => i.runs)),
    };
  });
}

export function sortRecords(rows: readonly TeamRecord[], s: RecordSort): TeamRecord[] {
  const val = (r: TeamRecord): number | string => r[s.key] ?? -Infinity;
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    const d = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
    return s.dir * d || (b.rate ?? 0) - (a.rate ?? 0) || a.name.localeCompare(b.name);
  });
}

// ---- Bat first or chase, toss -----------------------------------------------------------------------

export interface BatFirst { matches: number; draws: number; batFirstWon: number; batSecondWon: number; avgFirst: number | null; avgSecond: number | null }
export function batFirstSplit(ms: readonly TMatch[], innings: Innings): BatFirst {
  const d = ms.filter((m) => decided(m) && m.batFirstId);
  const win = d.filter((m) => m.winnerId);
  const inn = innOf(d, innings).filter((i) => !i.superOver);
  return {
    matches: d.length, draws: d.length - win.length, batFirstWon: win.filter((m) => m.winnerId === m.batFirstId).length, batSecondWon: win.filter((m) => m.winnerId !== m.batFirstId).length,
    avgFirst: mean(inn.filter((i) => i.inn === 1).map((i) => i.runs)), avgSecond: mean(inn.filter((i) => i.inn === 2).map((i) => i.runs)),
  };
}

export interface TossChoice { choice: 'bat' | 'field'; matches: number; won: number; lost: number; other: number; rate: number | null }
export interface TossSummary { decided: number; tossWinnerWon: number; withWinner: number; batShare: number | null; bat: TossChoice; field: TossChoice; bars: Array<{ label: string; value: number | null; n: number }>; byEdition: boolean }

/** How the toss winner fared. The bars are by edition when more than one is in scope, otherwise league stage against knockouts. */
export function tossSummary(ms: readonly TMatch[]): TossSummary {
  const d = ms.filter((m) => decided(m) && m.tossWinnerId);
  const win = d.filter((m) => m.winnerId);
  const choice = (c: 'bat' | 'field'): TossChoice => {
    const xs = d.filter((m) => m.tossDecision === c), w = xs.filter((m) => m.winnerId && m.winnerId === m.tossWinnerId).length, o = xs.filter((m) => !m.winnerId).length;
    return { choice: c, matches: xs.length, won: w, lost: xs.length - w - o, other: o, rate: xs.length - o ? w / (xs.length - o) : null };
  };
  const rate = (xs: readonly TMatch[]): number | null => { const n = xs.filter((m) => m.winnerId); return n.length ? (n.filter((m) => m.winnerId === m.tossWinnerId).length / n.length) * 100 : null; };
  const editions = [...new Set(d.map((m) => m.edition))].sort();
  const byEdition = editions.length > 1;
  const groups: Array<[string, TMatch[]]> = byEdition ? editions.map((e) => [editionLabel(e).slice(2), d.filter((m) => m.edition === e)]) : [['League stage', d.filter(isLeague)], ['Knockouts', d.filter(isKnockout)]];
  return {
    decided: d.length, tossWinnerWon: win.filter((m) => m.winnerId === m.tossWinnerId).length, withWinner: win.length, batShare: d.length ? d.filter((m) => m.tossDecision === 'bat').length / d.length : null,
    bat: choice('bat'), field: choice('field'), bars: groups.map(([label, xs]) => ({ label, value: rate(xs), n: xs.filter((m) => m.winnerId).length })), byEdition,
  };
}

// ---- Venues -----------------------------------------------------------------------------------------

export interface VenueRow { venue: string; played: number; avgFirst: number | null; batFirstRate: number | null; highest: number | null; lowestOut: number | null }
export type VenueKey = keyof VenueRow;
export interface VenueSort { key: VenueKey; dir: 1 | -1 }

export function venueRows(ms: readonly TMatch[], innings: Innings): VenueRow[] {
  const by = new Map<string, TMatch[]>();
  for (const m of ms) if (m.venue) { const l = by.get(m.venue); if (l) l.push(m); else by.set(m.venue, [m]); }
  return [...by.entries()].map(([venue, xs]): VenueRow => {
    const inn = innOf(xs, innings).filter((i) => !i.superOver);
    const win = xs.filter((m) => decided(m) && m.winnerId && m.batFirstId);
    const out = inn.filter((i) => i.wkts >= 10).map((i) => i.runs);
    return {
      venue, played: xs.length, avgFirst: mean(inn.filter((i) => i.inn === 1).map((i) => i.runs)), batFirstRate: win.length ? (win.filter((m) => m.winnerId === m.batFirstId).length / win.length) * 100 : null,
      highest: inn.length ? Math.max(...inn.map((i) => i.runs)) : null, lowestOut: out.length ? Math.min(...out) : null,
    };
  });
}
export function sortVenues(rows: readonly VenueRow[], s: VenueSort): VenueRow[] {
  return [...rows].sort((a, b) => {
    const x = a[s.key] ?? -Infinity, y = b[s.key] ?? -Infinity;
    return s.dir * (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) || b.played - a.played || a.venue.localeCompare(b.venue);
  });
}

// ---- Totals, wins and close finishes ----------------------------------------------------------------

export interface TotalLine { matchId: number; batId: string; bowlId: string; runs: number; wkts: number; edition: string }
export interface Totals { highest: TotalLine[]; lowest: TotalLine[]; par: number; atPar: number }
/** The highest totals and the lowest by a side that was all out, with how many reached a mark that depends on the format. */
export function totals(ms: readonly TMatch[], innings: Innings, format: Fmt): Totals {
  const inn = innOf(ms, innings).filter((i) => !i.superOver);
  const line = (i: TInnings & { m: TMatch }): TotalLine => ({ matchId: i.matchId, batId: i.batId, bowlId: i.bowlId, runs: i.runs, wkts: i.wkts, edition: i.m.edition });
  const par = format === 'HUNDRED' ? 150 : format === 'TEST' ? 400 : format === 'ODI' ? 250 : 160;
  return { highest: [...inn].sort((a, b) => b.runs - a.runs).map(line), lowest: inn.filter((i) => i.wkts >= 10).sort((a, b) => a.runs - b.runs).map(line), par, atPar: inn.filter((i) => i.runs >= par).length };
}

export interface Margin { m: TMatch; value: number; ballsLeft: number }
export interface Wins { byRuns: Margin[]; byWickets: Margin[]; tens: number; avgRuns: number | null }
const chaseLeft = (m: TMatch, innings: Innings): number => {
  const c = (innings.get(m.id) ?? []).find((i) => i.inn === 2 && !i.superOver);
  return c && m.format !== 'TEST' ? Math.max(0, quotaBalls(m, 2) - c.balls) : 0;
};
function margins(ms: readonly TMatch[], innings: Innings): { byRuns: Margin[]; byWickets: Margin[] } {
  const won = ms.filter((m) => decided(m) && m.winnerId && m.outcome !== 'tie');
  return {
    byRuns: won.filter((m) => m.byRuns !== null).map((m) => ({ m, value: m.byRuns!, ballsLeft: 0 })),
    byWickets: won.filter((m) => m.byWkts !== null && m.byRuns === null).map((m) => ({ m, value: m.byWkts!, ballsLeft: chaseLeft(m, innings) })),
  };
}
/** The biggest wins by runs and by wickets (more balls left breaks a tie). A win by an innings counts by its runs. */
export function biggestWins(ms: readonly TMatch[], innings: Innings): Wins {
  const { byRuns, byWickets } = margins(ms, innings);
  const batFirst = byRuns.filter((x) => x.m.winnerId === x.m.batFirstId);
  return { byRuns: byRuns.sort((a, b) => b.value - a.value), byWickets: byWickets.sort((a, b) => b.value - a.value || b.ballsLeft - a.ballsLeft), tens: byWickets.filter((x) => x.value === 10).length, avgRuns: mean(batFirst.map((x) => x.value)) };
}

export interface Closest { byRuns: Margin[]; byWickets: Margin[]; ties: number; tight: number; tightRuns: number }
/** The narrowest wins by runs and by wickets (fewer balls left breaks a tie), the ties, and the finishes by 5 runs or fewer (10 in a Test) or by one wicket. */
export function closestFinishes(ms: readonly TMatch[], innings: Innings, format: Fmt): Closest {
  const { byRuns, byWickets } = margins(ms, innings);
  const tightRuns = format === 'TEST' ? 10 : 5;
  return {
    byRuns: byRuns.sort((a, b) => a.value - b.value), byWickets: byWickets.sort((a, b) => a.value - b.value || a.ballsLeft - b.ballsLeft),
    ties: ms.filter((m) => decided(m) && m.outcome === 'tie').length, tight: byRuns.filter((x) => x.value <= tightRuns).length + byWickets.filter((x) => x.value <= 1).length, tightRuns,
  };
}

// ---- Match list -------------------------------------------------------------------------------------

/** Matches matching a typed text: teams, the player of the match, the edition or the stage. Sorted by date, oldest first or newest first. */
export function matchList(ms: readonly TMatch[], text: string, newestFirst: boolean): TMatch[] {
  const q = text.trim().toLowerCase();
  const hit = (m: TMatch): boolean => !q || `${m.team1} ${m.team2} ${m.potm ?? ''} ${editionLabel(m.edition)} ${m.stageName ?? ''} ${m.venue ?? ''}`.toLowerCase().includes(q);
  return ms.filter(hit).sort((a, b) => (newestFirst ? -1 : 1) * (a.date.localeCompare(b.date) || a.id - b.id));
}
