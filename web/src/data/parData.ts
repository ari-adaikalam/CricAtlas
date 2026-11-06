import type { ParData } from '@/domain/story';
import { dataBaseUrl } from './sources';

// The par band of a limited-overs match (tools/par_files.py): fetched when the Match analysis opens. Null when the match has none (a Test, or too few comparable innings).
const files = new Map<number, Promise<ParData | null>>();

export function fetchPar(matchId: number): Promise<ParData | null> {
  const have = files.get(matchId);
  if (have) return have;
  const promise = (async () => {
    const response = await fetch(`${dataBaseUrl()}/m/par/${matchId}.json`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`The par band of ${matchId} answered ${response.status}`);
    return (await response.json()) as ParData;
  })().catch((error: unknown) => { files.delete(matchId); throw error; });
  files.set(matchId, promise);
  while (files.size > 12) { const oldest = files.keys().next().value; if (oldest === undefined) break; files.delete(oldest); }
  return promise;
}
