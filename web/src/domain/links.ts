import { matchSlug, playerSlug, teamSlug, tournamentSlug } from './slug';

// Where a name in the app leads (Ari, 2026-10-20): a player or a team opens a small menu on hover, a match or a competition goes straight to its page. A page that is not built yet
// is never linked, so no link leads to a missing page, and a menu item for it is dimmed (Compare) or left out. There are no pages for venues.

export type EntityKind = 'player' | 'team' | 'match' | 'tournament';

/** Which pages exist. Flip a flag when the page is built. A team's id is the team id of the data ('india|intl|male'), a competition's the tournament key ('t20-world-cup-male'). */
export const BUILT = { player: true, team: true, match: true, tournament: true, compare: true } as const;

/**
 * The competitions that have a page: the 32 tournament keys of data/export/n/index.json (tournament_kind tournament or league, tools/tournament_files.py). A small event or a qualifier family has none and
 * stays plain text. Change this list when the tournament files gain or lose a key.
 */
export const TOURNAMENT_PAGES: ReadonlySet<string> = new Set([
  'acc-premier-cup-female', 'acc-premier-cup-male', 'african-games-female', 'african-games-male', 'apc-champions-trophy-male', 'asia-cup-female', 'asia-cup-male', 'asian-games-female', 'asian-games-male', 'bbl', 'bpl',
  'champions-trophy-male', 'commonwealth-games-female', 'continental-cup-female', 'continental-cup-male', 'cpl', 'hnd', 'ilt', 'ipl', 'lpl', 'mlc', 'odi-world-cup-female', 'odi-world-cup-league-male', 'odi-world-cup-male', 'psl', 'sat',
  't20-world-cup-female', 't20-world-cup-male', 'wbb', 'women-championship-female', 'wpl', 'wtc-male',
]);

export interface MenuItem { id: 'profile' | 'compare' | 'team'; label: string; href: string | null; icon: 'profile' | 'compare' | 'team' }

export interface EntityRef { kind: EntityKind; id: string | number | null; name: string; /** For a match: the teams and the date, so the address reads well. */ teams?: readonly [string, string]; date?: string }

/** The menu of a player or a team. Items whose page is not built have no address and are shown dimmed. Empty when the menu would have nothing to offer. */
export function menuFor(ref: EntityRef): MenuItem[] {
  if (ref.id === null) return [];
  if (ref.kind === 'player') return [
    { id: 'profile', label: 'View profile', href: BUILT.player ? `/players/${playerSlug(ref.name, String(ref.id))}` : null, icon: 'profile' },
    { id: 'compare', label: 'Compare this player', href: BUILT.compare ? `/compare/players?a=${encodeURIComponent(String(ref.id))}` : null, icon: 'compare' },
  ];
  if (ref.kind === 'team') {
    const items: MenuItem[] = [
      { id: 'team', label: 'View team', href: BUILT.team ? `/teams/${teamSlug(String(ref.id))}` : null, icon: 'team' },
      { id: 'compare', label: 'Compare this team', href: BUILT.compare ? `/compare/teams?a=${encodeURIComponent(String(ref.id))}` : null, icon: 'compare' },
    ];
    // Until the Team page exists, a team's menu would be two dimmed items, so a team shows no menu and stays plain text.
    return BUILT.team ? items : [];
  }
  return [];
}

/** The address a name goes to directly, or null when it opens a menu or its page is not built. */
export function directHref(ref: EntityRef): string | null {
  if (ref.id === null) return null;
  // A competition with a page goes straight to /tournaments/<key>; any other stays plain text.
  if (ref.kind === 'tournament') return BUILT.tournament && TOURNAMENT_PAGES.has(String(ref.id)) ? `/tournaments/${tournamentSlug(String(ref.id))}` : null;
  if (ref.kind === 'match') return BUILT.match ? `/matches/${ref.teams && ref.date ? matchSlug(ref.teams[0], ref.teams[1], ref.date, Number(ref.id)) : String(ref.id)}` : null;
  return null;
}

/** The address the name itself leads to when clicked: a player's profile, a team's page, a match, a competition. Null when nothing is built for it. */
export function primaryHref(ref: EntityRef): string | null {
  const direct = directHref(ref);
  if (direct) return direct;
  return menuFor(ref).find((i) => i.href !== null)?.href ?? null;
}

/** Whether a name should be drawn as a link at all. */
export const isLinked = (ref: EntityRef): boolean => primaryHref(ref) !== null;
