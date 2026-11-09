import { FORMAT_CHOICES, FORMAT_NAME, type FormatChoice } from './filters';

// The Team page's facts and scope. Everything here works on the rows of the team's own files (tools/team_files.py) and runs in the browser with no query engine.

export type MatchKind = 'test' | 'odi' | 't20' | 'hundred';
export type Result = 'won' | 'lost' | 'draw' | 'tie' | 'nr';

/** One match from the team's side. */
export interface TeamMatch {
  id: number;
  date: string;
  season: string;
  /** Calendar year of the start date. A national team's seasons are years. */
  year: number;
  format: string;
  kind: MatchKind;
  /** The competition key, null for a bilateral series. */
  tk: string | null;
  tname: string | null;
  tkind: string | null;
  league: boolean;
  event: string | null;
  edition: string | null;
  stageClass: string | null;
  stageName: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  opp: string;
  oppId: string;
  tossWon: boolean | null;
  tossDecision: string | null;
  result: Result;
  /** A tie decided by a Super Over: the result is won or lost and this is true. */
  tied: boolean;
  byRuns: number | null;
  byWkts: number | null;
  byInnings: boolean;
  scheduledOvers: number | null;
  batFirst: boolean | null;
  potmId: string | null;
  potm: string | null;
  tracked: number;
  trackedOf: number;
  dropped: number;
}

/** One innings of a match, for the team (`for`) or against it. */
export interface TeamInnings {
  matchId: number;
  inn: number;
  side: 'for' | 'against';
  superOver: boolean;
  runs: number;
  wkts: number;
  balls: number;
  wides: number;
  noballs: number;
  byes: number;
  legbyes: number;
  penalty: number;
  fours: number;
  sixes: number;
  declared: boolean;
}

export interface TeamInfo {
  id: string;
  name: string;
  gender: 'male' | 'female';
  national: boolean;
  matches: number;
  firstYear: number;
  lastYear: number;
  hasReviews: boolean;
}

export interface TeamFilters {
  format: FormatChoice;
  competition: string | null;
  season: string | null;
  opponent: string | null;
  venue: string | null;
}

export const kindOf = (format: string, type: string): MatchKind => (type === 'Fran(Hundred)' ? 'hundred' : format === 'TEST' ? 'test' : format === 'ODI' ? 'odi' : 't20');

export function seasonOf(m: TeamMatch, national: boolean): string { return national ? String(m.year) : m.season; }

// ---- The scope: Format, Competition, Season, Opponent, Venue --------------------------------

const isIntl = (m: TeamMatch): boolean => !m.league;
const SINGLE: Record<'TEST' | 'ODI' | 'T20I', (m: TeamMatch) => boolean> = {
  TEST: (m) => m.format === 'TEST',
  ODI: (m) => m.format === 'ODI',
  T20I: (m) => m.format === 'T20' && isIntl(m),
};

export function inFormat(m: TeamMatch, format: FormatChoice): boolean {
  switch (format) {
    case 'TEST': case 'ODI': case 'T20I': return SINGLE[format](m);
    case 'T20S': return m.format === 'T20';
    case 'LEAGUE': return m.league;
    case 'INTERNATIONAL': return isIntl(m);
  }
}

export interface FormatOption { format: FormatChoice; disabled: boolean }
export interface CompetitionOption { key: string; name: string; matches: number; league: boolean; hasMatches: boolean }
export interface ValueOption { value: string; name: string; matches: number }

const t20Competitions = (ms: readonly TeamMatch[]): number => (ms.some(SINGLE.T20I) ? 1 : 0) + new Set(ms.filter((m) => m.league).map((m) => m.tk ?? '')).size;

