'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

/** The smallest the content of a panel is shrunk to. */
const FLOOR = 0.3;

/**
 * A panel that must never scroll (Ari, 2026-10-23): when its content is taller than the panel, the content shrinks to fit. The scale is written to the panel as `--z`, and the stylesheet gives each child
 * `zoom: var(--z)`, so a chase with more rows (required rate, need) becomes smaller in a short window instead of getting a scroll bar. It is measured before the browser paints, after every render and when the
 * panel's own size changes (a resized window). The panel must keep its height from the page (a grid area), not from its content.
 */
export function useShrinkToFit<T extends HTMLElement>(): (node: T | null) => void {
  const node = useRef<T | null>(null);
  const fit = useCallback((): void => {
    const el = node.current;
    if (!el) return;
    let z = 1;
    el.style.setProperty('--z', '1');
    // A shrunk text can wrap differently, so the ratio is applied a few times until the content fits.
    for (let i = 0; i < 4 && el.scrollHeight > el.clientHeight + 0.5; i++) {
      z = Math.max(FLOOR, z * (el.clientHeight / el.scrollHeight) - 0.005);
      el.style.setProperty('--z', String(z));
      if (z <= FLOOR) break;
    }
  }, []);
  // After every render, since the content (a chase adds rows) changes with the ball.
  useLayoutEffect(() => { fit(); });
  const observer = useRef<ResizeObserver | null>(null);
  return useCallback((el: T | null) => {
    observer.current?.disconnect();
    node.current = el;
    if (el && typeof ResizeObserver !== 'undefined') { observer.current = new ResizeObserver(fit); observer.current.observe(el); }
    // Rows that are still playing their entrance sit a few pixels low and a font that has not arrived is a different width, so the first measure can be a little off. It is taken again when the
    // entrance animations end and when the fonts are ready, so the scale does not jump later, when something else happens to render.
    if (el) {
      el.addEventListener('animationend', fit);
      void document.fonts?.ready.then(fit);
    }
  }, [fit]);
}
