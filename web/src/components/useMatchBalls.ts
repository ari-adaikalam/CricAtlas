'use client';

import { useEffect, useState } from 'react';
import { fetchBalls } from '@/data/ballData';
import type { BallFile } from '@/domain/ballByBall';
import { mainInnings, type MatchBundle } from '@/domain/match';

export type MatchBallsLoad = { status: 'loading' } | { status: 'ready'; files: Map<number, BallFile> } | { status: 'error' };

/** The ball files of every innings of the match (and of its Super Overs when `withSuper`), asked for when the view opens. An innings with no file is left out of the tiles that need balls. */
export function useMatchBalls(b: MatchBundle, withSuper = false): MatchBallsLoad {
  const [load, setLoad] = useState<MatchBallsLoad>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    Promise.all((withSuper ? b.innings : mainInnings(b)).map(async (i) => [i.n, await fetchBalls(b.match.id, i.n)] as const))
      .then((pairs) => { if (live) setLoad({ status: 'ready', files: new Map(pairs.flatMap(([n, f]) => (f ? [[n, f] as const] : []))) }); })
      .catch(() => { if (live) setLoad({ status: 'error' }); });
    return () => { live = false; };
  }, [b, withSuper]);
  return load;
}
