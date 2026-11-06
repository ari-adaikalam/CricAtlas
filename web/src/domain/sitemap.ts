import { playerSlug, teamSlug, tournamentSlug } from './slug';

export const SITE = 'https://cricatlas.ariadaikalam.com';

/** The pages that have no data file behind them. */
export const FIXED_PAGES = ['', '/players', '/teams', '/matches', '/tournaments', '/series', '/records', '/compare', '/api'];

/** Every address the site has, from the lists the app already reads: players (plist.json rows start with id and name), matches (mlist.json rows start with the match id), team ids (t/index.json) and tournament keys (n/index.json). A match is listed by its id alone, which the match page accepts. */
export function sitemapPaths(plist: readonly (readonly unknown[])[], mlist: { rows: readonly (readonly unknown[])[] }, teams: readonly (readonly unknown[])[], tournaments: readonly (readonly unknown[])[]): string[] {
  return [
    ...FIXED_PAGES,
    ...plist.map((p) => `/players/${playerSlug(String(p[1]), String(p[0]))}`),
    ...teams.map((t) => `/teams/${teamSlug(String(t[0]))}`),
    ...tournaments.map((t) => `/tournaments/${tournamentSlug(String(t[0]))}`),
    ...mlist.rows.map((m) => `/matches/${String(m[0])}`),
  ];
}
