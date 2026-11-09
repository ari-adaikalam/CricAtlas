import { battingTotals, type SummaryRow } from './batting';
import { competitionOptions, defaultFilters, internationalFormats, type PlayerFilters } from './filters';
import { careerGroups } from './profile';
import { counts, editions, trophyRows, type Counts, type TeamMatch } from './team';

// The Compare pages: who can be compared, what a card shows, and the Career by format table of the pick screen.

// ---- Players ----------------------------------------------------------------------------------------

export type RoleTag = 'Batter' | 'Bowler' | 'All-rounder';

/** The tag on a player's card, from the dataset's playing role: an allrounder is an All-rounder, any other role naming a bowler is a Bowler, the rest are Batters (a wicketkeeper batter is a batter). */
export function roleTag(role: string | null): RoleTag {
  const r = (role ?? '').toLowerCase();
  if (r.includes('allrounder') || r.includes('all-rounder')) return 'All-rounder';
  if (r.includes('bowler')) return 'Bowler';
  return 'Batter';
}

export interface CardStats { matches: number; runs: number; average: number | null; wickets: number }

/** The four numbers on a player's card, over every row of the summary: matches played, runs, batting average and wickets. */
export function cardStats(rows: readonly SummaryRow[]): CardStats {
  const t = battingTotals(rows);
  return { matches: t.matches, runs: t.runs, average: t.average, wickets: rows.reduce((a, r) => a + (r.wickets ?? 0), 0) };
}

export interface FormatCell { matches: number; runs: number; wickets: number }
export interface FormatRow { label: string; a: FormatCell | null; b: FormatCell | null }

/** The groups that are a format or a league, not the two that add formats together (International and T20s). */
const isSingle = (label: string): boolean => label !== 'International' && label !== 'T20s';

function cells(rows: readonly SummaryRow[]): Map<string, FormatCell> {
  const out = new Map<string, FormatCell>();
  for (const g of careerGroups(rows)) {
    if (!isSingle(g.label)) continue;
    out.set(g.label, { matches: g.rows.reduce((a, r) => a + (r.appearances ?? 0), 0), runs: g.rows.reduce((a, r) => a + (r.runs ?? 0), 0), wickets: g.rows.reduce((a, r) => a + (r.wickets ?? 0), 0) });
  }
  return out;
}

const ORDER = ['Tests', 'ODIs', 'T20Is'];

/** One row for each format or league either player has: Tests, ODIs and T20Is first, then the leagues with most matches first. A player who has no match in a row has null there ("Did not play"). */
export function formatRows(a: readonly SummaryRow[], b: readonly SummaryRow[] | null): FormatRow[] {
  const ca = cells(a), cb = b ? cells(b) : new Map<string, FormatCell>();
  const labels = [...new Set([...ca.keys(), ...cb.keys()])];
  const total = (l: string): number => (ca.get(l)?.matches ?? 0) + (cb.get(l)?.matches ?? 0);
  labels.sort((x, y) => {
    const ix = ORDER.indexOf(x), iy = ORDER.indexOf(y);
    if (ix >= 0 || iy >= 0) return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
    return total(y) - total(x) || x.localeCompare(y);
  });
  return labels.map((label) => ({ label, a: ca.get(label) ?? null, b: cb.get(label) ?? null }));
}

/** Players who rank first among the suggestions for an empty slot: the same role as the other player, then the most matches. `known` is the order the list already has (most matches first). */
export function suggestOrder<T extends { role: string | null }>(known: readonly T[], other: { role: string | null } | null): T[] {
  if (!other) return [...known];
  const tag = roleTag(other.role);
  return [...known].sort((x, y) => Number(roleTag(y.role) === tag) - Number(roleTag(x.role) === tag));
}

// ---- Teams ------------------------------------------------------------------------------------------

/** The group a team can be compared inside (Ari, 2026-10-17): national sides of one gender, or the franchises of one league and gender. A team id reads 'india|intl|male' or 'mumbai-indians|ipl|male'. */
export function teamGroup(id: string): string {
  const [, kind, gender] = id.split('|');
  return `${kind ?? ''}|${gender ?? ''}`;
}

/** Whether two different teams are in the same group. */
export const canCompareTeams = (a: string, b: string): boolean => a !== b && teamGroup(a) === teamGroup(b);