/** The formats the team has: International with two or more of Tests, ODIs and T20Is, each of them, T20s with two or more T20 competitions, then League (only a league competition sets it). */
export function formatOptions(ms: readonly TeamMatch[], current: FormatChoice): FormatOption[] {
  const intl = (['TEST', 'ODI', 'T20I'] as const).filter((f) => ms.some(SINGLE[f]));
  const out: FormatOption[] = [];
  if (intl.length > 1) out.push({ format: 'INTERNATIONAL', disabled: false });
  intl.forEach((format) => out.push({ format, disabled: false }));
  if (t20Competitions(ms) > 1) out.push({ format: 'T20S', disabled: false });
  if (ms.some((m) => m.league) || current === 'LEAGUE') out.push({ format: 'LEAGUE', disabled: true });
  return out;
}

/** The tournaments the team has matches in. Bilateral series have no key and stay in All competitions. A league team lists its leagues and a national team its international tournaments. */
export function competitionOptions(ms: readonly TeamMatch[], format: FormatChoice): CompetitionOption[] {
  const by = new Map<string, CompetitionOption>();
  for (const m of ms) {
    if (!m.tk) continue;
    const e = by.get(m.tk) ?? { key: m.tk, name: m.tname ?? m.tk, matches: 0, league: m.league, hasMatches: false };
    e.matches += 1;
    if (inFormat(m, format)) e.hasMatches = true;
    by.set(m.tk, e);
  }
  return [...by.values()].sort((a, b) => Number(a.league) - Number(b.league) || b.matches - a.matches);
}

/** The matches under Format and Competition, with Season, Opponent and Venue each applied or not. The option lists of those three are made from this. */
function scoped(ms: readonly TeamMatch[], f: TeamFilters, national: boolean, skip: ReadonlySet<'season' | 'opponent' | 'venue'>): TeamMatch[] {
  return ms.filter((m) => inFormat(m, f.format) && (f.competition === null || m.tk === f.competition)
    && (skip.has('season') || f.season === null || seasonOf(m, national) === f.season)
    && (skip.has('opponent') || f.opponent === null || m.oppId === f.opponent)
    && (skip.has('venue') || f.venue === null || m.venue === f.venue));
}

export function applyFilters(ms: readonly TeamMatch[], f: TeamFilters, national: boolean): TeamMatch[] { return scoped(ms, f, national, new Set()); }

/** Seasons with matches under the other choices, newest first. */
export function seasonOptions(ms: readonly TeamMatch[], f: TeamFilters, national: boolean): string[] {
  return [...new Set(scoped(ms, f, national, new Set(['season'])).map((m) => seasonOf(m, national)))].sort().reverse();
}

