'use client';

import { useLayoutEffect, type RefObject } from 'react';

/**
 * Keeps a dropdown inside the window: its height is the room between its top and the bottom of the window, it scrolls inside, and its width stops at the right edge. Measured when it opens, when its content changes
 * and when the window is resized, since where the box sits depends on the page around it (a summary is centred in the window).
 */
export function useFitPanel(box: RefObject<HTMLElement | null>, open: boolean, content: unknown): void {
  useLayoutEffect(() => {
    const panel = box.current?.querySelector<HTMLElement>('.res');
    if (!panel || !open) return;
    const fit = (): void => {
      panel.style.maxHeight = ''; panel.style.maxWidth = '';
      const box = panel.getBoundingClientRect();
      panel.style.maxHeight = `${Math.max(160, Math.floor(window.innerHeight - box.top - 16))}px`;
      // In a narrow window the panel, anchored to its search box, can run past either edge. Narrowing it keeps its anchored side where it is.
      const room = Math.max(200, box.left < 8 ? box.right - 8 : box.right > window.innerWidth - 8 ? window.innerWidth - box.left - 8 : box.width);
      panel.style.maxWidth = `${Math.floor(room)}px`;
    };
    fit();
    // New results start at the top of the list.
    panel.scrollTop = 0;
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [box, open, content]);
}
