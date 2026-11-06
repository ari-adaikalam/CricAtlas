'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const GAP = 14, EDGE = 8;

/**
 * A chart tooltip at the pointer. It is drawn into the page body and not inside the tile, so no tile, mask or clip around the chart can move it or cut it off. Before each
 * paint it is measured and placed: below and to the right of the pointer, or above and to the left when it would run past the window edge. It is placed in a layout
 * effect, so the first frame is already in the right spot and the tip does not jump.
 */
export function ChartTip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const dx = x + GAP + w > window.innerWidth - EDGE ? -(w + GAP) : GAP;
    const dy = y + GAP + h > window.innerHeight - EDGE ? -(h + GAP) : GAP;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={ref} className="charttip" style={{ left: x, top: y }} role="presentation">{children}</div>, document.body);
}