export function opponentOptions(ms: readonly TeamMatch[], f: TeamFilters, national: boolean): ValueOption[] {
  const by = new Map<string, ValueOption>();
  for (const m of scoped(ms, f, national, new Set(['opponent']))) {
    const e = by.get(m.oppId) ?? { value: m.oppId, name: m.opp, matches: 0 };
    e.matches += 1; by.set(m.oppId, e);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function venueOptions(ms: readonly TeamMatch[], f: TeamFilters, national: boolean): ValueOption[] {
  const by = new Map<string, ValueOption>();
  for (const m of scoped(ms, f, national, new Set(['venue']))) {
    if (!m.venue) continue;
    const e = by.get(m.venue) ?? { value: m.venue, name: m.venue, matches: 0 };
    e.matches += 1; by.set(m.venue, e);
  }
  return [...by.values()].sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
}

const total = (ms: readonly TeamMatch[], pick: (m: TeamMatch) => boolean): number => ms.reduce((a, m) => a + (pick(m) ? 1 : 0), 0);

/** Where the page opens: a national team on its busiest international format, a league team on its busiest league. */
export function defaultFilters(ms: readonly TeamMatch[]): TeamFilters | null {
  const none = { opponent: null, venue: null, season: null } as const;
  const first = (['TEST', 'ODI', 'T20I'] as const).filter((f) => ms.some(SINGLE[f])).sort((a, b) => total(ms, SINGLE[b]) - total(ms, SINGLE[a]))[0];
  if (first) return { format: first, competition: null, ...none };
  const league = competitionOptions(ms, 'LEAGUE').filter((o) => o.league).sort((a, b) => b.matches - a.matches)[0];
  return league ? { format: 'LEAGUE', competition: league.key, ...none } : null;
}

/** Drops any choice that has no matches under the ones before it (Format, then Competition, then Season, Opponent and Venue). */
export function normaliseFilters(ms: readonly TeamMatch[], f: TeamFilters, national: boolean): TeamFilters | null {
  const fallback = defaultFilters(ms);
  if (!fallback) return null;
  const allowed = formatOptions(ms, f.format);
  const format = f.format === 'LEAGUE' && f.competition !== null ? 'LEAGUE' : allowed.some((o) => o.format === f.format && !o.disabled) ? f.format : fallback.format;
  const competition = f.competition !== null && competitionOptions(ms, format).some((o) => o.key === f.competition && o.hasMatches) ? f.competition : null;
  if (format === 'LEAGUE' && competition === null) return fallback;
  const base: TeamFilters = { format, competition, season: null, opponent: null, venue: null };
  const season = f.season !== null && seasonOptions(ms, base, national).includes(f.season) ? f.season : null;
  const withSeason = { ...base, season };
  const opponent = f.opponent !== null && opponentOptions(ms, withSeason, national).some((o) => o.value === f.opponent) ? f.opponent : null;
  const withOpp = { ...withSeason, opponent };
  const venue = f.venue !== null && venueOptions(ms, withOpp, national).some((o) => o.value === f.venue) ? f.venue : null;
  return { format, competition, season, opponent, venue };
}

export const chooseFormat = (format: FormatChoice): TeamFilters => ({ format, competition: null, season: null, opponent: null, venue: null });

/** A competition choice moves Format to one that has its matches, as on the player page: a league sets League, an international tournament keeps the format when it has matches there and otherwise takes the team's busiest. */
export function chooseCompetition(ms: readonly TeamMatch[], current: TeamFilters, key: string | null): TeamFilters {
  const clear = { season: null, opponent: null, venue: null } as const;
  if (key === null) return { ...current, ...clear, competition: null, format: current.format === 'LEAGUE' ? (defaultFilters(ms)?.format ?? current.format) : current.format };
  const inT = ms.filter((m) => m.tk === key);
  if (inT.some((m) => m.league)) return { format: 'LEAGUE', competition: key, ...clear };
  if (inT.some((m) => inFormat(m, current.format))) return { format: current.format, competition: key, ...clear };
  const busiest = (['TEST', 'ODI', 'T20I'] as const).filter((f) => inT.some(SINGLE[f])).sort((a, b) => total(inT, SINGLE[b]) - total(inT, SINGLE[a]))[0];
  return { format: busiest ?? current.format, competition: key, ...clear };
}

/** The Bat, bowl and field view mixes no formats (rates share no scale): International becomes the team's first format. */
export function forBatBowl(ms: readonly TeamMatch[], f: TeamFilters): { filters: TeamFilters; note: string | null } {
  if (f.format !== 'INTERNATIONAL') return { filters: f, note: null };
  const first = (['TEST', 'ODI', 'T20I'] as const).filter((x) => ms.some(SINGLE[x])).sort((a, b) => total(ms, SINGLE[b]) - total(ms, SINGLE[a]))[0] ?? 'TEST';
  return { filters: { ...f, format: first, competition: null, season: f.season }, note: `International is not available here. Showing ${FORMAT_NAME[first]}.` };
}

const SAFE = /^[A-Za-z0-9_/ .|~'&()-]{1,80}$/;
export function filtersFromParams(p: URLSearchParams): Partial<TeamFilters> {
  const pick = (k: string): string | undefined => { const v = p.get(k); return v !== null && SAFE.test(v) ? v : undefined; };
  const out: Partial<TeamFilters> = {};
  const format = pick('format'); if (format && (FORMAT_CHOICES as readonly string[]).includes(format)) out.format = format as FormatChoice;
  const competition = pick('competition'); if (competition) out.competition = competition;
  const season = pick('season'); if (season) out.season = season;
  const opponent = pick('opponent'); if (opponent) out.opponent = opponent;
  const venue = pick('venue'); if (venue) out.venue = venue;
  return out;
}

export function filtersToParams(f: TeamFilters): URLSearchParams {
  const p = new URLSearchParams({ format: f.format });
  if (f.competition) p.set('competition', f.competition);
  if (f.season) p.set('season', f.season);
  if (f.opponent) p.set('opponent', f.opponent);
  if (f.venue) p.set('venue', f.venue);
  return p;
}

// ---- Results ---------------------------------------------------------------------------------

export interface Counts { played: number; won: number; lost: number; draw: number; tie: number; nr: number; other: number; rate: number | null }

/** The win rate is wins over the matches that had a result: a draw or a tie is not a win, a no result is left out (and counted on its own). */
export function counts(ms: readonly TeamMatch[]): Counts {
  const c = (r: Result): number => total(ms, (m) => m.result === r);
  const won = c('won'), lost = c('lost'), draw = c('draw'), tie = c('tie'), nr = c('nr');
  const decided = ms.length - nr;
  return { played: ms.length, won, lost, draw, tie, nr, other: draw + tie + nr, rate: decided > 0 ? won / decided : null };
}

export const sortByDate = (ms: readonly TeamMatch[]): TeamMatch[] => [...ms].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

export interface Run { result: Result; length: number }
/** The run of one result the team is on at the end of the list, and the longest run of a result. */
export function currentRun(ms: readonly TeamMatch[]): Run | null {
  const sorted = sortByDate(ms);
  const last = sorted[sorted.length - 1];
  if (!last) return null;
  let n = 0;
  for (let i = sorted.length - 1; i >= 0 && sorted[i]!.result === last.result; i--) n += 1;
  return { result: last.result, length: n };
}
export function longestRun(ms: readonly TeamMatch[], result: Result): number {
  let best = 0, cur = 0;
  for (const m of sortByDate(ms)) { cur = m.result === result ? cur + 1 : 0; best = Math.max(best, cur); }
  return best;
}

export interface MatchScore { text: string; runs: number }

/** What a side scored in a match: "287/4", or for a Test "358 & 192/6d". A side that did not bat has an empty text. */
export function scoreOf(innings: readonly TeamInnings[], matchId: number, side: 'for' | 'against'): string {
  return innings.filter((i) => i.matchId === matchId && i.side === side && !i.superOver).sort((a, b) => a.inn - b.inn)
    .map((i) => `${i.runs}${i.wkts >= 10 ? '' : `/${i.wkts}`}${i.declared ? 'd' : ''}`).join(' & ');
}

export function totalOf(innings: readonly TeamInnings[], matchId: number, side: 'for' | 'against'): number {
  return innings.filter((i) => i.matchId === matchId && i.side === side && !i.superOver).reduce((a, i) => a + i.runs, 0);
}

export interface InningsIndex { byMatch: ReadonlyMap<number, readonly TeamInnings[]> }
export function indexInnings(innings: readonly TeamInnings[]): ReadonlyMap<number, TeamInnings[]> {
  const by = new Map<number, TeamInnings[]>();
  for (const i of innings) { const l = by.get(i.matchId); if (l) l.push(i); else by.set(i.matchId, [i]); }
  return by;
}

export function marginText(m: TeamMatch): string {
  if (m.result === 'draw') return 'drawn';
  if (m.result === 'tie') return 'tied';
  if (m.result === 'nr') return 'no result';
  const by = m.byInnings && m.byRuns !== null ? `an innings and ${m.byRuns} runs` : m.byRuns !== null ? `${m.byRuns} ${m.byRuns === 1 ? 'run' : 'runs'}` : m.byWkts !== null ? `${m.byWkts} ${m.byWkts === 1 ? 'wicket' : 'wickets'}` : null;
  const word = m.result === 'won' ? 'Won' : 'Lost';
  return by ? `${word} by ${by}${m.tied ? ' (Super Over)' : ''}` : `${word}${m.tied ? ' (Super Over)' : ''}`;
}

export interface KeyNumbers {
  counts: Counts;
  titles: number;
  highest: { runs: number; matchId: number; opp: string } | null;
  lowest: { runs: number; matchId: number; opp: string } | null;
  bigRuns: { text: string; matchId: number; opp: string } | null;
  bigWkts: { text: string; matchId: number; opp: string } | null;
  winRun: number;
}

/** The key numbers of the matches in scope. The lowest total is the lowest of an innings in which the side was all out. */
export function keyNumbers(ms: readonly TeamMatch[], innings: ReadonlyMap<number, readonly TeamInnings[]>, titles: number): KeyNumbers {
  const opp = new Map(ms.map((m) => [m.id, m.opp]));
  let highest: KeyNumbers['highest'] = null, lowest: KeyNumbers['lowest'] = null;
  for (const m of ms) {
    for (const i of innings.get(m.id) ?? []) {
      if (i.side !== 'for' || i.superOver) continue;
      if (!highest || i.runs > highest.runs) highest = { runs: i.runs, matchId: m.id, opp: m.opp };
      if (i.wkts >= 10 && (!lowest || i.runs < lowest.runs)) lowest = { runs: i.runs, matchId: m.id, opp: m.opp };
    }
  }
  const wins = ms.filter((m) => m.result === 'won');
  const byRuns = wins.filter((m) => m.byRuns !== null).sort((a, b) => Number(b.byInnings) - Number(a.byInnings) || (b.byRuns ?? 0) - (a.byRuns ?? 0))[0];
  const byWkts = wins.filter((m) => m.byWkts !== null).sort((a, b) => (b.byWkts ?? 0) - (a.byWkts ?? 0))[0];
  void opp;
  return {
    counts: counts(ms), titles, highest, lowest,
    bigRuns: byRuns ? { text: byRuns.byInnings ? `an innings and ${byRuns.byRuns} runs` : `${byRuns.byRuns} runs`, matchId: byRuns.id, opp: byRuns.opp } : null,
    bigWkts: byWkts ? { text: `${byWkts.byWkts} wickets`, matchId: byWkts.id, opp: byWkts.opp } : null,
    winRun: longestRun(ms, 'won'),
  };
}

export interface SeasonRow { season: string; played: number; won: number; lost: number; other: number; draw: number; tie: number; nr: number; rate: number | null }

/** "8 won, 3 lost, 2 drawn, 1 no result": what happened, naming each kind of result that did not have a winner and leaving out the ones that did not occur. */
export function resultLine(c: Pick<Counts, 'won' | 'lost' | 'draw' | 'tie' | 'nr'>): string {
  return [`${c.won} won`, `${c.lost} lost`, c.draw ? `${c.draw} drawn` : '', c.tie ? `${c.tie} tied` : '', c.nr ? `${c.nr} no result` : ''].filter(Boolean).join(', ');
}
/** One row for each season in scope, oldest first. A national team's season is the calendar year, a league team's its league season. */
export function seasonRows(ms: readonly TeamMatch[], national: boolean): SeasonRow[] {
  const by = new Map<string, TeamMatch[]>();
  for (const m of ms) { const k = seasonOf(m, national); const l = by.get(k); if (l) l.push(m); else by.set(k, [m]); }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([season, list]) => {
    const c = counts(list);
    return { season, played: c.played, won: c.won, lost: c.lost, other: c.other, draw: c.draw, tie: c.tie, nr: c.nr, rate: c.rate };
  });
}

export interface Split { label: string; counts: Counts; played: number; won: number; lost: number; other: number; draw: number; rate: number | null; avgScore: number | null }

/**
 * Batting first and chasing. Limited-overs matches are split by who batted first and show the average score of the team's innings. A Test has draws, so it shows won, drawn and lost for
 * the matches the team batted first and the ones it bowled first. A match where nobody batted is left out.
 */
export function batFirstSplit(ms: readonly TeamMatch[], innings: ReadonlyMap<number, readonly TeamInnings[]>): { limited: Split[]; tests: Split[] } {
  const row = (label: string, list: TeamMatch[]): Split => {
    const c = counts(list);
    const scores = list.map((m) => totalOf2(innings, m.id)).filter((x): x is number => x !== null);
    return { label, counts: c, played: c.played, won: c.won, lost: c.lost, other: c.other, draw: c.draw, rate: c.rate, avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null };
  };
  const known = ms.filter((m) => m.batFirst !== null);
  const lim = known.filter((m) => m.kind !== 'test'), tst = known.filter((m) => m.kind === 'test');
  const out = { limited: [] as Split[], tests: [] as Split[] };
  if (lim.length) out.limited.push(row('Batting first', lim.filter((m) => m.batFirst)), row('Chasing', lim.filter((m) => !m.batFirst)));
  if (tst.length) out.tests.push(row('Batted first', tst.filter((m) => m.batFirst)), row('Bowled first', tst.filter((m) => !m.batFirst)));
  return out;
}
function totalOf2(innings: ReadonlyMap<number, readonly TeamInnings[]>, id: number): number | null {
  const mine = (innings.get(id) ?? []).filter((i) => i.side === 'for' && !i.superOver);
  return mine.length ? mine.reduce((a, i) => a + i.runs, 0) / mine.length : null;
}

export interface TossCase { key: 'won-bat' | 'won-field' | 'lost-bat' | 'lost-field'; label: string; counts: Counts; played: number; won: number; draw: number; lost: number; rate: number | null; avgScore: number | null }
export interface TossSummary {
  tosses: number;
  won: number;
  /** The share of won tosses where the team chose to bat. */
  batShare: number | null;
  rateAfterWin: number | null;
  rateAfterLoss: number | null;
  cases: TossCase[];
}

/** The four toss cases: won and batted, won and fielded, lost and batted first, lost and chased. Win rate leaves out matches with no result. A match with no toss record is left out. */
export function tossSummary(ms: readonly TeamMatch[], innings: ReadonlyMap<number, readonly TeamInnings[]>): TossSummary {
  const known = ms.filter((m) => m.tossWon !== null);
  const caseOf = (key: TossCase['key'], label: string, list: TeamMatch[]): TossCase => {
    const c = counts(list);
    const scores = list.map((m) => totalOf2(innings, m.id)).filter((x): x is number => x !== null);
    return { key, label, counts: c, played: c.played, won: c.won, draw: c.draw + c.tie, lost: c.lost, rate: c.rate, avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null };
  };
  const wonT = known.filter((m) => m.tossWon), lostT = known.filter((m) => !m.tossWon);
  const bat = wonT.filter((m) => m.tossDecision === 'bat');
  return {
    tosses: known.length, won: wonT.length, batShare: wonT.length ? bat.length / wonT.length : null,
    rateAfterWin: counts(wonT).rate, rateAfterLoss: counts(lostT).rate,
    cases: [
      caseOf('won-bat', 'Won the toss and batted', bat),
      caseOf('won-field', 'Won the toss and fielded', wonT.filter((m) => m.tossDecision === 'field')),
      caseOf('lost-bat', 'Lost the toss and batted first', lostT.filter((m) => m.batFirst === true)),
      caseOf('lost-field', 'Lost the toss and chased', lostT.filter((m) => m.batFirst === false)),
    ],
  };
}

export interface OpponentRow { id: string; name: string; played: number; won: number; lost: number; other: number; rate: number | null; small: boolean }
export const SMALL_OPPONENT = 5;
export type OpponentSort = { key: 'name' | 'played' | 'won' | 'lost' | 'other' | 'rate'; dir: 1 | -1 };

export function opponentRows(ms: readonly TeamMatch[]): OpponentRow[] {
  const by = new Map<string, TeamMatch[]>();
  for (const m of ms) { const l = by.get(m.oppId); if (l) l.push(m); else by.set(m.oppId, [m]); }
  return [...by.entries()].map(([id, list]) => {
    const c = counts(list);
    return { id, name: list[0]!.opp, played: c.played, won: c.won, lost: c.lost, other: c.other, rate: c.rate, small: c.played < SMALL_OPPONENT };
  });
}

export function sortOpponents(rows: readonly OpponentRow[], sort: OpponentSort = { key: 'played', dir: -1 }): OpponentRow[] {
  const val = (r: OpponentRow): number | string => (sort.key === 'name' ? r.name : sort.key === 'rate' ? r.rate ?? -1 : r[sort.key]);
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    const d = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
    return (d * sort.dir) || b.played - a.played || a.name.localeCompare(b.name);
  });
}

