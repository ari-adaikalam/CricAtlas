'use client';

import { useCallback, useEffect, useState } from 'react';

const DEFAULT = { w: 600, h: 160 };
/** Below this the chart keeps its default shape, so a hidden or collapsed tile never draws into nothing. */
const MIN = { w: 240, h: 90 };

/**
 * The size, in pixels, of the element a chart draws into. The chart uses it as its own viewBox, so it fills the tile whatever shape the tile has and its text
 * stays at its real size. Until the element is measured it has the default 600 by 160 shape.
 */
export function useBox<T extends Element>(): { ref: (node: T | null) => void; w: number; h: number } {
  const [el, setEl] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setEl(node), []);
  const [size, setSize] = useState(DEFAULT);
  useEffect(() => {
    if (!el) return;
    const read = (): void => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      setSize((old) => (w >= MIN.w && h >= MIN.h ? (old.w === w && old.h === h ? old : { w, h }) : old.w === DEFAULT.w && old.h === DEFAULT.h ? old : DEFAULT));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return { ref, ...size };
}
