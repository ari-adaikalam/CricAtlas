import type { MatchBundle } from '@/domain/match';
import { findMatches, prepareMatches, type MatchHit, type MatchSearchPayload, type PreparedMatch } from '@/domain/matchSearch';
import type { SearchGender } from '@/domain/search';
import { dataBaseUrl } from './sources';

// A match page needs one small JSON file for the summary and the scorecards (m/bundle/<id>.json, tools/match_files.py), so it paints with no query engine. The type-ahead that changes
// the match reads one list of every match (m/search.json), the way the player search reads search.json.

const bundles = new Map<number, Promise<MatchBundle | null>>();

export function fetchMatch(matchId: number): Promise<MatchBundle | null> {
  if (!Number.isInteger(matchId) || matchId <= 0) return Promise.resolve(null);
  const have = bundles.get(matchId);
  if (have) return have;
  const promise = (async () => {
    const response = await fetch(`${dataBaseUrl()}/m/bundle/${matchId}.json`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`The match ${matchId} answered ${response.status}`);
    return (await response.json()) as MatchBundle;
  })().catch((error: unknown) => { bundles.delete(matchId); throw error; });
  bundles.set(matchId, promise);
  // A few recent matches stay, so going back to one is instant. Each is tens of kilobytes (a Test is more).
  while (bundles.size > 24) { const oldest = bundles.keys().next().value; if (oldest === undefined) break; bundles.delete(oldest); }
  return promise;
}

/** Starts fetching a match so it is there when the page asks, for a result the pointer is over or the keys are on. */
export function prefetchMatch(matchId: number): void { fetchMatch(matchId).catch(() => undefined); }

let list: Promise<PreparedMatch[]> | null = null;
function matchList(): Promise<PreparedMatch[]> {
  list ??= fetch(`${dataBaseUrl()}/m/search.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`The match list answered ${response.status}`);
      return prepareMatches((await response.json()) as MatchSearchPayload);
    })
    .catch((error: unknown) => { list = null; throw error; });
  return list;
}

/** Starts fetching the list so it is ready before anyone types. */
export function prefetchMatchSearch(): void { matchList().catch(() => undefined); }

/** Every match for the typed text, best first. The panel shows them a page at a time. */
export async function searchMatches(text: string, gender: SearchGender = 'all'): Promise<MatchHit[]> {
  return findMatches(text, await matchList(), gender);
}