// ---- Trophies and knockouts ------------------------------------------------------------------------------

export type EditionResult = 'champion' | 'runner-up' | 'other';
export interface Edition {
  tournament: string;
  name: string;
  edition: string;
  /** A label for the edition: the season, or the years it spans. */
  label: string;
  result: EditionResult;
  /** The last knockout stage the team played, or null (it went no further than the league stage). */
  stage: string | null;
  firstDate: string;
}

/** Tournaments that count for trophies: the major tournaments and the leagues, never small events or qualifiers. */
export const countsForTrophies = (m: TeamMatch): boolean => m.tk !== null && m.edition !== null && (m.tkind === 'tournament' || m.tkind === 'league');

const STAGE_RANK: Record<string, number> = { 'Final': 9, 'Preliminary Final': 8, 'Qualifier 2': 7, 'Semi Final': 7, 'Challenger': 6, 'Qualifier 3': 6, 'Qualifier 4': 6, 'Quarter Final': 5, 'Eliminator': 4, 'Qualifier 1': 4, 'Qualifier': 4, 'Play-off': 4, 'Knockout': 4 };

/**
 * One edition of a tournament the team played. The champion is the winner of the match tagged Final, and a best-of-three Final goes to the side with more wins. An edition with no Final the
 * team played has the knockout stage it reached, if any, and counts as played only.
 */
