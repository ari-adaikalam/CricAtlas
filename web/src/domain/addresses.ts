import { matchIdFromSlug, playerIdFromSlug } from './slug';

/** The sections whose addresses name one thing the data has: /players/<slug>, /matches/<slug>, /teams/<slug>, /tournaments/<slug>. */
export type Section = 'players' | 'matches' | 'teams' | 'tournaments';
export interface Addresses { players: readonly string[]; matches: readonly number[]; teams: readonly string[]; tournaments: readonly string[] }

/** What the address names (a player id, a match id, a team slug, a tournament slug), or null when it is not even in the shape of one. */
export function addressKey(section: string, slug: string): string | number | null {
  if (section === 'players') return playerIdFromSlug(slug);
  if (section === 'matches') return matchIdFromSlug(slug);
  if (section === 'teams') return /^[a-z0-9-]+~[a-z0-9-]+~(male|female)$/.test(slug) ? slug : null;
  if (section === 'tournaments') return /^[a-z0-9-]+$/.test(slug) ? slug : null;
  return null;
}

/** Whether the data has a page for the address. Built once from the lists the build wrote (scripts/build-addresses.mjs). */
export function addressChecker(lists: Addresses): (section: string, slug: string) => boolean {
  const sets = { players: new Set<string | number>(lists.players), matches: new Set<string | number>(lists.matches), teams: new Set<string | number>(lists.teams), tournaments: new Set<string | number>(lists.tournaments) };
  return (section, slug) => {
    const key = addressKey(section, slug);
    return key !== null && (sets[section as Section]?.has(key) ?? false);
  };
}
