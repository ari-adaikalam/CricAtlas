import type { SummaryRow } from './batting';
import { recordSides } from './records';

// The Format, Competition and Season choices on a player page.
// A format is a group of matches. League is never picked: choosing a league competition sets it.

export type FormatChoice = 'INTERNATIONAL' | 'TEST' | 'ODI' | 'T20I' | 'T20S' | 'LEAGUE';
export const FORMAT_CHOICES: readonly FormatChoice[] = ['INTERNATIONAL', 'TEST', 'ODI', 'T20I', 'T20S', 'LEAGUE'];

/** Competition and season are null for "all". */
export interface PlayerFilters {
  format: FormatChoice;
  competition: string | null;
  season: string | null;
}

export interface FormatOption { format: FormatChoice; disabled: boolean }
export interface CompetitionOption { key: string; name: string; matches: number; league: boolean; hasMatches: boolean }

const isLeague = (r: SummaryRow): boolean => r.filter_section === 'Leagues';
const SINGLE: Record<'TEST' | 'ODI' | 'T20I', (r: SummaryRow) => boolean> = {
  TEST: (r) => r.format === 'TEST',
  ODI: (r) => r.format === 'ODI',
  /** A T20 match outside a league: a T20 international or an international tournament. */
  T20I: (r) => r.format === 'T20' && !isLeague(r),
};

/** Whether a summary row belongs to the chosen format. */
export function inFormat(r: SummaryRow, format: FormatChoice): boolean {
  switch (format) {
    case 'TEST': case 'ODI': case 'T20I': return SINGLE[format](r);
    case 'T20S': return r.format === 'T20';
    case 'LEAGUE': return isLeague(r);
    case 'INTERNATIONAL': return !isLeague(r);
  }
}

const balls = (r: SummaryRow): number => (r.balls_faced ?? 0) + (r.balls_bowled ?? 0);
const sum = (rows: readonly SummaryRow[], format: FormatChoice): number => rows.reduce((a, r) => a + (inFormat(r, format) ? balls(r) : 0), 0);

/**
 * What decides a player's default format (Ari, 2026-10-18): runs for a batter, wickets for a bowler. A bowler here is a player who is a bowler and not a batter by the
 * Records role rule (50 career wickets, and not 1,000 runs at an average of 20), so an all-rounder and anyone below those marks is judged on runs.
 */
export type Lead = 'runs' | 'wickets';
export function leadMeasure(rows: readonly SummaryRow[]): Lead {
  const sides = recordSides(rows);
  return sides.bowl && !sides.bat ? 'wickets' : 'runs';
}
const weight = (r: SummaryRow, lead: Lead): number => (lead === 'wickets' ? r.wickets ?? 0 : r.runs ?? 0);
const total = (rows: readonly SummaryRow[], inGroup: (r: SummaryRow) => boolean, lead: Lead): number => rows.reduce((a, r) => a + (inGroup(r) ? weight(r, lead) : 0), 0);

/** The international formats the player has, best first: the most runs for a batter, the most wickets for a bowler, and the most balls when those are level. */
export function internationalFormats(rows: readonly SummaryRow[]): Array<'TEST' | 'ODI' | 'T20I'> {
  const lead = leadMeasure(rows);
  return (['TEST', 'ODI', 'T20I'] as const).filter((f) => rows.some(SINGLE[f])).sort((a, b) => total(rows, SINGLE[b], lead) - total(rows, SINGLE[a], lead) || sum(rows, b) - sum(rows, a));
}

const t20Competitions = (rows: readonly SummaryRow[]): number =>
  (rows.some(SINGLE.T20I) ? 1 : 0) + new Set(rows.filter(isLeague).map((r) => r.tournament_key ?? '')).size;

/**
 * Formats in the order of the mockup: International (with two or more international formats), each international format, T20s (with two or more
 * T20 competitions), then League, which is always disabled because only a league competition sets it.
 */
export function formatOptions(rows: readonly SummaryRow[], current: FormatChoice = 'TEST'): FormatOption[] {
  const intl = (['TEST', 'ODI', 'T20I'] as const).filter((f) => rows.some(SINGLE[f]));
  const out: FormatOption[] = [];
  if (intl.length > 1) out.push({ format: 'INTERNATIONAL', disabled: false });
  intl.forEach((format) => out.push({ format, disabled: false }));
  if (t20Competitions(rows) > 1) out.push({ format: 'T20S', disabled: false });
  if (rows.some(isLeague) || current === 'LEAGUE') out.push({ format: 'LEAGUE', disabled: true });
  return out;
}

/** Every tournament the player has matches in, international ones first. Bilateral series have no key and stay in "All competitions". */
export function competitionOptions(rows: readonly SummaryRow[], format: FormatChoice): CompetitionOption[] {
  const byKey = new Map<string, CompetitionOption>();
  for (const r of rows) {
    if (!r.tournament_key) continue;
    const entry = byKey.get(r.tournament_key) ?? { key: r.tournament_key, name: r.tournament_name ?? r.tournament_key, matches: 0, league: isLeague(r), hasMatches: false };
    entry.matches += r.appearances ?? 0;
    if (inFormat(r, format)) entry.hasMatches = true;
    byKey.set(r.tournament_key, entry);
  }
  return [...byKey.values()].sort((a, b) => Number(a.league) - Number(b.league) || b.matches - a.matches);
}

