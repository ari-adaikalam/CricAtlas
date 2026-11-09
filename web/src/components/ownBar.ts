/**
 * The site bar and the bar a page draws inside its own frame (Home, player, team, match, tournament, Compare) are two elements in the same place. A page that draws its own sets `has-app` on the body and the style
 * sheet then takes the site bar out of the layout. Until that mark is there, the page's strip is drawn 60 px low under the site bar, and when the mark comes the strip jumps up: a flash. Opening such a page from a
 * link used to show it for a frame or two (Ari, 2026-11-08), because the mark was set after the first paint, and the page's shell showed the site bar while it read the address.
 *
 * `html.in-view` takes the site bar out of the layout before anything is painted. It is set by the inline script of the layout for an address opened straight (InViewGuard.tsx), and by `holdSiteBar` when a
 * shell for such a page mounts in the browser. It is released as soon as a page has set up its own frame (`has-app`) or a page with no frame of its own is on screen, or after a few seconds whatever happens, so the
 * site bar can never stay out.
 */
let observer: MutationObserver | null = null;
let timer = 0;

const ready = (): boolean => document.body.classList.contains('has-app') || document.querySelector('main.page:not([data-page-loader])') !== null;

function release(): void {
  document.documentElement.classList.remove('in-view');
  observer?.disconnect(); observer = null;
  window.clearTimeout(timer);
}

/** Watches for the page's own frame (or a page without one) and lets the site bar back when it is there. Does nothing unless the site bar is being held. */
export function watchSiteBar(): void {
  if (!document.documentElement.classList.contains('in-view') || observer) return;
  observer = new MutationObserver(() => { if (ready()) release(); });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  timer = window.setTimeout(release, 4000);
  if (ready()) release();
}

/** Takes the site bar out now, for a page that is about to draw its own. Call it before the first paint of the page's shell. */
export function holdSiteBar(): void {
  document.documentElement.classList.add('in-view');
  watchSiteBar();
}