/** The words for a group, for the note that names who cannot be compared: "national men's teams", "IPL men's teams". */
export function groupText(id: string, leagueName: (key: string) => string): string {
  const [, kind, gender] = id.split('|');
  const who = gender === 'female' ? "women's" : "men's";
  return kind === 'intl' ? `national ${who} teams` : `${leagueName(kind ?? '')} ${who} teams`;
}

export interface TeamCard { matches: number; rate: number | null; titles: number; finalsLost: number }

/** The four numbers on a team's card: matches, win rate (matches with a result), titles and lost finals, over every match of the team. */
export function teamCard(ms: readonly TeamMatch[]): TeamCard {
  const c = counts(ms);
  const rows = trophyRows(editions(ms));
  return { matches: c.played, rate: c.rate, titles: rows.reduce((a, r) => a + r.titles, 0), finalsLost: rows.reduce((a, r) => a + r.finalsLost, 0) };
}

export interface TeamCompetitionRow { label: string; a: Counts; b: Counts }

/** What a team's match is counted under in the "competitions both teams play" table: a national side's format (Tests, ODIs, T20Is), a franchise's competition (its tournament or league name). */
export function competitionOf(m: TeamMatch, national: boolean): string {
  if (national) return m.format === 'TEST' ? 'Tests' : m.format === 'ODI' ? 'ODIs' : 'T20Is';
  return m.tname ?? m.event ?? 'Other matches';
}

/** One row for each competition both teams have played, with each side's counts there: Tests, ODIs and T20Is in that order, other competitions by the matches the two sides have played in them. */
export function sharedCompetitions(a: readonly TeamMatch[], b: readonly TeamMatch[], national: boolean): TeamCompetitionRow[] {
  const by = (ms: readonly TeamMatch[]): Map<string, TeamMatch[]> => {
    const out = new Map<string, TeamMatch[]>();
    for (const m of ms) { const k = competitionOf(m, national); const l = out.get(k); if (l) l.push(m); else out.set(k, [m]); }
    return out;
  };
  const ga = by(a), gb = by(b);
  const rows = [...ga.keys()].filter((k) => gb.has(k)).map((label) => ({ label, a: counts(ga.get(label)!), b: counts(gb.get(label)!) }));
  rows.sort((x, y) => {
    const ix = ORDER.indexOf(x.label), iy = ORDER.indexOf(y.label);
    if (ix >= 0 || iy >= 0) return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
    return y.a.played + y.b.played - (x.a.played + x.b.played) || x.label.localeCompare(y.label);
  });
  return rows;
}

/**
 * The Format, Competition and Season a comparison opens on: the international format both have
 * played with the most matches between them, else the league both have played with the most matches, else what the two players' rows together would open on. Null when neither has a match.
 */
export function compareDefaultFilters(a: readonly SummaryRow[], b: readonly SummaryRow[]): PlayerFilters | null {
  const played = (rows: readonly SummaryRow[], pick: (r: SummaryRow) => boolean): number => rows.filter(pick).reduce((n, r) => n + (r.appearances ?? 0), 0);
  const fa = internationalFormats(a), fb = internationalFormats(b);
  const shared = fa.filter((f) => fb.includes(f));
  const formatOf = { TEST: (r: SummaryRow) => r.format === 'TEST', ODI: (r: SummaryRow) => r.format === 'ODI', T20I: (r: SummaryRow) => r.format === 'T20' && r.filter_section !== 'Leagues' };
  const best = [...shared].sort((x, y) => played([...a, ...b], formatOf[y]) - played([...a, ...b], formatOf[x]))[0];
  if (best) return { format: best, competition: null, season: null };
  const la = competitionOptions(a, 'LEAGUE').filter((o) => o.league && o.hasMatches), lb = competitionOptions(b, 'LEAGUE').filter((o) => o.league && o.hasMatches);
  const both = la.filter((o) => lb.some((x) => x.key === o.key)).sort((x, y) => (lb.find((z) => z.key === y.key)?.matches ?? 0) + y.matches - ((lb.find((z) => z.key === x.key)?.matches ?? 0) + x.matches))[0];
  if (both) return { format: 'LEAGUE', competition: both.key, season: null };
  return defaultFilters([...a, ...b]);
}

