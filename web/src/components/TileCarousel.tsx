'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { usePhone } from './usePhone';
import { useReveal } from './useReveal';
import { whenSteady } from './charts/usePlayOnView';
import { markPeek, peekMove, peekStill, recallTile, rememberTile } from './viewMorph';

export interface TileDef {
  id: string;
  /** The short name under its dot on the timeline. */
  label: string;
  /** The timeline heading it sits under, such as Summary or Shots. */
  group: string;
  title: string;
  /** Text of the hover tip on the title. */
  tip: string;
  /** Where the numbers come from, shown at the right of the title. */
  tag?: 'Cricsheet' | 'Tracking' | 'Live';
  /** A tile as wide as the row, for a chart with a table beside it. */
  wide?: boolean;
  /** A part of the Match details record: a wide panel with its own sizing (`.dp`) instead of a tile of the usual proportions. */
  part?: boolean;
  /** Controls placed beside the title, such as a shot select. */
  control?: ReactNode;
  body: ReactNode;
}

interface Props {
  name: string;
  note: string;
  tiles: readonly TileDef[];
  /** Changes when the view is about a different player. The cards of the tiles on screen play their entrance again when the new player's data arrives. */
  resetKey?: string;
  /** The content changes in the same render as the reset key (a filter), so the tiles on screen restart their entrance at once and settle after this many ms. Without it the entrance waits for new cards to arrive (another player's data). */
  replayMs?: number;
  /** The row is already in place (changing player in the tiles style): no hidden start and no slide, only what is inside fades in. */
  instant?: boolean;
  /** The tiles show the last answers while new ones load (a filter change for the same player): they are dimmed. */
  stale?: boolean;
  /** The line beside the timeline's name, in place of the note. */
  summary?: string;
}

/** The URL parameter that remembers the tile in view, so a reload comes back to it. */
export const TILE_PARAM = 'tile';

/** How many tiles either side of the ones on screen are drawn. */
const DRAW_AHEAD = 3;
/** A tile that has come within DRAW_AHEAD is drawn once the row has been still this long (the animations of the tile that came into view are mostly done by then) and the page is drawing smoothly, never in the middle of a scroll or of an animation: drawing one took 30 to 50 ms. */
const DRAW_AFTER_STILL_MS = 450;

/**
 * The tile row and its timeline, with the markup and behaviour of the player page mockup: two tiles at a time, snap to the start of a tile,
 * a dot for every tile (white for the first one in view, a ring for the second), a red line that fills as the row scrolls, and arrows at the ends.
 */
let gliding: number | null = null;
/**
 * Which tiles are on screen together (Ari, 2026-10-21). A row of tiles shows one wide tile alone, or two half tiles side by side, and never a wide tile cut in half. `pageStart` is the first tile
 * of the page that shows tile `i`: a wide tile is its own page, a half tile starts a pair with the half tile after it, and a half tile whose next tile is wide (or the last) is the second of a pair
 * with the half tile before it. `pageTiles` are the tiles of the page. Both read only whether each tile is wide, so they are tested without a browser.
 */
/** A tile's hover tip is one sentence: what the tile shows (Ari, 2026-10-24). Anything after the first sentence is left out, so no tile can add a second line of detail. */
export function tipText(tip: string): string {
  return tip.split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? tip;
}

export function pageStart(wide: readonly boolean[], i: number): number {
  if (wide[i]) return i;
  if (i + 1 < wide.length && !wide[i + 1]) return i;
  if (i - 1 >= 0 && !wide[i - 1]) return i - 1;
  return i;
}
/**
 * The page a click shows for tile `i` (Ari, 2026-10-22): a tile reached from its left (`dir` 1) takes the right place of its page, with the half tile before it, and a tile reached from its right (-1)
 * takes the left place, with the half tile after it. A wide tile is its own page, and a half tile with no half tile on the wanted side takes the one on the other side.
 */
