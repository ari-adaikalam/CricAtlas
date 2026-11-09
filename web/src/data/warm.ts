import { fetchMatch } from './matchData';
import { fetchHome, fetchReplay } from './homeData';
import { fetchMatchList } from './matchList';
import { fetchPlayerList } from './playerList';
import { fetchProfile } from './profileData';
import { fetchRecordsIndex } from './recordFiles';
import { fetchTeam, fetchTeamIndex, isTeamSlug } from './teamData';
import { fetchTournament, fetchTournamentIndex, isTournamentKey } from './tournamentData';
import { matchIdFromSlug, playerIdFromSlug } from '@/domain/slug';

// The data a root page reads first (the lists its table and filters are made from). Each loader keeps its answer, so warming one on hover and then opening the page costs nothing twice.
const DATA: Readonly<Record<string, ReadonlyArray<() => Promise<unknown>>>> = {
  // Home: its file of leaders and the first replayed innings, so coming back to it does not wait on them.
  '/': [fetchHome, () => fetchReplay(0)],
  '/players': [fetchPlayerList, fetchTournamentIndex],
  '/teams': [fetchTeamIndex, fetchTournamentIndex],
  '/matches': [fetchMatchList, fetchTournamentIndex],
  '/tournaments': [fetchTournamentIndex],
  '/series': [fetchMatchList],
  '/records': [fetchRecordsIndex],
};

const decode = (s: string): string => { try { return decodeURIComponent(s); } catch { return ''; } };

/** What the page at this address reads before it can draw: the one file of a player, match, team or tournament, the two of a Compare page, or a root page's lists. The same loaders the pages use, so the page finds the answer. */
function loadsFor(address: string): Array<() => Promise<unknown>> {
  const [path = '', query = ''] = address.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return [...(DATA['/'] ?? [])];
  if (parts.length === 1) return [...(DATA[`/${parts[0]}`] ?? [])];
  if (parts.length !== 2) return [];
  const slug = decode(parts[1]!);
  switch (parts[0]) {
    case 'players': { const id = playerIdFromSlug(slug); return id ? [() => fetchProfile(id)] : []; }
    case 'matches': { const id = matchIdFromSlug(slug); return id ? [() => fetchMatch(id)] : []; }
    case 'teams': return isTeamSlug(slug) ? [() => fetchTeam(slug)] : [];
    case 'tournaments': return isTournamentKey(slug) ? [() => fetchTournament(slug)] : [];
    default: break;
  }
  if (parts[0] === 'compare') {
    const q = new URLSearchParams(query);
    const ids = [q.get('a'), q.get('b')].filter((v): v is string => !!v);
    if (parts[1] === 'players') return ids.flatMap((v) => { const id = playerIdFromSlug(v) ?? v; return /^[0-9a-f]{8}$/.test(id) ? [() => fetchProfile(id)] : []; });
    if (parts[1] === 'teams') return ids.filter(isTeamSlug).map((v) => () => fetchTeam(v));
  }
  return [];
}

const pending = new Map<string, Promise<unknown>>();

/**
 * Starts loading what the page at this address will need, ahead of the click, and returns what it started (or null when there is nothing to load). Failures are ignored: the page asks again when it
 * opens. The answer is kept while it is on its way, so a click can wait for it (`dataOnItsWay`).
 */
export function warmData(address: string): Promise<unknown> | null {
  const have = pending.get(address);
  if (have) return have;
  const loads = loadsFor(address);
  if (loads.length === 0) return null;
  const all = Promise.allSettled(loads.map((load) => load())).finally(() => { pending.delete(address); });
  pending.set(address, all);
  return all;
}

/** The data of this address while it is still coming in, or null when it is here already (or was never asked for). */
export function dataOnItsWay(address: string): Promise<unknown> | null { return pending.get(address) ?? null; }
