// Moving between the profile and the views, and between views, is one dissolve: the view being left is copied as a still
// layer on top of the page and fades out once the new content starts to play, so the two overlap and nothing is cut or blank. A flight of the photo and name between the profile and the
// top bar was tried and Ari did not want it.

const FADE_MS = 600;
const SLIDE_MS = 800;

/** The tile each view of each player was on when it was left, so coming back to it opens on the same tile (Ari, 2026-10-19). Kept for the session. */
const remembered = new Map<string, string>();
export const rememberTile = (key: string, id: string): void => { remembered.set(key, id); };
export const recallTile = (key: string): string | null => remembered.get(key) ?? null;

/** The pane of the view on screen. Several panes can be in the page (visited views are kept), and only this one is displayed. */
/** The page frame on screen. The Compare page keeps two frames (players and teams) and shows one of them, so the one on top is asked for first. */
export const currentApp = (): HTMLElement | null => document.querySelector<HTMLElement>('.cs.on .pgx .app') ?? document.querySelector<HTMLElement>('.pgx .app');

export function activePane(): HTMLElement | null {
  const app = currentApp();
  const view = /(?:^|\s)view-(\w+)/.exec(app?.className ?? '')?.[1];
  return view ? app?.querySelector<HTMLElement>(`#p-${view}`) ?? null : null;
}

/** Forgets which tile each view was on. The tile is only remembered while you move between the views of one player: going to the profile or changing player ends it. */
export const clearRemembered = (): void => { remembered.clear(); };

/** Which way the page is moving between two views (+1 to a later one, -1 to an earlier one). The next carousel reads it as it is built and slides in from that side. */
export interface Move { dir: 1 | -1 }
let move: Move | null = null;
export const peekMove = (): Move | null => move;

/** True while a view is being rebuilt for another player: the ball filter strip and the timeline are the same for any player, so they stay as they are and only the tiles change. */
let still = false;
export const peekStill = (): boolean => still;

/** Whether a tile shows only part of itself at the left or right edge of its row: a sliver. */
export function isSliver(tile: DOMRect, left: number, right: number): boolean {
  return (tile.left < right - 1 && tile.right > right + 1) || (tile.left < left - 1 && tile.right > left + 1);
}

/** Marks the tiles that peek in at the left and right edges of a row (data-peek), so they can stay in place and fade while the row slides. */
export function markPeek(car: HTMLElement, onto: HTMLElement = car): void {
  const box = car.getBoundingClientRect();
  // The sliver stays where it is while its row slides, so it is moved back by the row's own distance (globals.css, peekStay). That distance is the row's width.
  onto.style.setProperty('--carW', `${car.offsetWidth}px`);
  const tiles = car.querySelectorAll<HTMLElement>(':scope > .tile');
  const target = onto.querySelectorAll<HTMLElement>(':scope > .tile');
  tiles.forEach((tile, i) => {
    if (isSliver(tile.getBoundingClientRect(), box.left, box.right) && target[i]) target[i]!.setAttribute('data-peek', '');
  });
}

