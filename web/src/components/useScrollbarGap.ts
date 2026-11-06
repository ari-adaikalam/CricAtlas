import { useLayoutEffect, useRef } from 'react';

/**
 * The table of a root page scrolls under a fixed filter row, and a classic scroll bar takes its width from the table only. The filter row gets the same gap on its right
 * (--sbw), so both end at one edge. An overlay scroll bar is 0 wide and changes nothing.
 */
export function useScrollbarGap() {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    const tbl = el?.querySelector<HTMLElement>('.tbl');
    if (!el || !tbl) return;
    const set = () => el.style.setProperty('--sbw', `${tbl.offsetWidth - tbl.clientWidth}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(tbl);
    return () => ro.disconnect();
  });
  return root;
}
