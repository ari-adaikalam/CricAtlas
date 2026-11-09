'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePlayOnView } from './charts/usePlayOnView';

import { ROW_SELECTOR } from '@/domain/rowSelector';

/** The rows the motion applies to (the one list: domain/rowSelector.ts). */
const ROWS = ROW_SELECTOR;
/** At most this many rows animate in, and only the ones that are on screen. The rest are there at once, so a tall table never takes seconds to appear. */
export const REVEALED = 24;
/** The stagger stops growing after this many rows, so the last visible rows do not wait for the first. */
const STAGGERED = 12;

type Ref<T> = (node: T | null) => void;

/**
 * The motion of a table (Ari, 2026-10-18), for the element that holds its rows.
 *  - Row reveal: the rows fade in and rise, 60 ms apart, the first few only, when the table is on screen. It plays again when `dataKey` changes (new data), and not when only
 *    the order changes. The element gets `data-rows="wait"` until then and `data-rows="play"` after, which globals.css turns into the motion.
 *  - Re-rank slide: rows with a `data-rk` slide from where they were to where they are now when `orderKey` changes (a sort, a search), instead of jumping.
 * It uses opacity and transform only, and nothing runs with reduced motion. Extra refs (such as useFitRows) are merged in.
 */
export function useTableMotion<T extends HTMLElement>(dataKey: string, orderKey: string, ...extra: Array<Ref<T>>): { ref: Ref<T>; motion: 'wait' | 'play' | 'seen'; played: boolean } {
  const { ref: playRef, played, repeat } = usePlayOnView<T>(dataKey);
  // The orders this table has shown: going back to one slides nothing (a state that was already shown appears at once).
  const seenOrders = useRef<Set<string>>(new Set());
  const orderData = useRef<string | null>(null);
  const lastOrder = useRef<string | null>(null);
  const node = useRef<T | null>(null);
  const shownKey = useRef<string | null>(null);
  const extras = useRef(extra);
  extras.current = extra;
  const ref = useCallback((el: T | null) => { node.current = el; playRef(el); for (const r of extras.current) r(el); }, [playRef]);

  // Each row gets its place in the order for the stagger, before the browser paints. This runs when the data changes, not when only the order does, so a row that a sort moves up
  // into the first few does not fade in again.
  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    const rows = [...el.querySelectorAll<HTMLElement>(ROWS)];
    // New data starts from the top: a list left scrolled down would show rows that never animate, and blank space where the new list is shorter.
    if (shownKey.current !== null && shownKey.current !== dataKey) {
      let up: HTMLElement | null = rows[0]?.parentElement ?? null;
      while (up && up !== el.ownerDocument.body && !/(auto|scroll)/.test(getComputedStyle(up).overflowY)) up = up.parentElement;
      if (up && up !== el.ownerDocument.body) up.scrollTop = 0;
    }
    shownKey.current = dataKey;
    // New data plays its rows in; a table that was only re-sorted does not play them again.
    el.removeAttribute('data-reordered');
    // Read every position first and then write, so the browser lays the page out once. A row animates when it is on screen or just below it (inside the list's own scroll area and the window), so the rows at the bottom edge do not pop in while the ones above fade.
    let scroller: HTMLElement | null = rows[0]?.parentElement ?? null;
    while (scroller && scroller !== el.ownerDocument.body && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const limit = Math.min(scroller && scroller !== el.ownerDocument.body ? scroller.getBoundingClientRect().bottom : Infinity, window.innerHeight);
    // Each table (or list) counts its own rows, so two tables side by side play together and do not wait for each other.
    const counts = new Map<Element, number>();
    const place = rows.map((row) => { const group = row.closest('table, .fbars, .ptr, .bpc, .tpc') ?? el; const n = counts.get(group) ?? 0; counts.set(group, n + 1); return n; });
    const late = rows.map((row, i) => place[i]! >= REVEALED || row.getBoundingClientRect().top >= limit + 240);
    rows.forEach((row, i) => {
      row.style.setProperty('--i', String(Math.min(place[i]!, STAGGERED)));
      row.toggleAttribute('data-late', late[i]);
    });
  }, [dataKey, played]);

  // Slide the rows that moved. Positions are kept relative to the table, so scrolling between two renders does not matter.
  const last = useRef<Map<string, number> | null>(null);
  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    const now = new Map<string, number>();
    const rows = [...el.querySelectorAll<HTMLElement>('[data-rk]')];
    for (const row of rows) now.set(row.dataset.rk!, row.offsetTop);
    const before = last.current;
    last.current = now;
    const seenOrder = seenOrders.current.has(orderKey);
    seenOrders.current.add(orderKey);
    // A sort or another chip changes the order of the same rows: the rows that come into the window afterwards are there at once, they do not fade in.
    // Only when the order really changed: an effect that runs twice on mount (development) must not show the rows of a table that has not played yet.
    if (before && orderData.current === dataKey && lastOrder.current !== null && lastOrder.current !== orderKey) el.setAttribute('data-reordered', '');
    orderData.current = dataKey;
    lastOrder.current = orderKey;
    if (seenOrder || repeat) return;
    if (!before || typeof row0(rows)?.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Only rows that were or are within a screen of the visible part slide. The rest, which no one can see, just move.
    const top = el.scrollTop - 120, bottom = el.scrollTop + el.clientHeight + 120;
    const near = (y: number): boolean => y >= top && y <= bottom;
    for (const row of rows) {
      const was = before.get(row.dataset.rk!), is = now.get(row.dataset.rk!);
      if (was === undefined || is === undefined || Math.abs(was - is) < 2 || !(near(was) || near(is))) continue;
      row.animate([{ transform: `translateY(${was - is}px)` }, { transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [orderKey]);

  // A safety net: a table that is on screen and has still not started three seconds later plays anyway, so its rows are never left hidden (the cells blank while the borders show).
  const [forcedKey, setForcedKey] = useState<string | null>(null);
  useEffect(() => {
    if (played || repeat) return;
    const id = window.setTimeout(() => {
      const el = node.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const box = (el.closest('.car') ?? document.documentElement).getBoundingClientRect();
      const shown = Math.min(r.right, box.right) - Math.max(r.left, box.left);
      if (r.width > 0 && shown > r.width * 0.5 && r.bottom > 0 && r.top < window.innerHeight) setForcedKey(dataKey);
    }, 3000);
    return () => window.clearTimeout(id);
  }, [played, repeat, dataKey]);
  const start = played || forcedKey === dataKey;
  return { ref, motion: repeat ? 'seen' : start ? 'play' : 'wait', played: start };
}

const row0 = (rows: HTMLElement[]): HTMLElement | undefined => rows[0];
