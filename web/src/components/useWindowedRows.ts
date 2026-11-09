'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** A table or list with more rows than this is drawn a window at a time. */
export const WINDOW_OVER = 60;
/** Rows drawn above and below the visible ones, so a quick scroll does not reach a blank. */
const OVERSCAN = 12;
/** On a phone the window is wider and moves less often (see `update`). */
const PHONE_OVERSCAN = 30;
/** Rows of the window that must remain beyond the visible ones before it moves, on a phone. */
const MARGIN = 6;
/** Rows drawn before the first measurement. */
const FIRST = 40;

export interface Windowed<T extends HTMLElement> {
  /** Merge into the scroll area of the table (the element that holds it and scrolls). */
  ref: (node: T | null) => void;
  /** Draw rows from `from` up to (not including) `to`. */
  from: number;
  to: number;
  /** Height of the rows not drawn above and below, for a spacer row each. 0 when every row is drawn. */
  before: number;
  after: number;
  windowed: boolean;
}

/**
 * Draws only the rows of a long table that are on screen. Opponent tables hold hundreds of rows for a long career, and drawing every one made
 * the page about 13,000 elements, which slowed every filter and player change and the scroll between tiles. The scroll area keeps the height of the whole table through a spacer row above
 * and below the rows drawn, so the scroll bar and the position behave as if every row were there. Row height is measured from the rows drawn (a row that wraps is taller), so the window
 * follows where the scroll really is. `resetKey` starts again at the top for a different list.
 */
export interface WindowOptions {
  /** CSS selector of the rows drawn (a spacer must not match it). Table rows by default. */
  rows?: string;
  /** Which element scrolls: the one the ref is on (default), or the parent of it (put the ref on a hidden marker first in the list), or the nearest ancestor that matches a selector (the marker sits in a wrapper inside the scroll area). */
  scroller?: 'self' | 'parent' | { closest: string };
}

export function useWindowedRows<T extends HTMLElement>(total: number, resetKey: string, options: WindowOptions = {}): Windowed<T> {
  const rowSelector = options.rows ?? 'tbody tr:not([data-spacer])';
  const scrollerOf = options.scroller ?? 'self';
  const windowed = total > WINDOW_OVER;
  const [range, setRange] = useState({ key: resetKey, from: 0, to: Math.min(total, FIRST) });
  const node = useRef<T | null>(null);
  const rowHeight = useRef(36);
  const ref = useCallback((el: T | null) => { node.current = el; }, []);
  const current = range.key === resetKey ? range : { key: resetKey, from: 0, to: Math.min(total, FIRST) };

  const area = (): HTMLElement | null => (scrollerOf === 'parent' ? node.current?.parentElement ?? null : typeof scrollerOf === 'object' ? node.current?.closest<HTMLElement>(scrollerOf.closest) ?? null : node.current);

  // Measure the rows drawn, so the spacers and the window use the real step from one row to the next (a gap between rows counts).
  useLayoutEffect(() => {
    const el = area();
    if (!el || !windowed) return;
    const rows = [...el.querySelectorAll<HTMLElement>(rowSelector)];
    if (rows.length === 0) return;
    const step = rows.length > 1 ? (rows[rows.length - 1]!.offsetTop - rows[0]!.offsetTop) / (rows.length - 1) : rows[0]!.offsetHeight;
    rowHeight.current = Math.max(16, step);
  });

  useEffect(() => {
    const el = area();
    if (!el || !windowed) return;
    let frame = 0;
    const update = (): void => {
      frame = 0;
      const h = rowHeight.current;
      const first = Math.floor(el.scrollTop / h), last = Math.ceil((el.scrollTop + el.clientHeight) / h);
      const phone = window.matchMedia('(max-width: 760px)').matches;
      const over = phone ? PHONE_OVERSCAN : OVERSCAN;
      setRange((was) => {
        // The rows drawn change only when the visible ones come within a few rows of the edge of what is drawn, and then a good way past it. Changing them on every row of a scroll made iPhone Safari drop the momentum of a
        // flick (the table stopped dead or stuttered), because the content under a gliding finger changed again and again.
        const settled = phone && was.key === resetKey && first - MARGIN >= was.from && last + MARGIN <= was.to;
        if (settled) return was;
        const from = Math.max(0, first - over), to = Math.min(total, last + over);
        return was.key === resetKey && was.from === from && was.to === to ? was : { key: resetKey, from, to };
      });
    };
    const onScroll = (): void => { if (!frame) frame = requestAnimationFrame(update); };
    el.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [windowed, total, resetKey]);

  if (!windowed) return { ref, from: 0, to: total, before: 0, after: 0, windowed: false };
  const to = Math.min(total, current.to);
  const from = Math.min(current.from, to);
  return { ref, from, to, before: Math.round(from * rowHeight.current), after: Math.round((total - to) * rowHeight.current), windowed: true };
}
