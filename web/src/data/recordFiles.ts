import type { RecordsCategory, RecordsIndex, RecordsSlices } from '@/domain/recordLists';
import { dataBaseUrl } from './sources';

// The record lists are JSON files built by tools/records_files.py: r/index.json (the scopes and the categories) and r/<scope>/<category>.json (that category's lists for the scope). Each is fetched whole
// in one request and read from memory, never through the query engine.

let index: Promise<RecordsIndex> | null = null;
export function fetchRecordsIndex(): Promise<RecordsIndex> {
  index ??= fetch(`${dataBaseUrl()}/r/index.json`).then(async (r) => {
    if (!r.ok) throw new Error(`The records index answered ${r.status}`);
    return (await r.json()) as RecordsIndex;
  }).catch((e: unknown) => { index = null; throw e; });
  return index;
}

const slicesOf = new Map<string, Promise<RecordsSlices>>();
/** The years, teams, grounds and trophies a scope can be narrowed to: r/<scope>/slices.json. */
export function fetchRecordsSlices(scope: string): Promise<RecordsSlices> {
  if (!SAFE.test(scope)) return Promise.reject(new Error('Not a records scope'));
  const have = slicesOf.get(scope);
  if (have) return have;
  const promise = fetch(`${dataBaseUrl()}/r/${scope}/slices.json`).then(async (r) => {
    if (!r.ok) throw new Error(`The records slices of ${scope} answered ${r.status}`);
    return (await r.json()) as RecordsSlices;
  }).catch((e: unknown) => { slicesOf.delete(scope); throw e; });
  slicesOf.set(scope, promise);
  return promise;
}

const categories = new Map<string, Promise<RecordsCategory>>();
const SAFE = /^[a-z0-9-]{2,80}$/;

export function fetchRecordsCategory(scope: string, category: string, slice: string | null = null): Promise<RecordsCategory> {
  if (!SAFE.test(scope) || !SAFE.test(category) || (slice !== null && !SAFE.test(slice))) return Promise.reject(new Error('Not a records scope'));
  const key = slice ? `${scope}/${slice}/${category}` : `${scope}/${category}`;
  const have = categories.get(key);
  if (have) return have;
  const promise = fetch(`${dataBaseUrl()}/r/${key}.json`).then(async (r) => {
    if (!r.ok) throw new Error(`The records ${key} answered ${r.status}`);
    return (await r.json()) as RecordsCategory;
  }).catch((e: unknown) => { categories.delete(key); throw e; });
  categories.set(key, promise);
  while (categories.size > 24) { const oldest = categories.keys().next().value; if (oldest === undefined) break; categories.delete(oldest); }
  return promise;
}

export function prefetchRecordsScope(scope: string, names: readonly string[], slice: string | null = null): void {
  for (const c of names) fetchRecordsCategory(scope, c, slice).catch(() => undefined);
}
