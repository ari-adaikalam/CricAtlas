'use client';

import { useEffect, useRef, useState } from 'react';
import { loadDuel, loadSharedMatches, type SharedMatch } from '@/data/compareDuel';
import type { DuelInnings } from '@/domain/compareDuel';
import type { PlayerFilters } from '@/domain/filters';

export interface Duels { innings: DuelInnings[]; shared: SharedMatch[]; fresh: boolean }

/**
 * The balls between the two players in both directions and the matches they shared, for the filters. Loaded when the Versus view is first asked for (`enabled`), then kept: a filter change keeps the last
 * answer on screen until the new one arrives, as the Overall scopes do.
 */
export function useDuels(ids: { a: string; b: string } | null, filters: PlayerFilters | null, enabled: boolean): Duels | null {
  const [state, setState] = useState<{ key: string; innings: DuelInnings[]; shared: SharedMatch[] } | null>(null);
  const live = useRef(0);
  const key = ids && filters ? `${ids.a}|${ids.b}|${filters.format}|${filters.competition ?? ''}|${filters.season ?? ''}` : '';
  useEffect(() => {
    if (!enabled || !ids || !filters) return;
    const mine = ++live.current;
    Promise.all([loadDuel(ids.a, ids.b, 'ab', filters), loadDuel(ids.b, ids.a, 'ba', filters), loadSharedMatches(ids.a, ids.b, filters)])
      .then(([ab, ba, shared]) => { if (live.current === mine) setState({ key, innings: [...ab, ...ba], shared }); })
      .catch((error: unknown) => console.error('Compare duel data failed to load', key, error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return state ? { innings: state.innings, shared: state.shared, fresh: state.key === key } : null;
}
