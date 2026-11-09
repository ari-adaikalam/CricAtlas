'use client';

import { startTransition, useCallback, useEffect, useLayoutEffect, useState } from 'react';

/**
 * Lets a chart load its data early and play its animation only when it is on screen (Ari, 2026-10-18). The element is watched inside its tile row,
 * and the animation counts as played once at least half of it is in view. A new `key` (new data) arms it again, and it plays at once if the chart is
 * already in view. `played` is true for the current key once that has happened, and `playedKey` changes each time, so an effect can restart a scene.
 */
/**
 * Calls `go` once the page is drawing smoothly: three frames in a row less than 34 ms apart, or after `limit` ms at the latest. A new view or tile is rendered in one long burst (about half a
 * second in Safari), and an animation that starts inside the burst has spent most of its time before the first frame is drawn, so it appears to pop. Returns a cancel function.
 */
export function whenSteady(go: () => void, limit = 1500): () => void {
  let frame = 0, last = 0, smooth = 0, cancelled = false;
  const start = performance.now();
  const tick = (now: number): void => {
    if (cancelled) return;
    smooth = last && now - last < 34 ? smooth + 1 : 0;
    last = now;
    if (smooth >= 3 || performance.now() - start > limit) go();
    else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => { cancelled = true; cancelAnimationFrame(frame); };
}

/** The longest a tile waits for smooth frames once it is 20% on screen. Scrolling to a tile is itself a run of slow frames, and waiting for three smooth ones made the animation start only after the tile had come to rest. */
const PLAY_STEADY_LIMIT_MS = 40;

/**
 * Calls `go` when the scroll area that holds `el` has slowed to a crawl (under 60 px a frame for two frames), or is not scrolling, or after `limit` ms at the latest. A tile that comes into view starts
 * to play while the row is still moving, and the work of starting (a render and the first positions of its rows) took one long frame in the middle of the move, which showed as a jolt. In the last
 * frames of the move the row hardly travels, so the same frame is not seen. Returns a cancel function.
 */
/** Pixels a frame under which the row counts as calm. */
const CALM_PX = 140;

function whenCalm(el: Element, go: () => void, limit = 350): () => void {
  const area = el.closest('.car');
  if (!area) { go(); return () => undefined; }
  let frame = 0, last = area.scrollLeft, calm = 0, dead = false;
  const start = performance.now();
  const tick = (): void => {
    if (dead) return;
    const now = area.scrollLeft;
    calm = Math.abs(now - last) < CALM_PX ? calm + 1 : 0;
    last = now;
    if (calm >= 2 || performance.now() - start > limit) go(); else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => { dead = true; cancelAnimationFrame(frame); };
}

/** How long after the carousel starts sliding in what is inside it starts to play, so it is nearly done when the row settles. */
const ENTRANCE_MS = 180;

/** Calls `go` when the carousel that holds `el` has finished sliding in (at once when `el` is not in one, or it came in long ago). Returns a cancel function. */
function afterEntrance(el: Element, go: () => void): () => void {
  const tile = el.closest('[data-enter]');
  if (!tile) { go(); return () => undefined; }
  let frame = 0, timer = 0, dead = false;
  const check = (): void => {
    if (dead) return;
    const at = tile.getAttribute('data-enter-at');
    if (at === null) { frame = requestAnimationFrame(check); return; }
    const wait = Number(at) + ENTRANCE_MS - performance.now();
    if (wait > 0) timer = window.setTimeout(go, wait); else go();
  };
  check();
  return () => { dead = true; cancelAnimationFrame(frame); window.clearTimeout(timer); };
}

/** The states each tile has already played this visit (until the page is reloaded): a chip, innings or filter that goes back to one of them shows it at once (Ari, 2026-10-22). */
// Kept for the tile's id inside its carousel, not for the tile's element: a page that swaps a tile out and back in (the Tournament page's Titles by team, when the Edition filter goes from one edition to all)
// must not show its states as new again. The memory goes when the carousel does.
const SEEN = new WeakMap<Element, Map<string, Set<string>>>();
const seenOf = (el: Element | null): Set<string> | null => {
  const tile = el?.closest('[data-tile]') ?? null;
  if (!tile) return null;
  const car = tile.closest('.car') ?? tile;
  let tiles = SEEN.get(car);
  if (!tiles) { tiles = new Map(); SEEN.set(car, tiles); }
  const id = tile.getAttribute('data-tile') ?? '';
  let set = tiles.get(id);
  if (!set) { set = new Set(); tiles.set(id, set); }
  return set;
};

/** The regions that show a state they have shown before right now. Filled while rendering, so what is inside them (a counting number, a chart scene) knows before it draws its first frame. */
const REPEATING = new WeakSet<Element>();
/** True when `node` is inside a region that shows a state it has already played (no animation, the finished state at once). */
export function isRepeating(node: Element | null): boolean {
  for (let n = node; n; n = n.parentElement) if (REPEATING.has(n)) return true;
  return false;
}

export function usePlayOnView<T extends Element>(key: string): { ref: (node: T | null) => void; played: boolean; playedKey: string | null; repeat: boolean } {
  // A callback ref, so the observer starts whenever the element appears (a chart that waits for its data renders it later).
  const [el, setEl] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setEl(node), []);
  const [inView, setInView] = useState(false);
  const [playedKey, setPlayedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    // 20% (10% for a full width tile) on screen in both directions: across the element, and down it or down the window room it can fill when it is taller than that (a list of hundreds of rows is never 20% on
    // screen at once). Both directions matter: the tile beside the one in view shows a thin strip of itself at the edge, full height, and must not play until it is scrolled to.
    // A tile as wide as the row (a chart with a table beside it) starts at 10%: a tile that large has a long way to go before 20% of it shows.
    const base = el.closest('.tile.wide') ? 0.1 : 0.2;
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const high = Math.min(e.boundingClientRect.height, e.rootBounds?.height ?? window.innerHeight);
        const across = e.boundingClientRect.width > 0 ? e.intersectionRect.width / e.boundingClientRect.width : 0;
        const down = high > 0 ? e.intersectionRect.height / high : 0;
        // A tile coming in from the left shows its right side first, which is not where it starts to draw, so it starts at half of the share: it would otherwise look later than from the right.
        const fromLeft = e.rootBounds !== null && e.boundingClientRect.left < e.rootBounds.left;
        const need = fromLeft ? base / 2 : base;
        // A sliver tile is held at the edge by a transform while its row slides (viewMorph.ts), and the row, which is the root here, sweeps across it: measured against the moving row it looks fully in
        // view for a moment. It does not count until the row has landed (Ari, 2026-10-20).
        const held = el.closest('.car[data-move="slide"] .tile[data-peek], .tile[data-hold]') !== null;
        setInView(e.isIntersecting && across >= need && down >= need && !held);
      }
    }, { root: el.closest('.car'), threshold: [0, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5] });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  // Worked out while rendering, so a state that was seen is never drawn in its waiting state for a frame.
  // Decided once when the key becomes the current one (not again when it has played, which would cut its own entrance short), and kept for as long as the key stays.
  const [lastKey] = useState<{ key: string | null; repeat: boolean; el: Element | null }>({ key: null, repeat: false, el: null });
  if (lastKey.key !== key || lastKey.el !== el) { lastKey.key = key; lastKey.el = el; lastKey.repeat = seenOf(el)?.has(key) ?? false; }
  const repeat = lastKey.repeat;
  if (el) { if (repeat) REPEATING.add(el); else REPEATING.delete(el); }
  // For the stylesheet: nothing inside a repeating region animates (globals.css), set before the browser draws the new content.
  useLayoutEffect(() => { el?.toggleAttribute('data-repeat', repeat); }, [el, repeat, key]);
  useEffect(() => { if (playedKey === key) seenOf(el)?.add(key); }, [playedKey, key, el]);

  useEffect(() => {
    if (!inView || playedKey === key || repeat) return;
    if (typeof requestAnimationFrame === 'undefined') { setPlayedKey(key); return; }
    let cancelSteady: () => void = () => undefined;
    let cancelCalm: () => void = () => undefined;
    const cancelEntrance = el ? afterEntrance(el, () => { cancelCalm = whenCalm(el, () => { cancelSteady = whenSteady(() => startTransition(() => setPlayedKey(key)), PLAY_STEADY_LIMIT_MS); }); }) : () => undefined;
    return () => { cancelEntrance(); cancelCalm(); cancelSteady(); };
  }, [inView, key, playedKey, el, repeat]);
  return { ref, played: playedKey === key || repeat, playedKey, repeat };
}