/** How far a team went in one edition (any tournament, small events included), from the team's matches in it, oldest first: the winner of the Final is champion, the loser runner-up (a best of three goes to the side with more wins), else the last knockout stage played. */
export function outcomeOf(sorted: readonly TeamMatch[]): { result: EditionResult; stage: string | null } {
  const finals = sorted.filter((m) => m.stageClass === 'knockout' && m.stageName === 'Final');
  const fw = finals.filter((m) => m.result === 'won').length, fl = finals.filter((m) => m.result === 'lost').length;
  const ko = sorted.filter((m) => m.stageClass === 'knockout');
  const best = ko.reduce<TeamMatch | null>((b, m) => (!b || (STAGE_RANK[m.stageName ?? ''] ?? 3) >= (STAGE_RANK[b.stageName ?? ''] ?? 3) ? m : b), null);
  return { result: finals.length && fw > fl ? 'champion' : finals.length && fl > fw ? 'runner-up' : 'other', stage: best?.stageName ?? null };
}

export function editions(ms: readonly TeamMatch[]): Edition[] {
  const by = new Map<string, TeamMatch[]>();
  for (const m of ms) if (countsForTrophies(m)) { const l = by.get(m.edition!); if (l) l.push(m); else by.set(m.edition!, [m]); }
  const out: Edition[] = [];
  for (const [edition, list] of by) {
    const sorted = sortByDate(list);
    const seasons = [...new Set(sorted.map((m) => m.season))];
    const o = outcomeOf(sorted);
    out.push({
      tournament: sorted[0]!.tk!, name: sorted[0]!.tname ?? sorted[0]!.tk!, edition,
      label: seasons.length > 1 ? `${seasons[0]} to ${seasons[seasons.length - 1]}` : seasons[0]!,
      result: o.result, stage: o.stage, firstDate: sorted[0]!.date,
    });
  }
  return out.sort((a, b) => a.firstDate.localeCompare(b.firstDate));
}

