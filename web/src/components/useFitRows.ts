'use client';

import { useCallback, useEffect, useState } from 'react';

/** The most height one row may gain, by how many rows there are, so a table of three rows is not stretched into slabs. The mockup's numbers. */
const cap = (rows: number): number => (rows <= 4 ? 160 : rows <= 8 ? 70 : rows <= 12 ? 44 : 26);

/** Stretches the body rows of the tables inside an element to use the height the tile has left, the way the mockup does. Header rows are left as they are. */
function fit(container: HTMLElement, tighten: boolean): void {
  const rows = [...container.querySelectorAll<HTMLTableRowElement>('table tr')];
  rows.forEach((r) => { r.style.height = ''; });
  // Match details: a table that does not fit tightens its row spacing in two steps (`data-fit`, match.css) before it would scroll, as the mockup does.
  if (tighten) {
    const tables = [...container.querySelectorAll<HTMLTableElement>('table')];
    tables.forEach((t) => t.removeAttribute('data-fit'));
    for (const level of ['1', '2']) { if (container.scrollHeight <= container.clientHeight + 1) break; tables.forEach((t) => t.setAttribute('data-fit', level)); }
  }
  const body = rows.filter((r) => !r.querySelector('th') && !r.hasAttribute('data-spacer'));
  const kids = [...container.children];
  if (body.length === 0 || kids.length === 0 || !container.clientHeight) return;
  const style = getComputedStyle(container);
  const top = kids[0]!.getBoundingClientRect().top, bottom = kids[kids.length - 1]!.getBoundingClientRect().bottom;
  const free = container.clientHeight - (bottom - top) - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  if (free < 6) return;
  // Match details parts (`tighten`) have no limit: the rows share the whole panel, so a part with one or two rows is not left mostly empty (Ari, 2026-10-21).
  const add = Math.min(free / body.length - 1, tighten ? Infinity : cap(body.length));
  body.forEach((r) => { r.style.height = `${r.offsetHeight + add}px`; });
  // Row heights are rounded, so the stretched rows can end a few pixels too tall; take that back so a full area never scrolls by a few pixels.
  for (let pass = 0; pass < 3; pass++) {
    const over = container.scrollHeight - container.clientHeight;
    if (over <= 0 || over >= 40) break;
    body.forEach((r) => { r.style.height = `${r.getBoundingClientRect().height - over / body.length - 0.2}px`; });
  }
}

/**
 * A ref for the scroll area of a table tile. The rows are stretched when the area appears, when it is resized (a different window or tile size) and when `key`
 * changes (new data). A tile with more rows than fit keeps its natural height and scrolls.
 */
export function useFitRows<T extends HTMLElement>(key: string, tighten = false): (node: T | null) => void {
  const [el, setEl] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useEffect(() => {
    if (!el) return;
    const run = (): void => { requestAnimationFrame(() => fit(el, tighten)); };
    // The first stretch and tightening happen before the first paint, so the area's final size is known when ScrollGuard decides whether it needs a bar (nothing shifts on screen afterwards).
    fit(el, tighten);
    run();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(run);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, key, tighten]);
  return ref;
}
