'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useLayoutEffect } from 'react';
import { StatePanel, stateStyles } from './StatePanel';

/** First load of a page. It shows at once, so the visitor never sees a blank page. */
let showing = 0;
/** How long a page may take before its loader shows. Matches the delay of the fade-in in globals.css (`[data-page-loader]`). */
const LOADER_DELAY_MS = 450;
export function PageLoader() {
  // The loader stands alone: the site bar and footer are hidden while it shows (Ari, 2026-10-22). The mark stays a moment after it goes, so the bar does not flash before the page draws its own.
  useLayoutEffect(() => {
    showing += 1;
    // The loader and the hiding of the site bar wait a moment (LOADER_DELAY_MS): a page that is ready sooner never flashes either (Ari, 2026-10-24).
    const on = window.setTimeout(() => document.body.setAttribute('data-loading', ''), LOADER_DELAY_MS);
    return () => { window.clearTimeout(on); showing -= 1; window.setTimeout(() => { if (showing === 0) document.body.removeAttribute('data-loading'); }, 250); };
  }, []);
  return (
    <main className="page" data-page-loader>
      <StatePanel kind="loading" size="page" title="Setting the field" text="Loading the data. The first load takes a second or two." />
    </main>
  );
}

export function NotFoundState({ what = 'page' }: { what?: string }) {
  // After the first paint: on a 404 address Next puts the site title back once the page has hydrated.
  useEffect(() => { const id = window.setTimeout(() => { document.title = 'Not found | CricAtlas'; }, 400); return () => window.clearTimeout(id); }, []);
  return (
    <main className="page">
      <StatePanel kind="notfound" title="That one went wide" text={`We could not find that ${what}. Check the address.`}>
        <Link href="/" className={stateStyles.btn}>Go Home</Link>
      </StatePanel>
    </main>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="page">
      <StatePanel kind="error" title="Clean bowled" text="Something went wrong on our side. Try again.">
        <button type="button" className={stateStyles.btn} onClick={onRetry}>Try again</button>
        <Link href="/" className={`${stateStyles.btn} ${stateStyles.quiet}`}>Go Home</Link>
      </StatePanel>
    </main>
  );
}