/** The words for an outcome: Champion, Runner-up, out in the semi final, or the league stage. */
export function outcomeText(o: { result: EditionResult; stage: string | null }, fallback = 'the league stage'): string {
  // A Final that was tied, drawn or abandoned has no winner, so the team is neither out in it nor its champion.
  if (o.result === 'other' && o.stage === 'Final') return 'Final with no winner';
  return o.result === 'champion' ? 'Champion' : o.result === 'runner-up' ? 'Runner-up' : `Out in ${o.stage ? `the ${o.stage.toLowerCase()}` : fallback}`;
}

export interface TrophyRow { tournament: string; name: string; titles: number; finalsLost: number; editions: Edition[] }
export function trophyRows(eds: readonly Edition[]): TrophyRow[] {
  const by = new Map<string, TrophyRow>();
  for (const e of eds) {
    const r = by.get(e.tournament) ?? { tournament: e.tournament, name: e.name, titles: 0, finalsLost: 0, editions: [] };
    r.titles += e.result === 'champion' ? 1 : 0; r.finalsLost += e.result === 'runner-up' ? 1 : 0; r.editions.push(e);
    by.set(e.tournament, r);
  }
  return [...by.values()].sort((a, b) => b.titles - a.titles || b.finalsLost - a.finalsLost || b.editions.length - a.editions.length || a.name.localeCompare(b.name));
}

