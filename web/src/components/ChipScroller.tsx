'use client';

import { useEffect, useRef, useState, type ReactNode, type WheelEvent } from 'react';

/**
 * A row of chips in a search panel that scrolls sideways, with an arrow at the end that has more (Ari, 2026-10-24). The chips are the children, `.rcomp` buttons (globals.css). `watch` is
 * anything that changes when the chips do (their number), so the arrows are worked out again.
 */
export function ChipScroller({ label, watch, children }: { label: string; watch: number | string; children: ReactNode }) {
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const measure = (): void => { const el = strip.current; if (el) setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }); };
  useEffect(() => {
    measure();
    const el = strip.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(measure);
    o.observe(el);
    return () => o.disconnect();
  }, [watch]);
  const nudge = (dir: 1 | -1): void => strip.current?.scrollBy({ left: dir * Math.max(120, (strip.current?.clientWidth ?? 0) * 0.7), behavior: 'smooth' });
  // A sideways wheel or a vertical one over the chips scrolls them.
  const onWheel = (e: WheelEvent<HTMLDivElement>): void => { e.currentTarget.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; };
  return (
    <div className="rcw">
      {more.left && <button type="button" className="rarr l" aria-label={`Earlier ${label}`} onMouseDown={(e) => e.preventDefault()} onClick={() => nudge(-1)}><span>&#8249;</span></button>}
      <div className="rcomp" ref={strip} role="group" aria-label={label} onWheel={onWheel} onScroll={measure}>{children}</div>
      {more.right && <button type="button" className="rarr r" aria-label={`More ${label}`} onMouseDown={(e) => e.preventDefault()} onClick={() => nudge(1)}><span>&#8250;</span></button>}
    </div>
  );
}
