'use client';

import { useEffect, type RefObject } from 'react';
import { whenSteady } from './charts/usePlayOnView';

/**
 * The opening animation of a page or view (Ari, 2026-10-18), for every page now and in the future. Put `data-enter="wait"` on the element that holds the page's content and call this
 * with a ref to it. The content is built while hidden (the first few tiles only, so that is quick), and shown on the first frames that are smooth: three in a row, at most 0.4 s. Setting
 * `data-enter="play"` and `data-enter-at` is what starts the CSS (globals.css: the content fades in, sliding in from the right for a carousel).
 * Everything inside waits for `data-enter-at` through usePlayOnView and useTableMotion, so rows, bars and counts start as the content settles. `onShow` runs once at that moment.
 * The attributes are written to the element directly, so nothing re-renders.
 */
export function useReveal(ref: RefObject<HTMLElement | null>, onShow?: (el: HTMLElement) => void, immediate = false, quick = false): void {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    // A row that comes in with no animation of its own (the tiles style of changing player, where only the contents fade): the cards and rows inside are told it has landed.
    if (immediate) {
      el.setAttribute('data-enter-at', String(Math.round(performance.now() - 2000)));
      onShow?.(el);
      return;
    }
    let cancel: () => void = () => undefined;
    let frame = 0;
    const show = (): void => {
      if (el.getAttribute('data-enter') === 'play') return;
      el.setAttribute('data-enter-at', String(Math.round(performance.now())));
      el.setAttribute('data-enter', 'play');
      onShow?.(el);
    };
    // A hidden tab draws no frames, so the content is shown after a while whatever happens.
    const fallback = window.setTimeout(show, 2500);
    // The view starts to come in on the first smooth frame. It does not wait for the data of any tile: a tile that has no data yet shows its loader and fills in as the data arrives,
    // as it does when a filter changes. Waiting for the data made views that the query engine answers open after a blank of over a second.
    // `quick` (a root page, Ari, 2026-10-24): the content is ready when it is built, so it starts to come in on the next frame instead of waiting for three smooth ones.
    const loaded = (): void => { if (quick) show(); else cancel = whenSteady(show, 400); };
    frame = requestAnimationFrame(loaded);
    return () => { window.clearTimeout(fallback); cancelAnimationFrame(frame); cancel(); };
    // The content is built once per mount, and onShow is only read when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