export interface KnockoutGroup { tournament: string; name: string; edition: string; label: string; outcome: string; matches: TeamMatch[] }
/** Every knockout match (placing play-offs included, with their own label), grouped by edition, newest edition first and each edition's matches in the order they were played. */
export function knockoutGroups(ms: readonly TeamMatch[], all: readonly TeamMatch[] = ms): KnockoutGroup[] {
  const by = new Map<string, TeamMatch[]>();
  for (const m of ms) if (m.tk && m.edition && (m.stageClass === 'knockout' || m.stageClass === 'placing')) { const l = by.get(m.edition); if (l) l.push(m); else by.set(m.edition, [m]); }
  return [...by.entries()].map(([edition, list]) => {
    const sorted = sortByDate(list);
    const placing = sorted.every((m) => m.stageClass === 'placing');
    // Every edition with a knockout match counts here, small events such as a tri-series included, so the outcome is read from the team's own matches in it.
    const whole = sortByDate(all.filter((m) => m.edition === edition && m.stageClass === 'knockout'));
    const outcome = placing ? 'Placing matches' : outcomeText(outcomeOf(whole.length ? whole : sorted.filter((m) => m.stageClass === 'knockout')), 'the knockouts');
    return { tournament: sorted[0]!.tk!, name: sorted[0]!.tname ?? sorted[0]!.tk!, edition, label: [...new Set(sorted.map((m) => m.season))].join(' to '), outcome, matches: sorted };
  }).sort((a, b) => b.matches[0]!.date.localeCompare(a.matches[0]!.date));
}

