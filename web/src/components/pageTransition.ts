/**
 * Opening another page from a link (Ari, 2026-11-08). The old page used to be cut away at once, the new page started from an empty frame and faded up over half a second, with the bar swapping from one copy
 * to another: it read as a flash. Now the content of the old page fades out in a tenth of a second, the new page is opened under the faded frame, and its content fades in. The top bar (the same on every
 * page) is not part of either fade, so it never changes. The browser's own view transition was tried first: in Safari's engine it showed a dark frame, a bright frame and then the blend.
 *
 * Only for a link to a page of another kind. A move between two players, two matches, two teams or two tournaments keeps its own in-place transition, and so does a change of view
 * on the same address. No fade with reduced motion, or when the address does not change.
 */
const SECTIONS = new Set(['players', 'teams', 'matches', 'tournaments']);
/** How long the old content takes to fade out. */
export const LEAVE_MS = 110;
const FRAME_CAP_MS = 1500;
/** How long the new page is left to settle after it is drawn, before it fades in. */
const SETTLE_MS = 60;

/** Whether the move from this address to that one is within one section's pages (players/a to players/b), which change in place. */
export function inPlace(from: string, to: string): boolean {
  const a = from.split('?')[0]!.split('/').filter(Boolean), b = to.split('?')[0]!.split('/').filter(Boolean);
  return a.length === 2 && b.length === 2 && a[0] === b[0] && SECTIONS.has(a[0]!);
}

/** True when a click on a link to this address opens a page of another kind, so the old content fades out and the new content fades in. */
export function crossesPages(to: string): boolean {
  if (typeof document === 'undefined' || !to.startsWith('/') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const path = to.split('?')[0]!.split('#')[0]!;
  return path !== window.location.pathname && !inPlace(window.location.pathname, path);
}

/** How deep a page sits: 0 Home, 1 a page of lists (Players, Teams, Matches, Tournaments, Series, Records, Compare), 2 a page of one player, team, match, tournament or comparison. */
export function depthOf(path: string): number {
  return Math.min(2, path.split('?')[0]!.split('#')[0]!.split('/').filter(Boolean).length);
}

/** 1 when the link goes deeper (Home to a list, a list to one player), -1 when it goes back up, 0 when it stays as deep (the plain fade then). */
export function directionTo(to: string): -1 | 0 | 1 {
  const a = depthOf(window.location.pathname), b = depthOf(to);
  return b > a ? 1 : b < a ? -1 : 0;
}

/** Resolves when the page of the new address is drawn: the address has changed, no page loader is showing, and a page frame is there, given a moment to settle. */
function pageDrawn(from: string): Promise<void> {
  return new Promise((resolve) => {
    const ok = (): boolean => window.location.pathname !== from && !document.querySelector('[data-page-loader]') && document.querySelector('.pgx, main.page') !== null;
    const observer = new MutationObserver(() => { if (ok()) finish(); });
    const cap = window.setTimeout(() => finish(), FRAME_CAP_MS);
    function finish(): void { observer.disconnect(); window.clearTimeout(cap); window.setTimeout(() => resolve(), SETTLE_MS); }
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    if (ok()) finish();
  });
}

/**
 * Fades the old content out, runs `go` (the router's navigation) once it has, keeps the new page's content hidden until it is drawn, and then fades it in. `data-leaving` and `data-nav` are
 * what globals.css turns into the fades (the bar is left out of both). `done` runs when the new page is in.
 */
export function leaveThen(go: () => void, done?: () => void, to?: string): void {
  const root = document.documentElement, from = window.location.pathname;
  // `data-dir` says which way the page moves: it slides in from the right when it goes deeper and from the left when it goes back (globals.css, wide windows only).
  const dir = to === undefined ? 0 : directionTo(to);
  if (dir !== 0) root.setAttribute('data-dir', dir > 0 ? 'fwd' : 'back');
  root.setAttribute('data-leaving', '');
  window.setTimeout(() => {
    go();
    void pageDrawn(from).then(() => {
      root.setAttribute('data-nav', '1'); root.removeAttribute('data-leaving');
      window.setTimeout(() => { root.removeAttribute('data-nav'); root.removeAttribute('data-dir'); }, 700);
      done?.();
    });
  }, LEAVE_MS);
}
