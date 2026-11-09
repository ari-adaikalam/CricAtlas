'use client';

import { Children, useState, type ReactNode } from 'react';
import { usePhone } from '../usePhone';

/**
 * A tile with one panel for each side shows one side at a time on a phone (Ari, 2026-10-26): a chip for each side above the panels picks which, and the page's CSS hides the others through `data-side`.
 * Off a phone it returns nothing to draw and no attribute, so the tile is as it was. A side that appears twice (a Test team's two innings) is told apart by its place.
 */
export function useSides(names: readonly string[]): { bar: ReactNode; side: number | undefined } {
  const phone = usePhone();
  const [at, setAt] = useState(0);
  if (!phone || names.length < 2) return { bar: null, side: undefined };
  const picked = Math.min(at, names.length - 1);
  const seen = new Map<string, number>();
  const labels = names.map((n) => { const k = (seen.get(n) ?? 0) + 1; seen.set(n, k); return names.filter((x) => x === n).length > 1 ? `${n} ${k}` : n; });
  const bar = (
    <span className="sw msw sidesw" role="group" aria-label="Side">
      {labels.map((l, i) => <button key={i} type="button" className={i === picked ? 'on' : undefined} onClick={() => setAt(i)}>{l}</button>)}
    </span>
  );
  return { bar, side: picked };
}

/**
 * The panel the chips picked, and only that one: the others are not drawn, so switching back to a panel draws it again from the start and the animation memory (usePlayOnView) shows a state it has played at once, as a chip on the player page does.
 * Off a phone, or with no chips, every panel is returned.
 */
export function pickSide(children: ReactNode, side: number | undefined): ReactNode {
  if (side === undefined) return children;
  const all = Children.toArray(children);
  return all[Math.min(side, all.length - 1)] ?? null;
}