// ---- The files that load after the first paint ----------------------------------------------------------

export interface TeamPhaseRow { matchId: number; inn: number; side: 'for' | 'against'; phase: string; runs: number; balls: number; wkts: number; boundaries: number; dots: number }
export interface TeamWicketRow { matchId: number; inn: number; side: 'for' | 'against'; type: string; n: number }
export interface TeamReviewRow { matchId: number; inn: number; ball: number; byTeam: boolean; batting: boolean | null; decision: string; type: string | null; umpiresCall: boolean | null }
/** One player in one match. `named` is false for a substitute fielder. */
export interface TeamPlayerRow {
  matchId: number; date: string; id: string; name: string; named: boolean;
  batInns: number; runs: number; balls: number; fours: number; sixes: number; outs: number; high: number; fifties: number; hundreds: number; ducks: number;
  bowlInns: number; bowlBalls: number; conceded: number; wkts: number; maidens: number; fivefers: number; bestWkts: number; bestRuns: number;
  catches: number; stumpings: number; runOuts: number; potm: boolean;
}
/** The team's bowling by kind of bowler in one match. */
export interface TeamStyleRow { matchId: number; group: 'pace' | 'spin' | 'other'; balls: number; conceded: number; wkts: number }
/** What every side did in one phase, for one kind of match: the average the phase cards compare with. */
export interface PhaseAverage { kind: MatchKind; league: boolean; gender: 'male' | 'female'; phase: string; runs: number; balls: number; wkts: number; boundaries: number; dots: number }
