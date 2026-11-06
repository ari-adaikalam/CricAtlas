import { buildReplay, HERO_INNINGS, type HeroSpec, type Replay } from '@/domain/homeReplay';
import type { HomeFile } from '@/domain/homePage';
import { fetchBalls } from './ballData';
import { fetchMatch } from './matchData';
import { dataBaseUrl } from './sources';

// The Home page reads its replayed innings from the same match bundle and ball file the match page uses, and everything else from one small file, home.json (tools/home_files.py).

let home: Promise<HomeFile> | null = null;

export function fetchHome(): Promise<HomeFile> {
  home ??= fetch(`${dataBaseUrl()}/home.json`).then(async (r) => {
    if (!r.ok) throw new Error(`home.json answered ${r.status}`);
    return (await r.json()) as HomeFile;
  }).catch((error: unknown) => { home = null; throw error; });
  return home;
}

const replays = new Map<number, Promise<Replay | null>>();

/** The replay of the nth innings of the rotation. Kept once fetched, so coming round to it again is instant. */
export function fetchReplay(index: number): Promise<Replay | null> {
  const spec: HeroSpec | undefined = HERO_INNINGS[index];
  if (!spec) return Promise.resolve(null);
  const have = replays.get(index);
  if (have) return have;
  const promise = (async () => {
    const [bundle, file] = await Promise.all([fetchMatch(spec.matchId), fetchBalls(spec.matchId, spec.innings)]);
    const inn = bundle?.innings.find((i) => i.n === spec.innings);
    return bundle && inn && file ? buildReplay(bundle, inn, file, spec.batterId) : null;
  })().catch((error: unknown) => { replays.delete(index); throw error; });
  replays.set(index, promise);
  return promise;
}
