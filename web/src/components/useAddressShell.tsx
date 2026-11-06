'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PageLoader } from './states/PageStates';
import { ADDRESS_EVENT } from './addressEvents';

/**
 * One prebuilt page serves every player, match, team and tournament address (src/proxy.ts rewrites to it), so the address is read here, in the browser, after the page has hydrated. Until then
 * the loader shows, which is what the page showed while its data came in. The view keeps the address in its own state after that. A link to another address of the same section (the top bar's menus, a link in a list) is a router navigation, which the browser does not announce as a popstate, so the shell announces it (ADDRESS_EVENT) and each view listens for it alongside Back and Forward.
 * Each section has its own shell file (PlayerShell and the others), so a page loads the style sheets of its own view only.
 */
function useAddressSlug(): string | null {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    let name = '';
    try { name = decodeURIComponent(window.location.pathname.split('/')[2] ?? ''); } catch { /* a malformed address never reaches this page: the proxy answers it with a 404 */ }
    setSlug(name);
  }, []);
  return slug;
}

/** Announces a change of address made by a router navigation. A component of its own, so that the router's changes of path re-render only this and never the view beside it. */
function AddressWatch() {
  const pathname = usePathname();
  // The path the browser showed when the page was last settled. The router's own path first reads as the shared page's, then as the real address, which is no change at all.
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const now = window.location.pathname;
    const before = seen.current;
    seen.current = now;
    if (before !== null && before !== now) window.dispatchEvent(new Event(ADDRESS_EVENT));
  }, [pathname]);
  return null;
}

export function AddressShell<T>({ read, children }: { read: (slug: string) => T | null; children: (value: T) => ReactNode }) {
  const slug = useAddressSlug();
  const value = slug === null ? null : read(slug);
  return value === null ? <PageLoader /> : <>{children(value)}<AddressWatch /></>;
}
