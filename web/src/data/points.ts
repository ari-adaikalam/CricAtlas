import { emptyPointSet, parsePointFile, type PointSet } from '@/domain/pointFile';
import { dataBaseUrl } from './sources';
import { playerHas } from './store';

// A batter's point file (tools/point_files.py), fetched whole and kept for the page: the tiles that draw individual balls filter it in JavaScript and never ask the query engine. A batter with no
// ball on the ground has no file, and the profile says so, so nothing is asked for. Null means the file could not be had, and the loader that asked falls back to the query engine.

/** pts is a batter's file, ptb a bowler's. */
export type PointKind = 'pts' | 'ptb';
/** Raise this when the point files are rebuilt in place: files are cached for a year, and a new address makes every browser and the edge fetch the new ones. 2 added the catch flag. */
const FILE_VERSION = 2;
const kept = new Map<string, Promise<PointSet | null>>();
const LIMIT = 6;

/** Somewhere else to get the file, such as Node for the build scripts and the check against the SQL. Null reads it over HTTP. */
let source: ((playerId: string, kind: PointKind) => Promise<PointSet | null>) | null = null;
export function usePointSource(next: ((playerId: string, kind: PointKind) => Promise<PointSet | null>) | null): void { source = next; }

export function loadPoints(playerId: string, kind: PointKind = 'pts'): Promise<PointSet | null> {
  if (source) return source(playerId, kind);
  if (!playerHas(playerId, kind)) return Promise.resolve(emptyPointSet());
  const id = `${kind}:${playerId}`;
  const have = kept.get(id);
  if (have) { kept.delete(id); kept.set(id, have); return have; }
  const work = fetch(`${dataBaseUrl()}/p/${kind}/${playerId}.bin?v=${FILE_VERSION}`)
    .then(async (response) => (response.status === 404 ? emptyPointSet() : response.ok ? parsePointFile(await response.arrayBuffer()) : null))
    .catch(() => null)
    .then((set) => { if (set === null) kept.delete(id); return set; });
  kept.set(id, work);
  while (kept.size > LIMIT) { const oldest = kept.keys().next().value; if (oldest === undefined) break; kept.delete(oldest); }
  return work;
}

/** Starts fetching a player's point file, so it is in memory before a view asks. */
export function prefetchPoints(playerId: string): void { void loadPoints(playerId); void loadPoints(playerId, 'ptb'); }
