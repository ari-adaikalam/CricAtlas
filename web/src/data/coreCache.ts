import { deviceCapability } from '@/domain/device';

// The answers of a whole view for one player and one filter combination, kept so that going back to a combination already used (Powerplay, then All phases, then Powerplay again) fills the tiles
// at once, including the big per-ball lists that queryCache.ts does not keep (more than 4,000 rows). Loaders sort and reverse their rows in place, so what is kept is a copy taken the moment an answer
// arrives, and every reader gets its own copy. A light device keeps fewer combinations. Browser memory only, gone with the page.

// A loader may hand back a plain value instead of a promise, so every entry is wrapped.
type Core = Record<string, unknown>;

const sets = new Map<string, Core>();
const limit = (): number => (deviceCapability() === 'light' ? 2 : 6);

function copy<T extends Core>(core: T): T {
  const kept: Core = {};
  for (const [name, promise] of Object.entries(core)) {
    // This callback is attached first, so it runs before a reader's and takes the copy before anything can change the rows.
    const snapshot = Promise.resolve(promise).then((value) => structuredClone(value));
    snapshot.catch(() => undefined);
    kept[name] = snapshot;
  }
  return kept as T;
}

/**
 * The answers for this key. The key must say which view it is for (bat or bowl) as well as the player and filters: two views can build the same filter text, and one must never be given the other's answers. The first time, `start` runs and a copy is kept; later, the kept copy is returned, as fresh copies per reader. A key that changes player or filters is a new key.
 * Only answer sets that finished without an error stay.
 */
export function coreFor<T extends Core>(key: string, start: () => T): T {
  const have = sets.get(key);
  if (have) {
    sets.delete(key); sets.set(key, have);
    const out: Core = {};
    for (const [name, promise] of Object.entries(have)) out[name] = Promise.resolve(promise).then((value) => structuredClone(value));
    return out as T;
  }
  const fresh = start();
  const kept = copy(fresh);
  sets.set(key, kept);
  Promise.all(Object.values(kept) as Array<Promise<unknown>>).catch(() => { if (sets.get(key) === kept) sets.delete(key); });
  while (sets.size > limit()) { const oldest = sets.keys().next().value; if (oldest === undefined) break; sets.delete(oldest); }
  return fresh;
}

/** Forgets every kept answer, for a player whose data changed or for the tests. */
export function clearCores(): void { sets.clear(); }
