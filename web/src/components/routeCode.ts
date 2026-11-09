/**
 * Loads the code of a page before its link is clicked. The router prefetch brings a page's payload, but the page's own code (the Player, Team, Match and Tournament views are large) was fetched only at
 * the click, after the old page had already faded out, so a first visit showed an empty screen until it arrived (Ari, 2026-11-08: the first open of a player flashed, the second did not). A dynamic
 * import fetches it into the browser's cache and module registry; the page then finds it at once. Each page's code is asked for once.
 */
const LOADERS: Record<string, () => Promise<unknown>> = {
  '/': () => import('./home/HomeView'),
  '/players': () => import('./PlayersRootView'),
  '/teams': () => import('./TeamsRootView'),
  '/matches': () => import('./MatchesRootView'),
  '/tournaments': () => import('./TournamentsRootView'),
  '/series': () => import('./SeriesRootView'),
  '/records': () => import('./RecordListsView'),
  '/compare': () => import('./CompareRootView'),
  '/players/*': () => import('./PlayerShell'),
  '/teams/*': () => import('./TeamShell'),
  '/matches/*': () => import('./MatchShell'),
  '/tournaments/*': () => import('./TournamentShell'),
  '/compare/*': () => import('./CompareSwitch'),
};
const asked = new Map<string, Promise<unknown>>();
const ready = new Set<string>();

function keyOf(address: string): string | null {
  const parts = address.split('?')[0]!.split('#')[0]!.split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  const key = parts.length === 1 ? `/${parts[0]}` : `/${parts[0]}/*`;
  return key in LOADERS ? key : null;
}

/** Asks for the code of the page at this address (a path such as `/players/x` for a player page). Safe to call as often as you like. */
export function warmRouteCode(address: string): void {
  if (typeof window === 'undefined') return;
  const key = keyOf(address);
  if (key === null || asked.has(key)) return;
  const loading = LOADERS[key]!().then(() => { ready.add(key); }, () => { asked.delete(key); });
  asked.set(key, loading);
}

/** A promise while the code of the page at this address is still arriving, or null when it is here (or is not a page this knows). A click waits for it, so the old page stays until the new one can be drawn. */
export function codeOnItsWay(address: string): Promise<unknown> | null {
  warmRouteCode(address);
  const key = keyOf(address);
  if (key === null || ready.has(key)) return null;
  return asked.get(key) ?? null;
}

/** After the page has settled, asks for the code of each kind of page in turn, unless the visitor has asked to save data. */
export function warmAllRouteCode(): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')) return;
  const keys = ['/players/*', '/matches/*', '/teams/*', '/tournaments/*', '/players', '/matches', '/teams', '/tournaments', '/compare/*'];
  keys.forEach((k, i) => window.setTimeout(() => warmRouteCode(k.replace('*', 'x')), 600 * i));
}
