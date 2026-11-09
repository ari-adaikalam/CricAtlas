'use client';

import { useEffect } from 'react';
import { watchSiteBar } from './ownBar';

/**
 * Opening a player, team, match, tournament or Compare page straight (a refresh, a link) used to show the site bar for a moment, and the page's own strip was drawn under it, 60 px low, until the page mounted and took the site bar away, when the strip jumped up. The inline script in the
 * layout (IN_VIEW_SCRIPT) marks the document before anything is painted, and the style sheet hides the site bar while the mark is there. This takes the mark off as soon as a page has set up its own
 * frame (`has-app`), or after a few seconds whatever happens, so the bar can never stay hidden (ownBar.ts).
 */
export const IN_VIEW_SCRIPT = "(function(){try{if(/^\\/(players|teams|matches|tournaments)\\/[^/]+/.test(location.pathname)||/^\\/compare(\\/|$)/.test(location.pathname)){document.documentElement.classList.add('in-view');}}catch(e){}})();";

export function InViewGuard(): null {
  useEffect(() => { watchSiteBar(); }, []);
  return null;
}