/** Seasons with balls under the other two choices, newest first. */
export function seasonOptions(rows: readonly SummaryRow[], format: FormatChoice, competition: string | null): string[] {
  const seasons = new Set<string>();
  for (const r of rows) {
    if (!inFormat(r, format)) continue;
    if (competition !== null && r.tournament_key !== competition) continue;
    seasons.add(r.season);
  }
  return [...seasons].sort().reverse();
}

export function applyFilters(rows: readonly SummaryRow[], f: PlayerFilters): SummaryRow[] {
  return rows.filter((r) => inFormat(r, f.format) && (f.competition === null || r.tournament_key === f.competition) && (f.season === null || r.season === f.season));
}

/**
 * Opens on the international format with the most runs for a batter or the most wickets for a bowler. A player with no international matches opens on the league
 * with the most runs or wickets, so a league specialist never lands on an empty view.
 */
export function defaultFilters(rows: readonly SummaryRow[]): PlayerFilters | null {
  const first = internationalFormats(rows)[0];
  if (first) return { format: first, competition: null, season: null };
  const lead = leadMeasure(rows);
  const league = competitionOptions(rows, 'LEAGUE').filter((o) => o.league && o.hasMatches)
    .sort((a, b) => total(rows, (r) => r.tournament_key === b.key, lead) - total(rows, (r) => r.tournament_key === a.key, lead) || b.matches - a.matches)[0];
  return league ? { format: 'LEAGUE', competition: league.key, season: null } : null;
}

/** Drops any choice that has no balls under the others, as the filter rules require. */
export function normaliseFilters(rows: readonly SummaryRow[], f: PlayerFilters): PlayerFilters | null {
  const fallback = defaultFilters(rows);
  if (!fallback) return null;
  const allowed = formatOptions(rows, f.format);
  const format = f.format === 'LEAGUE' && f.competition !== null ? 'LEAGUE' : allowed.some((o) => o.format === f.format && !o.disabled) ? f.format : fallback.format;
  const competition = f.competition !== null && competitionOptions(rows, format).some((o) => o.key === f.competition && o.hasMatches) ? f.competition : null;
  const season = f.season !== null && seasonOptions(rows, format, competition).includes(f.season) ? f.season : null;
  if (format === 'LEAGUE' && competition === null) return fallback;
  return { format, competition, season };
}

/** The filters after a Format choice: a competition with no matches in the new format is dropped. */
export function chooseFormat(format: FormatChoice): PlayerFilters {
  return { format, competition: null, season: null };
}

/**
 * The filters after a Competition choice. Every tournament the player has matches in is offered, and choosing one moves Format to a format
 * that has those matches: a league sets League, and an international tournament keeps the current format when it has matches there,
 * otherwise it takes the player's busiest international format in that tournament. All competitions from League goes back to the busiest
 * international format.
 */
export function chooseCompetition(rows: readonly SummaryRow[], current: PlayerFilters, key: string | null): PlayerFilters {
  if (key === null) return { format: current.format === 'LEAGUE' ? (defaultFilters(rows)?.format ?? current.format) : current.format, competition: null, season: null };
  const inTournament = rows.filter((r) => r.tournament_key === key);
  if (inTournament.some(isLeague)) return { format: 'LEAGUE', competition: key, season: null };
  if (inTournament.some((r) => inFormat(r, current.format))) return { format: current.format, competition: key, season: null };
  const busiest = (['TEST', 'ODI', 'T20I'] as const).filter((f) => inTournament.some(SINGLE[f])).sort((a, b) => sum(inTournament, b) - sum(inTournament, a))[0];
  return { format: busiest ?? current.format, competition: key, season: null };
}

/** Analysis views never mix international formats, because their rates share no scale. Returns the filters to show and the note, if it changed. */
export function forAnalysis(rows: readonly SummaryRow[], f: PlayerFilters): { filters: PlayerFilters; note: string | null } {
  if (f.format !== 'INTERNATIONAL') return { filters: f, note: null };
  const first = internationalFormats(rows)[0] ?? 'TEST';
  return { filters: { format: first, competition: null, season: f.season }, note: `International is not available here. Showing ${FORMAT_NAME[first]}.` };
}

export const FORMAT_NAME: Readonly<Record<FormatChoice, string>> = { INTERNATIONAL: 'International', TEST: 'Tests', ODI: 'ODIs', T20I: 'T20Is', T20S: 'T20s', LEAGUE: 'League' };

const SAFE_VALUE = /^[A-Za-z0-9_/ .-]{1,40}$/;

/** URL parameters are untrusted: anything that is not a short plain token, or not a known format, is ignored. */
export function filtersFromParams(params: URLSearchParams): Partial<PlayerFilters> {
  const pick = (name: string): string | undefined => {
    const value = params.get(name);
    return value !== null && SAFE_VALUE.test(value) ? value : undefined;
  };
  const out: Partial<PlayerFilters> = {};
  const format = pick('format'); if (format && (FORMAT_CHOICES as readonly string[]).includes(format)) out.format = format as FormatChoice;
  const competition = pick('competition'); if (competition) out.competition = competition;
  const season = pick('season'); if (season) out.season = season;
  return out;
}

export function filtersToParams(f: PlayerFilters): URLSearchParams {
  const params = new URLSearchParams({ format: f.format });
  if (f.competition) params.set('competition', f.competition);
  if (f.season) params.set('season', f.season);
  return params;
}
