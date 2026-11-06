import { rankPlayers, type Candidate, type PlayerHit, type SearchGender } from '@/domain/search';
import { dataBaseUrl } from './sources';

let all: Promise<Candidate[]> | null = null;

/**
 * Every player once, with the matches played, from one small file (search.json: arrays of id, name, full name, country, role, first year, last year, matches). It needs no
 * query engine, so typing a name works while the engine is still loading. The list is small, so the typed text is ranked in the browser, which allows typos.
 */
function candidates(): Promise<Candidate[]> {
  all ??= fetch(`${dataBaseUrl()}/search.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`The player list answered ${response.status}`);
      const rows = (await response.json()) as Array<[string, string, string | null, string | null, string | null, number | null, number | null, number, 'M' | 'F' | '' | undefined]>;
      return rows.map(([playerId, name, fullName, country, role, first, last, matches, gender]) => ({ playerId, name, fullName, country, role, first, last, matches, gender }));
    })
    .catch((error: unknown) => { all = null; throw error; });
  return all;
}

/** Starts fetching the list so it is ready before anyone types. */
export function prefetchSearch(): void { candidates().catch(() => undefined); }

/** Players for a typed name, best match first. With nothing typed, the players with most matches. */
export async function searchPlayers(text: string, limit = 8, gender: SearchGender = 'all'): Promise<PlayerHit[]> {
  return rankPlayers(text, await candidates(), Math.max(1, Math.min(20, Math.floor(limit))), gender);
}