export function landingPage(wide: readonly boolean[], i: number, dir: 1 | -1): number {
  if (wide[i]) return i;
  const before = i - 1 >= 0 && !wide[i - 1], after = i + 1 < wide.length && !wide[i + 1];
  if (dir > 0) return before ? i - 1 : i;
  return after ? i : before ? i - 1 : i;
}
/** The address and the memory of a view name the marked tile, and end in this when it is the right tile of its page, so a reload shows the same page. */
const RIGHT = '~r';
const splitWanted = (raw: string | null): { id: string | null; right: boolean } => (raw === null ? { id: null, right: false } : raw.endsWith(RIGHT) ? { id: raw.slice(0, -RIGHT.length), right: true } : { id: raw, right: false });
export function pageTiles(wide: readonly boolean[], start: number): number[] {
  return !wide[start] && start + 1 < wide.length && !wide[start + 1] ? [start, start + 1] : [start];
}
/** The half tiles that have no half tile to pair with: a run of exactly one half tile. Not allowed (Ari, 2026-10-21): the view must be arranged differently, and he is asked how. */
export function loneHalves(wide: readonly boolean[]): number[] {
  const lone: number[] = [];
  for (let i = 0; i < wide.length; i++) {
    if (wide[i]) continue;
    const before = i > 0 && !wide[i - 1], after = i + 1 < wide.length && !wide[i + 1];
    if (!before && !after) lone.push(i);
  }
  return lone;
}
/**
 * The page a round button goes to from the page on screen: one tile on (the page that starts at the tile after the first one, or, when that is the same page, at the tile after the last one),
 * and the tile of the new page that the marker goes to, the one beside where the row was (Ari, 2026-10-21).
 */
export function stepTo(wide: readonly boolean[], visible: readonly number[], dir: 1 | -1): { start: number; marker: number } | null {
  if (visible.length === 0) return null;
  const first = visible[0]!, last = visible[visible.length - 1]!;
  let start: number;
  if (dir > 0) {
    if (last >= wide.length - 1) return null;
    start = pageStart(wide, first + 1);
    if (start <= first) start = pageStart(wide, last + 1);
  } else {
    if (first <= 0) return null;
    start = pageStart(wide, first - 1);
  }
  return { start, marker: markerFor(pageTiles(wide, start), visible, dir) };
}
/** The tile the marker is on while a row is still at its start, whatever order the first measurements arrived in: the last tile on screen. Two tiles measured first and a third a moment later, or all three at once, end on the same dot. */
export function startMarker(visible: readonly number[]): number {
  return visible[visible.length - 1] ?? 0;
}
/**
 * The tile a phone swipe ends on: where the drag was heading (the position when the finger lifts plus a little of its speed), but never more than one tile from where the drag started, and always a tile
 * that exists. `velocity` is in pixels per millisecond in the direction the row scrolls, `step` the distance from one tile to the next.
 */
export function swipeTarget(startLeft: number, left: number, velocity: number, step: number, count: number): number {
  const from = Math.round(startLeft / step);
  const projected = Math.round((left + velocity * 140) / step);
  return Math.min(Math.max(projected, from - 1, 0), from + 1, Math.max(0, count - 1));
}
/** The tile of a new page the marker goes to: the new tile nearest to where the row was (moving right the leftmost new one, moving left the rightmost). With no new tile, the first of the page. */
export function markerFor(page: readonly number[], was: readonly number[], dir: 1 | -1): number {
  const added = page.filter((k) => !was.includes(k));
  if (added.length === 0) return page[0]!;
  return dir > 0 ? Math.min(...added) : Math.max(...added);
}

/**
 * Scrolls a row to a position over a time that grows with the distance but stays under 0.8 s. The browser's own smooth scroll finishes a long jump (the Full stats timeline
 * crosses thousands of pixels) in about 200 ms in Safari, which reads as instant. Snapping is off while it runs, so it does not pull the row off the path, and a touch or wheel stops it.
 */
function glide(el: HTMLElement, to: number, reduce: boolean, onFrame: () => void, release = false, after?: () => void): void {
  if (gliding !== null) cancelAnimationFrame(gliding);
  const from = el.scrollLeft, dist = to - from;
  if (reduce || Math.abs(dist) < 2) { el.scrollLeft = to; after?.(); requestAnimationFrame(onFrame); return; }
  // A glide that follows a lifted finger starts at once and slows into place; the others ease in and out.
  const duration = release ? Math.min(460, 180 + Math.abs(dist) * 0.45) : Math.min(800, 380 + Math.abs(dist) * 0.12), start = performance.now();
  el.style.scrollSnapType = 'none'; el.style.scrollBehavior = 'auto';
  const stop = (): void => { if (gliding !== null) cancelAnimationFrame(gliding); gliding = null; done(); };
  const done = (): void => { el.style.scrollSnapType = ''; el.style.scrollBehavior = ''; el.removeEventListener('wheel', stop); el.removeEventListener('touchstart', stop); after?.(); onFrame(); };
  el.addEventListener('wheel', stop, { passive: true }); el.addEventListener('touchstart', stop, { passive: true });
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / duration);
    el.scrollLeft = from + dist * (release ? 1 - Math.pow(1 - t, 3) : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    if (t < 1) { gliding = requestAnimationFrame(step); onFrame(); } else { gliding = null; done(); }
  };
  gliding = requestAnimationFrame(step);
}

