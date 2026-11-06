'use client';

import { useEffect, useRef, useState } from 'react';

/** A value loaded for `key`, kept while a new key loads (null before the first answer), so a tile changes its numbers in place. */
export function useAsync<T>(key: string, load: () => Promise<T>, enabled = true): T | null {
  const [state, setState] = useState<{ key: string; value: T } | null>(null);
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    ref.current().then((value) => { if (live) setState({ key, value }); }).catch((error: unknown) => console.error('Compare data failed to load', key, error));
    return () => { live = false; };
  }, [key, enabled]);
  return state?.value ?? null;
}