/** Copies the pane on screen into a layer above it. It fades when the new view's row has started to play (or after a short wait when the new page has no row), then removes itself. */
export function leaveAsLayer(pane: HTMLElement | null, dir?: 1 | -1, toProfile = false, samePage = false): void {
  move = null;
  still = samePage;
  if (samePage) window.setTimeout(() => { still = false; }, 4000);
  const host = pane?.offsetParent as HTMLElement | null;
  if (!pane || !host) return;
  if (dir) {
    move = { dir };
    window.setTimeout(() => { move = null; }, 4000);
  }
  const layer = pane.cloneNode(true) as HTMLElement;
  layer.removeAttribute('id');
  layer.classList.add('ghost');
  if (dir) layer.setAttribute('data-dir', String(dir));
  layer.querySelectorAll('[data-enter]').forEach((el) => el.removeAttribute('data-enter'));
  if (samePage) layer.querySelectorAll<HTMLElement>('.bfbar, .sbar, .rail').forEach((el) => { el.style.visibility = 'hidden'; });
  const from = [...pane.querySelectorAll<HTMLElement>('.car')];
  // A row marks its slivers when it slides in and keeps the marks (TileCarousel). The copy must be marked for where its tiles are now, or a tile that peeked then and fills the screen now would fade out and
  // hold still while the row leaves (found 2026-10-22 on the Team page: one tile arrived alone because the one leaving had faded).
  layer.querySelectorAll('[data-peek]').forEach((tile) => tile.removeAttribute('data-peek'));
  layer.querySelectorAll<HTMLElement>('.car').forEach((car, i) => { if (from[i]) markPeek(from[i]!, car); });
  Object.assign(layer.style, { position: 'absolute', top: `${pane.offsetTop}px`, left: `${pane.offsetLeft}px`, width: `${pane.offsetWidth}px`, height: `${pane.offsetHeight}px`, display: 'flex', zIndex: '4', pointerEvents: 'none' });
  host.appendChild(layer);
  // The copy must show the tiles that were on screen, not the first ones. A scroll position can only be set on an element that is in the page, and the row scrolls smoothly (the stylesheet), which
  // would show the first tiles and then travel to the right ones, so the jump is made without smoothing.
  layer.querySelectorAll<HTMLElement>('.car').forEach((car, i) => { car.style.scrollBehavior = 'auto'; car.style.scrollSnapType = 'none'; car.scrollLeft = from[i]?.scrollLeft ?? 0; });
  // Going to the profile: the profile stays hidden until the view's layer has finished fading, so the two never overlap. The attribute is dropped on the layer's transitionend, which is the same
  // moment the fade ends, so the profile starts in the next frame (a timed delay drifted from it while the new page was being built).
  const app = host.closest('.app');
  if (toProfile) {
    app?.setAttribute('data-hold-sum', '');
    layer.addEventListener('transitionend', (e) => { if (e.target === layer && e.propertyName === 'opacity') app?.removeAttribute('data-hold-sum'); });
    window.setTimeout(() => app?.removeAttribute('data-hold-sum'), 1800);
  }
  const t0 = performance.now();
  const check = (): void => {
    // The Replay has no carousel row: its own container announces itself in the same way.
    const car = activePane()?.querySelector('.car, .rview') ?? null;
    const started = car?.getAttribute('data-enter') === 'play' || car?.getAttribute('data-enter') === 'instant' || host.closest('.app')?.classList.contains('state-sum') === true;
    if (started || performance.now() - t0 > 1200) {
      const slides = dir !== undefined;
      if (slides) layer.classList.add('slide');
      else if (host.closest('.app')?.classList.contains('state-sum')) layer.classList.add('to-profile');
      layer.classList.add('gone');
      window.setTimeout(() => layer.remove(), (slides ? SLIDE_MS : FADE_MS) + 60);
    } else requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

/**
 * Plays the entrance of a view that was kept in the page (it was visited before and has not been rebuilt), the way the slide of a view that is built fresh looks: the row slides in from the side
 * the page is moving towards, the strip fades, the timeline is wiped the way the row moves, and the tile that peeks at the right edge fades in during the slide. The row keeps its
 * tiles, its scroll position and the animations it has played, so nothing inside it plays again.
 */
export function playKept(pane: HTMLElement | null, dir: 1 | -1): void {
  const car = pane?.querySelector<HTMLElement>('.car, .rview');
  if (!pane || !car || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ease = 'cubic-bezier(0.22, 0.7, 0.25, 1)';
  const from = `translateX(${dir * 100}%)`;
  // Measured before anything is animated, and with snapping off: a tile moved by a transform moves its snap point, and the row would re-snap to another tile in the middle of the slide.
  const box = car.getBoundingClientRect(), width = car.offsetWidth;
  const slivers = [...car.querySelectorAll<HTMLElement>(':scope > .tile')].filter((tile) => isSliver(tile.getBoundingClientRect(), box.left, box.right));
  car.style.scrollSnapType = 'none';
  const slide = car.animate([{ opacity: 0, transform: from, offset: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1, transform: 'none', offset: 1 }], { duration: 750, easing: ease, fill: 'backwards' });
  slide.finished.then(() => { car.style.scrollSnapType = ''; }, () => { car.style.scrollSnapType = ''; });
  pane.querySelector('.bfbar, .sbar')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: 'ease', fill: 'backwards' });
  const open = 'inset(-20px -20px -20px -20px)';
  pane.querySelector('.rail, .rpbar')?.animate([{ clipPath: dir === 1 ? 'inset(-20px -20px -20px 100%)' : 'inset(-20px 100% -20px -20px)' }, { clipPath: open }], { duration: 750, easing: ease, fill: 'backwards' });
  slivers.forEach((tile) => {
    tile.animate([{ opacity: 0 }, { opacity: 1 }], { delay: 350, duration: 300, easing: 'ease', fill: 'both' });
    // data-hold keeps the tile from counting as in view while the row sweeps over it (usePlayOnView).
    tile.setAttribute('data-hold', '');
    const stay = tile.animate([{ transform: `translateX(${-dir * width}px)` }, { transform: 'none' }], { duration: 750, easing: ease, fill: 'backwards' });
    const release = (): void => tile.removeAttribute('data-hold');
    stay.finished.then(release, release);
  });
}