export function TileCarousel({ name, note, tiles, resetKey, replayMs, instant = false, stale = false, summary }: Props) {
  // On a phone every tile is a page of its own, whatever its width on a desktop: no pairs, so no lone half tile and a click on a tile always lands on that tile.
  const phone = usePhone();
  const isWide = (t: TileDef): boolean => phone || Boolean(t.wide);
  const car = useRef<HTMLDivElement>(null);
  const rtr = useRef<HTMLDivElement>(null);
  // How the timeline names fit under their dots: all on one line ('one'), on two alternating lines ('two'), or, when even that is too narrow, only the name of the open tile ('tight'). A name never folds.
  const [fit, setFit] = useState<'one' | 'two' | 'tight'>('one');
  // An arrow fades in once with its row. Coming back at the end of the row hides it with `display: none` and showing it again would start the fade a second time, so an arrow that has faded in keeps its class `in` (globals.css).
  const [arrowIn, setArrowIn] = useState({ l: false, r: false });
  const labelKey = tiles.map((t) => t.label).join('|');
  // The tile the row opens on: the one the address names, else the one this view was on when it was left (coming back from another view), whose neighbour is the other tile on screen.
  const memoryKey = `${resetKey ?? ''}|${name}`;
  const [wanted] = useState(() => splitWanted(new URLSearchParams(window.location.search).get(TILE_PARAM) ?? recallTile(memoryKey)));
  const wantedId = wanted.id;
  const [startAt] = useState(() => Math.max(0, tiles.findIndex((t) => t.id === wantedId)));
  // The tiles of the page the row opens on: a wide tile is alone, a pair of half tiles is two. Only these start as seen, so a wide tile does not mark the one peeking beside it.
  const startPage = pageTiles(tiles.map(isWide), pageStart(tiles.map(isWide), startAt));
  const [view, setView] = useState(() => ({ visible: [startAt] as number[], atStart: startAt === 0, atEnd: false }));
  // The tile the timeline marks (Ari, 2026-10-21). It follows the tile that newly came into view, and a click or a round button sets it at once, even when the row does not move.
  const [selectedId, setSelectedId] = useState<string | null>(() => tiles[startAt]?.id ?? null);
  const explicit = useRef<string | null>(startAt > 0 ? tiles[startAt]?.id ?? null : null);
  // The tile an address names stays marked until the row is scrolled by hand.
  const prevVisible = useRef<number[] | null>(null);
  // The tiles of the page the row is gliding to, so a button pressed on the way goes on from there and not from where the glide started.
  const heading = useRef<number[] | null>(null);

  const restored = useRef(false);
  // Set once the row has been away from its first page: after that the marker follows what comes into view.
  const leftStart = useRef(false);
  const tilesNow = useRef(tiles);
  tilesNow.current = tiles;
  // Coming from another view (viewMorph.ts): the row slides in from the side the page is moving towards.
  const [move] = useState(() => peekMove());
  // Another player in the same view: the row is placed on the tile it was on at once (before the first paint), and the strip and timeline do not play an entrance.
  const [still] = useState(() => peekStill());

  const sync = useCallback(() => {
    const el = car.current; if (!el) return;
    // A view that is kept in the page but not shown has no size, and would read as having no tile in view.
    if (el.clientWidth === 0) return;
    const box = el.getBoundingClientRect();
    const visible = [...el.children].map((child, k) => {
      const r = child.getBoundingClientRect();
      const overlap = Math.min(r.right, box.right) - Math.max(r.left, box.left);
      return overlap / r.width >= 0.6 ? k : -1;
    }).filter((k) => k >= 0);
    const edges = { atStart: el.scrollLeft < 8, atEnd: el.scrollLeft >= el.scrollWidth - el.clientWidth - 8 };
    // Scrolling calls this every frame, and a new object each time re-rendered the whole carousel and timeline even when nothing had changed. Between two tiles, with none of them 60% on screen,
    // the tiles that were on screen stay (the marker must not jump to the first tile for a moment).
    setView((was) => {
      const next = { visible: visible.length ? visible : was.visible, ...edges };
      return was.atStart === next.atStart && was.atEnd === next.atEnd && was.visible.length === next.visible.length && was.visible.every((k, i) => k === next.visible[i]) ? was : next;
    });
  }, []);

  // A half tile with no partner is not allowed. This says so while a view is built, in development, whatever data case produced it.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const lone = loneHalves(tiles.map(isWide));
    if (lone.length) console.error(`${name}: ${lone.map((k) => tiles[k]?.id).join(', ')} is a half tile with no half tile to pair with. Ask Ari how to arrange it.`);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [tiles, name]);

  useEffect(() => {
    sync();
    const el = car.current; if (!el) return;
    const observer = new ResizeObserver(sync); observer.observe(el);
    // The row's own entrance slides it in with a transform, and tiles measured halfway are not 60% on screen: the tiles on screen are read again when it ends (found 2026-10-25: a view opened on two tiles in one load in twelve and on three in the others).
    const entered = (e: AnimationEvent): void => { if (e.target === el) sync(); };
    el.addEventListener('animationend', entered);
    // A scroll by hand ends the hold of a click or a button: the marker then follows what comes into view.
    const clear = () => { explicit.current = null; heading.current = null; };
    el.addEventListener('wheel', clear, { passive: true }); el.addEventListener('touchmove', clear, { passive: true });
    return () => { observer.disconnect(); el.removeEventListener('animationend', entered); el.removeEventListener('wheel', clear); el.removeEventListener('touchmove', clear); };
  }, [sync, tiles.length]);

  // Paging on a phone. The browser's own snapping on an iPhone left the row between two tiles, or swung a tile past its place and back (found 2026-10-25), so the row does not snap by
  // itself there (phone.css). While a finger drags it follows the finger. When the finger lifts, the row glides to the tile the drag was heading for: at most one tile from where it started, further only
  // when the row was already past it, and always exactly onto a tile. A row that comes to rest between tiles by any other means is also brought to the nearest one.
  useEffect(() => {
    if (!phone) return;
    const el = car.current; if (!el) return;
    let timer = 0, touching = false, startX = 0, startLeft = 0, lastX = 0, lastT = 0, velocity = 0, moved = false;
    const stepOf = (): number => (el.children.length > 1 ? (el.children[1] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft : 0);
    const clampTo = (left: number): number => Math.min(Math.max(left, 0), Math.max(0, el.scrollWidth - el.clientWidth));
    const goTo = (index: number): void => {
      const step = stepOf(); if (step <= 0) return;
      const to = clampTo(index * step);
      if (Math.abs(el.scrollLeft - to) <= 1) return;
      // The row's own ease-out (Ari chose it on an iPhone, 2026-10-25). An iPhone keeps scrolling by momentum after the finger lifts and a glide set from script alone loses to it, so the momentum is stopped
      // first by hiding the overflow for the length of the glide.
      el.style.overflowX = 'hidden';
      glide(el, to, window.matchMedia('(prefers-reduced-motion: reduce)').matches, sync, true, () => { el.style.overflowX = ''; });
    };
    const settle = (): void => {
      if (touching || gliding !== null) return;
      const step = stepOf(); if (step <= 0) return;
      goTo(Math.round(el.scrollLeft / step));
    };
    const later = (): void => { window.clearTimeout(timer); timer = window.setTimeout(settle, 160); };
    const down = (e: TouchEvent): void => {
      touching = true; moved = false; window.clearTimeout(timer);
      const t = e.touches[0]; if (!t) return;
      startX = lastX = t.clientX; startLeft = el.scrollLeft; lastT = performance.now(); velocity = 0;
    };
    const move = (e: TouchEvent): void => {
      const t = e.touches[0]; if (!t) return;
      const now = performance.now(), dt = now - lastT;
      if (Math.abs(t.clientX - startX) > 6) moved = true;
      if (dt > 0) velocity = 0.7 * velocity + 0.3 * ((lastX - t.clientX) / dt); // px per ms in the direction the row scrolls
      lastX = t.clientX; lastT = now;
    };
    const up = (): void => {
      touching = false;
      const step = stepOf();
      if (moved && step > 0) {
        goTo(swipeTarget(startLeft, el.scrollLeft, velocity, step, el.children.length));
      }
      later();
    };
    el.addEventListener('scroll', later, { passive: true });
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', up, { passive: true });
    el.addEventListener('touchcancel', up, { passive: true });
    return () => { window.clearTimeout(timer); el.removeEventListener('scroll', later); el.removeEventListener('touchstart', down); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', up); el.removeEventListener('touchcancel', up); };
  }, [phone, tiles.length, sync]);

  // Sliding in: the tiles whose slivers show at the edges stay in place and fade in (globals.css, peekIn, peekStay).
  useLayoutEffect(() => {
    const el = rtr.current;
    if (!el) return;
    const measure = (): void => {
      const nodes = Array.from(el.querySelectorAll<HTMLElement>('.nd'));
      if (nodes.length === 0) return;
      const room = Math.min(...nodes.map((n) => n.getBoundingClientRect().width));
      const range = document.createRange();
      let need = 0;
      for (const n of nodes) { const lb = n.querySelector('.lb'); if (!lb) continue; range.selectNodeContents(lb); need = Math.max(need, range.getBoundingClientRect().width); }
      need += 10;
      setFit(need <= room ? 'one' : need <= room * 2 ? 'two' : 'tight');
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, [labelKey]);
  useLayoutEffect(() => {
    const el = car.current; if (!el || !move) return;
    markPeek(el);
    const landed = (e: AnimationEvent): void => {
      if (e.target !== el) return;
      // The attribute stays: the slide animation is chosen by it, and dropping it would start another animation.
      el.setAttribute('data-move', 'landed');
    };
    el.addEventListener('animationend', landed);
    return () => el.removeEventListener('animationend', landed);
    // Read once, as the row is built.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A reload opens on the tile named in the URL, with no animation. After that the first tile in view is written back to the URL (no navigation). Placed before the first paint.
  // A view whose tiles depend on files that are still loading (the story tiles of Match analysis) does not have every tile yet: the row waits for the named tile for a few seconds and keeps its
  // place, so a tile that arrives later in front of it does not push the row onto another tile (found 2026-10-22: a reload landed on a different tile).
  useLayoutEffect(() => {
    const el = car.current; if (!el || restored.current) return;
    const index = tiles.findIndex((t) => t.id === wantedId);
    if (wantedId === null || index === 0) { restored.current = true; return; }
    if (index < 0) return;
    restored.current = true;
    // By id and from the tiles as they are when it runs: the second try comes two frames later, and the tiles may have changed by then.
    const place = () => {
      const now = tilesNow.current;
      const at = now.findIndex((t) => t.id === wantedId);
      const tile = el.children[at] as HTMLElement | undefined; if (!tile) return;
      el.style.scrollBehavior = 'auto';
      const start = landingPage(now.map(isWide), at, wanted.right ? 1 : -1);
      el.scrollLeft = (el.children[start] as HTMLElement).offsetLeft - parseFloat(getComputedStyle(el).paddingLeft);
      el.style.scrollBehavior = '';
      sync();
    };
    // Before the first paint, so a row that comes in on a remembered tile never shows the first ones.
    place();
    requestAnimationFrame(() => requestAnimationFrame(place));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [tiles, sync, wantedId, wanted.right]);
  useEffect(() => {
    if (restored.current || wantedId === null) return;
    const id = window.setTimeout(() => { restored.current = true; sync(); }, 5000);
    return () => window.clearTimeout(id);
  }, [wantedId, sync]);

  // Tiles added or taken away while the row is scrolled: the tile that was in view stays in view.
  const idsKey = tiles.map((t) => t.id).join('|');
  const lastIds = useRef(idsKey);
  const anchorId = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (lastIds.current === idsKey) return;
    lastIds.current = idsKey;
    const el = car.current; const id = anchorId.current;
    if (!el || !id || !restored.current || el.scrollLeft < 8) return;
    const at = tiles.findIndex((t) => t.id === id);
    if (at < 0) return;
    el.style.scrollBehavior = 'auto';
    el.scrollLeft = (el.children[at] as HTMLElement).offsetLeft - parseFloat(getComputedStyle(el).paddingLeft);
    el.style.scrollBehavior = '';
    sync();
  }, [idsKey, tiles, sync]);

  // Opening a view (useReveal): the carousel is built hidden, then fades in sliding from the right. From then on a tile's cards play when it is 20% on screen, the ones on
  // screen now at once. All the tiles are there from the first frame, so the next one is already beside the first when the row arrives.
  // Only the tiles on screen and two either side of them are drawn (Ari, 2026-10-19: every filter or player change redrew all 18 tiles, about 40 ms each, so a page with a lot of data lagged).
  // The next tile is drawn before it is scrolled to, and a tile left far behind keeps what it drew without being redrawn, so scrolling back to it does not play its animation again.
  // The first three tiles are drawn before the reveal, so a heavy view opens as fast as a light one.
  const [, setRevealed] = useState(false);
  const seen = useRef<IntersectionObserver | null>(null);
  useReveal(car, (el) => {
    setRevealed(true);
    if (typeof IntersectionObserver === 'undefined') { el.querySelectorAll(':scope > .tile').forEach((t) => t.setAttribute('data-seen', 'done')); return; }
    // Another player in the same view: the tiles on screen are already in place, so their cards do not play an entrance on the grey frames. The others play when they are scrolled to, as always.
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        // A full width tile starts at 10% of it on screen, any other at 20%.
        // From the left edge half of that share, as in usePlayOnView: a tile coming in from the left shows its right side first.
        const fromLeft = entry.rootBounds !== null && entry.boundingClientRect.left < entry.rootBounds.left;
        const need = (entry.target.classList.contains('wide') ? 0.1 : 0.2) / (fromLeft ? 2 : 1);
        if (!entry.isIntersecting || entry.intersectionRatio < need) continue;
        const tile = entry.target as HTMLElement;
        // The observer reports against where the row is drawn now, and while a view is sliding in that is a frame that is not final (a tile just off the screen read as 97% on it, so the next tile
        // played before it was reached). The layout does not move with the slide, so the share on screen is checked against it too.
        const shown = Math.min(tile.offsetLeft + tile.offsetWidth, el.scrollLeft + el.clientWidth) - Math.max(tile.offsetLeft, el.scrollLeft);
        if (tile.offsetWidth > 0 && shown / tile.offsetWidth < need) continue;
        // 'new' while its cards play in, then 'done': a card that is added or replaced later (a filter changed) must not play the entrance again.
        tile.setAttribute('data-seen', 'new');
        window.setTimeout(() => tile.setAttribute('data-seen', 'done'), 1800);
        observer.unobserve(tile);
      }
    }, { root: el, threshold: [0.05, 0.1, 0.2] });
    seen.current = observer;
    el.querySelectorAll(':scope > .tile:not([data-seen="done"])').forEach((t) => observer.observe(t));
  }, instant || still);
  useEffect(() => () => seen.current?.disconnect(), []);
  // A tile that is added after the view opened (the Tournament page swaps its tiles when the Edition filter changes) is watched like the first ones, or its cards would stay hidden for good.
  useEffect(() => {
    const observer = seen.current, el = car.current;
    if (!observer || !el) return;
    el.querySelectorAll(':scope > .tile:not([data-seen])').forEach((t) => observer.observe(t));
  }, [idsKey]);

  // A different player in the same view: the tiles on screen show their loaders, then new cards. Those cards play their entrance, as the first player's did.
  const lastReset = useRef(resetKey);
  useEffect(() => {
    if (lastReset.current === resetKey) return;
    lastReset.current = resetKey;
    const el = car.current; if (!el) return;
    const box = el.getBoundingClientRect();
    const onScreen = [...el.querySelectorAll<HTMLElement>(':scope > .tile')].filter((t) => {
      const r = t.getBoundingClientRect();
      return (Math.min(r.right, box.right) - Math.max(r.left, box.left)) / r.width >= 0.2;
    });
    if (replayMs !== undefined) {
      // A tile that is still playing from the last change starts again: the mark is taken off and the page's style is flushed, so the animation restarts instead of carrying on.
      onScreen.forEach((t) => { t.removeAttribute('data-seen'); void t.offsetWidth; t.setAttribute('data-seen', 'new'); });
      const done = window.setTimeout(() => onScreen.forEach((t) => t.setAttribute('data-seen', 'done')), replayMs);
      return () => window.clearTimeout(done);
    }
    onScreen.forEach((t) => t.setAttribute('data-seen', 'new'));
    const finish = (): void => onScreen.forEach((t) => t.setAttribute('data-seen', 'done'));
    let after = 0;
    const watch = new MutationObserver(() => {
      if (!onScreen.some((t) => t.querySelector('.kn'))) return;
      watch.disconnect(); window.clearTimeout(fallback); after = window.setTimeout(finish, 1800);
    });
    watch.observe(el, { childList: true, subtree: true });
    const fallback = window.setTimeout(() => { watch.disconnect(); finish(); }, 6000);
    return () => { watch.disconnect(); window.clearTimeout(fallback); window.clearTimeout(after); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [resetKey]);

  const lastVisible = view.visible.length ? view.visible[view.visible.length - 1]! : 0;
  // The tiles beside the ones on screen are drawn a moment after the row stops, so a scroll only moves what is already drawn. Only the tile directly beside the screen is drawn at once.
  const lastScroll = useRef(0);
  const [settled, setSettled] = useState(() => ({ from: (view.visible[0] ?? 0) - DRAW_AHEAD, to: lastVisible + DRAW_AHEAD }));
  const wantFrom = (view.visible[0] ?? 0) - DRAW_AHEAD, wantTo = lastVisible + DRAW_AHEAD;
  useEffect(() => {
    if (settled.from === wantFrom && settled.to === wantTo) return;
    let id = 0;
    const tryNow = (): void => {
      // A smooth scroll goes on after the tile in view has changed, so wait until no scroll event has come for a moment.
      const quiet = performance.now() - lastScroll.current;
      if (quiet < DRAW_AFTER_STILL_MS) id = window.setTimeout(tryNow, DRAW_AFTER_STILL_MS - quiet + 10);
      else cancelSteady = whenSteady(() => setSettled({ from: wantFrom, to: wantTo }), 900);
    };
    let cancelSteady: () => void = () => undefined;
    id = window.setTimeout(tryNow, DRAW_AFTER_STILL_MS);
    return () => { window.clearTimeout(id); cancelSteady(); };
  }, [wantFrom, wantTo, settled]);
  const drawFrom = Math.min(settled.from, (view.visible[0] ?? 0) - 1);
  const drawTo = Math.max(settled.to, lastVisible + 1);
  // A tile near the screen is drawn from its current data. A tile that is far away keeps what it last drew (the same element, so React does not touch it): it is not redrawn on every filter
  // change, and it does not play its animation again when the row comes back to it. It catches up with the filters when the row gets near it again.
  const drawn = useRef(new Map<string, ReactNode>());
  const bodyOf = (tile: TileDef, index: number): ReactNode => {
    if (index >= drawFrom && index <= drawTo) { drawn.current.set(tile.id, tile.body); return tile.body; }
    return drawn.current.get(tile.id) ?? null;
  };

  // The address, the remembered tile and the tile PlayerView puts back follow the marker (Ari, 2026-10-21), not the first tile on screen.
  const markedIndex = selectedId === null ? -1 : tiles.findIndex((t) => t.id === selectedId);
  const firstVisible = markedIndex >= 0 && view.visible.includes(markedIndex) ? markedIndex : view.visible[0] ?? 0;
  useEffect(() => {
    if (!restored.current) return;
    // A view that is kept but not shown must not write its tile into the address of the view on screen.
    if (car.current?.closest('.held')) return;
    const url = new URL(window.location.href);
    const id = tiles[firstVisible]?.id;
    const right = view.visible.length === 2 && firstVisible === view.visible[1];
    const raw = id ? `${id}${right ? RIGHT : ''}` : null;
    if (raw) rememberTile(memoryKey, raw);
    // Read by PlayerView when this view is shown again after being kept, to put the tile back in the address.
    if (raw) car.current?.setAttribute('data-first', raw);
    const left = tiles[view.visible[0] ?? 0]?.id;
    if (left) anchorId.current = left;
    // A row at its start has no tile in the address, even when the marker is on the second tile of the first page.
    const wanted = firstVisible > 0 && raw && !view.atStart ? raw : null;
    if (url.searchParams.get(TILE_PARAM) === wanted) return;
    if (wanted) url.searchParams.set(TILE_PARAM, wanted); else url.searchParams.delete(TILE_PARAM);
    window.history.replaceState(null, '', url);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [firstVisible, tiles, memoryKey, view.atStart]);

  const wideOf = (): boolean[] => tiles.map(isWide);
  const selectedIndex = (): number => {
    const at = selectedId === null ? -1 : tiles.findIndex((t) => t.id === selectedId);
    // A tile chosen by a click or a button is marked at once, while the row is still on its way to it (otherwise the marker steps back to the tile in view first).
    if (at >= 0 && heading.current !== null && explicit.current === selectedId) return at;
    return at >= 0 && view.visible.includes(at) ? at : view.visible[0] ?? 0;
  };
  // The marker follows what comes into view, unless a click or a round button chose the tile and it is on its way.
  useEffect(() => {
    const vis = view.visible, was = prevVisible.current;
    prevVisible.current = vis;
    if (heading.current && heading.current.every((k) => vis.includes(k))) heading.current = null;
    if (explicit.current !== null) return;
    // The row at its start: the marker takes the same place however the first measurements came, until the row has been moved once.
    if (!leftStart.current && (vis[0] ?? 0) === startAt) { setSelectedId(tiles[startMarker(vis)]?.id ?? null); return; }
    leftStart.current = true;
    if (was === null) { setSelectedId((id) => id ?? tiles[vis[0] ?? 0]?.id ?? null); return; }
    const dir: 1 | -1 = (vis[0] ?? 0) >= (was[0] ?? 0) ? 1 : -1;
    const added = vis.filter((k) => !was.includes(k));
    if (added.length === 0) {
      const at = selectedId === null ? -1 : tiles.findIndex((t) => t.id === selectedId);
      if (at < 0 || !vis.includes(at)) setSelectedId(tiles[vis[0] ?? 0]?.id ?? null);
      return;
    }
    setSelectedId(tiles[markerFor(vis, was, dir)]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of what is on screen moves the marker
  }, [view.visible]);

  /** Scrolls the row so the page that starts at tile `start` is on screen. A page already on screen does not move. */
  function showPage(start: number) {
    const el = car.current; if (!el) return;
    const tile = el.children[start] as HTMLElement | undefined; if (!tile) return;
    const pad = parseFloat(getComputedStyle(el).paddingLeft);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    glide(el, Math.max(0, Math.min(el.scrollWidth - el.clientWidth, tile.offsetLeft - pad)), reduce, sync);
  }

  /** A click on a stop of the timeline: the tile is marked at once, and its page is shown (`landingPage`). */
  function go(index: number) {
    const i = Math.max(0, Math.min(tiles.length - 1, index));
    const id = tiles[i]?.id; if (!id) return;
    explicit.current = id; setSelectedId(id);
    const wide = wideOf(), now = heading.current ?? view.visible;
    // A tile already on screen (the page it opened on, say) does not move the row.
    if (now.includes(i)) { heading.current = null; return; }
    // Reached from its left it takes the right place of the page, from its right the left place (Ari, 2026-10-22).
    const start = landingPage(wide, i, i > now[now.length - 1]! ? 1 : -1);
    heading.current = pageTiles(wide, start);
    showPage(start);
  }

  /** The round buttons: one tile on, and the marker on the tile that has come into view beside where the row was. */
  function step(dir: 1 | -1) {
    const to = stepTo(wideOf(), heading.current ?? view.visible, dir); if (!to) return;
    const id = tiles[to.marker]?.id; if (!id) return;
    explicit.current = id; setSelectedId(id);
    heading.current = pageTiles(wideOf(), to.start);
    showPage(to.start);
  }

  const n = tiles.length;
  const here = selectedIndex();
  const first = view.visible[0] ?? 0;
  const others = view.visible.filter((k) => k !== here);
  const groups: Array<{ name: string; items: Array<{ tile: TileDef; index: number }> }> = [];
  tiles.forEach((tile, index) => {
    const g = groups[groups.length - 1];
    if (g && g.name === tile.group) g.items.push({ tile, index }); else groups.push({ name: tile.group, items: [{ tile, index }] });
  });
  const groupOn = tiles[here]?.group;
  const progress = n > 1 ? (view.visible.includes(n - 1) ? n - 1 : first) / (n - 1) : 0;

  return (
    <>
      <div className="stagewrap">
        <div className="car" data-stale={stale ? '' : undefined} ref={car} data-enter={instant || still ? 'instant' : 'wait'} data-move={move ? 'slide' : undefined} data-still={still ? '' : undefined} data-dir={move?.dir} onScroll={() => { lastScroll.current = performance.now(); requestAnimationFrame(sync); }}>
          {tiles.map((tile, index) => (
            <article key={tile.id} data-tile={tile.id} data-seen={still && startPage.includes(index) ? 'done' : undefined} className={`tile${tile.wide ? ' wide' : ''}${tile.part ? ' dp' : ''}`}>
              <h4>
                <span className="ttl" tabIndex={0} data-tip={tipText(tile.tip)}>{tile.title}<em className="inf" aria-hidden="true">i</em></span>
                {tile.control}
                {tile.tag && <i>{tile.tag}</i>}
              </h4>
              {bodyOf(tile, index)}
            </article>
          ))}
        </div>
        <div className="edge l" aria-hidden="true" /><div className="edge r" aria-hidden="true" />
        <button type="button" className={`arr l${arrowIn.l ? ' in' : ''}`} onAnimationEnd={(e) => { if (e.target === e.currentTarget) setArrowIn((a) => (a.l ? a : { ...a, l: true })); }} aria-label="Previous" hidden={view.atStart} onClick={() => step(-1)}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <button type="button" className={`arr r${arrowIn.r ? ' in' : ''}`} onAnimationEnd={(e) => { if (e.target === e.currentTarget) setArrowIn((a) => (a.r ? a : { ...a, r: true })); }} aria-label="Next" hidden={view.atEnd} onClick={() => step(1)}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
      </div>
      <div className="rail">
        <div className="rh"><b>{name}</b>{phone ? <><span>{tiles[here]?.label}</span><em>{here + 1} of {n}</em></> : <span>{summary ?? note}</span>}</div>
        <div className="rtr" ref={rtr} data-fit={phone ? 'tight' : fit} style={{ ['--n' as string]: n }}>
          <div className="line" />
          <div className="prog" style={{ width: `calc((100% - 100%/var(--n))*${progress})` }} />
          <div className="gwrap">
            {groups.map((g) => (
              <div key={g.name} className={`grp${g.name === groupOn ? ' on' : ''}`} style={{ flex: g.items.length }}>
                <span className="gl">{g.name}</span>
                <div className="nodes">
                  {g.items.map(({ tile, index }) => (
                    <button key={tile.id} type="button" data-r={index % 2} className={`nd${index === here ? ' on' : ''}${others.includes(index) ? ' also' : ''}${index < first ? ' seen' : ''}`} aria-label={tile.label} onClick={() => go(index)}>
                      <i /><span className="lb">{tile.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
