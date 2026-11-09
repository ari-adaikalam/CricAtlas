import { dataOnItsWay, warmData } from '@/data/warm';
import { crossesPages, leaveThen } from './pageTransition';
import { codeOnItsWay } from './routeCode';
import { holdBar } from './barHold';

/**
 * How long a click waits for the page's data before it goes anyway. A page whose data is not here yet draws empty, shows its loader after 450 ms and hides the site bar for it, and then draws a moment
 * later: the bar left and came back, which felt like a jitter (Ari, 2026-11-08). Held on the old page for this long, a click whose data arrives in time goes straight to the finished page. The pointer
 * shows it is working (`data-nav-pending` on the page, styled in globals.css) once the wait is long enough to be noticed.
 */
export const HOLD_MS = 1500;
/** However it goes, the menus are let back after this long. */
const FRAME_SAFETY_MS = 4000;

interface Router { push: (href: string, options?: { scroll?: boolean }) => void; replace: (href: string, options?: { scroll?: boolean }) => void }

/**
 * Opens a page of this site. Every way of opening one goes through here (a link, a row of a list, a search result), so they all behave the same: the page's data is asked for if it was not already, the
 * click waits for it for up to HOLD_MS with the old page still on screen, and the old content then fades out and the new content fades in (pageTransition.ts) when the two are pages of another kind.
 */
export function openPage(router: Router, href: string, options: { replace?: boolean; scroll?: boolean } = {}): void {
  const go = (): void => { if (options.replace) router.replace(href, { scroll: options.scroll }); else router.push(href, { scroll: options.scroll }); };
  if (!href.startsWith('/')) { go(); return; }
  warmData(href);
  // The page's data and the page's code: the old page stays until both are here, so the screen is not emptied while the new page's code arrives (a first visit, with nothing cached).
  const data = dataOnItsWay(href), code = codeOnItsWay(href);
  const coming = data && code ? Promise.all([data, code]) : (data ?? code);
  const fade = crossesPages(href);
  if (!coming && !fade) { go(); return; }
  // Until the new page is drawn, the hover menus (the top bar's and a name's) are shut at once and stay shut. The old page is on screen for a moment longer than it used to be (the wait for the data, the
  // blend), and a pointer that moves a little in that time must not open a menu again: it showed as a menu that appeared and disappeared two or three times (Ari, 2026-11-08).
  const root = document.documentElement;
  root.setAttribute('data-opening', '');
  const releaseBar = holdBar();
  const done = (): void => { releaseBar(); window.clearTimeout(safety); root.removeAttribute('data-opening'); root.removeAttribute('data-leaving'); };
  const safety = window.setTimeout(done, FRAME_SAFETY_MS);
  const open = (): void => { if (fade) leaveThen(go, done, href); else { go(); window.setTimeout(done, 900); } };
  if (!coming) { open(); return; }
  const cue = window.setTimeout(() => root.setAttribute('data-nav-pending', ''), 150);
  void Promise.race([coming, new Promise((resolve) => window.setTimeout(resolve, HOLD_MS))]).then(() => {
    window.clearTimeout(cue); root.removeAttribute('data-nav-pending');
    open();
  });
}

/** Whether a click on a link to this address is taken over by `openPage` (it waits for data or fades), or left to the browser's own navigation. */
export function takesOver(href: string): boolean {
  if (!href.startsWith('/')) return false;
  warmData(href);
  return dataOnItsWay(href) !== null || crossesPages(href);
}
