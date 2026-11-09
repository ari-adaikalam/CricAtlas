'use client';

import { useEffect, useRef, useState } from 'react';
import { loadFielding, loadPlayedMatches, loadStatBat, loadStatBowl } from '@/data/fullStats';
import { withPlayer } from '@/data/withPlayer';
import type { SummaryRow } from '@/domain/batting';
import { applyFilters, type PlayerFilters } from '@/domain/filters';
import type { StatBat, StatBowl } from '@/domain/fullStats';

/** What a player holds under the Format, Competition and Season of the comparison: the innings and spells, the matches played, the fielding and the awards. */
export interface PlayerScope { bat: StatBat[]; bowl: StatBowl[]; played: number; catches: number; stumpings: number; potm: number }

async function loadScope(playerId: string, rows: readonly SummaryRow[], filters: PlayerFilters): Promise<PlayerScope> {
  const [bat, bowl, field, matches] = await withPlayer(playerId, () => Promise.all([loadStatBat(playerId, filters), loadStatBowl(playerId, filters), loadFielding(playerId, filters), loadPlayedMatches(playerId, filters)]));
  const n = (kinds: string[]): number => field.filter((f) => kinds.includes(f.kind)).reduce((a, f) => a + f.n, 0);
  return {
    bat, bowl, catches: n(['catch', 'caught_and_bowled']), stumpings: n(['stumping']), potm: matches.filter((m) => m.potm).length,
    // Matches played agree with the profile: the playing XI lists, counted in the summary rows of the choices.
    played: applyFilters(rows, filters).reduce((a, r) => a + (r.appearances ?? 0), 0),
  };
}

export interface Scopes { a: PlayerScope | null; b: PlayerScope | null; /** False while the numbers of the last choices are still on screen and new ones are on their way. */ fresh: boolean }

/**
 * The two players' scopes for the filters. A filter change keeps the last numbers until the new ones arrive (the tiles dim, then change in place); another pair of players starts empty.
 */
export function useScopes(ids: { a: string; b: string } | null, rows: { a: readonly SummaryRow[]; b: readonly SummaryRow[] } | null, filters: PlayerFilters | null): Scopes {
  const [state, setState] = useState<{ pair: string; key: string; a: PlayerScope; b: PlayerScope } | null>(null);
  const live = useRef(0);
  const pair = ids ? `${ids.a}|${ids.b}` : '';
  const key = `${pair}|${filters?.format}|${filters?.competition ?? ''}|${filters?.season ?? ''}`;
  useEffect(() => {
    if (!ids || !rows || !filters) return;
    const mine = ++live.current;
    Promise.all([loadScope(ids.a, rows.a, filters), loadScope(ids.b, rows.b, filters)])
      .then(([a, b]) => { if (live.current === mine) setState({ pair, key, a, b }); })
      .catch((error: unknown) => console.error('Compare data failed to load', key, error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const mine = state && state.pair === pair ? state : null;
  return { a: mine?.a ?? null, b: mine?.b ?? null, fresh: mine !== null && mine.key === key };
}
