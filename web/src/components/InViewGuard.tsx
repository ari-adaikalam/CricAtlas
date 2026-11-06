'use client';

import { useEffect } from 'react';

/**
 * Opening a player, team, match, tournament or Compare page straight (a refresh, a link) used to show the site bar for a moment, and the page's own strip was drawn under it, 60 px low, until the page mounted and took the site bar away, when the strip jumped up. The inline script in the
 * layout (IN_VIEW_SCRIPT) marks the document before anything is painted, and the style sheet hides the site bar while the mark is there. This takes the mark off as soon as a page has set up its own
 * frame (`has-app`), or after a few seconds whatever happens, so the bar can never stay hidden, and a later move to a page that needs it brings it back.
 */
export const IN_VIEW_SCRIPT = "(function(){try{if(/^\\/(players|teams|matches|tournaments)\\/[^/]+/.test(location.pathname)||/^\\/compare(\\/|$)/.test(location.pathname)){document.documentElement.classList.add('in-view');}}catch(e){}})();";

export function InViewGuard(): null {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains('in-view')) return;
    const release = (): void => { root.classList.remove('in-view'); observer.disconnect(); window.clearTimeout(timer); };
    // A page with no frame of its own (not found, an error) keeps the site bar, so it is let back as soon as one of those panels is on screen.
    const ready = (): boolean => document.body.classList.contains('has-app') || document.querySelector('main.page:not([data-page-loader])') !== null;
    const observer = new MutationObserver(() => { if (ready()) release(); });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    const timer = window.setTimeout(release, 4000);
    if (ready()) release();
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, []);
  return null;
}
