'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ComponentProps } from 'react';
import { warmData } from '@/data/warm';
import { warmRouteCode } from './routeCode';
import { openPage, takesOver } from './openPage';

/** How long the pointer rests on a link before the page behind it is warmed. A pointer passing over the bar warms nothing. */
const INTENT_MS = 60;
const warmed = new Set<string>();

/**
 * A link that starts loading its page when the pointer rests on it, or when it is focused or touched (the standard: prefetch on intent, and on press at the latest), so the click finds the page's
 * code and data on their way or already here (Ari, 2026-10-24). The router prefetches the route (in production; the dev server only builds a page when it is asked for, so there one request for
 * the page stands in for it), and the page's data is fetched: the lists of a root page, the one file of a player, match, team or tournament. A click that comes before the data waits for it, up to HOLD_MS.
 * Use it for every link to a page of this site, so no click starts from nothing.
 */
export function PrefetchLink({ href, onPointerEnter, onPointerLeave, onFocus, onPointerDown, onClick, ...rest }: ComponentProps<typeof Link>) {
  const router = useRouter();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const target = typeof href === 'string' ? href : `${href.pathname ?? ''}${href.search ?? ''}`;
  const warm = (): void => {
    if (!target.startsWith('/')) return;
    const path = target.split('?')[0]!;
    if (!warmed.has(path)) {
      warmed.add(path);
      router.prefetch(path);
      if (process.env.NODE_ENV === 'development') void fetch(path, { headers: { 'x-warm': '1' } }).catch(() => undefined);
    }
    warmRouteCode(target);
    warmData(target);
  };
  return (
    <Link
      href={href}
      onPointerEnter={(e) => { onPointerEnter?.(e); window.clearTimeout(timer.current); timer.current = window.setTimeout(warm, INTENT_MS); }}
      onPointerLeave={(e) => { onPointerLeave?.(e); window.clearTimeout(timer.current); }}
      onFocus={(e) => { onFocus?.(e); warm(); }}
      onPointerDown={(e) => { onPointerDown?.(e); warm(); }}
      onClick={(e) => {
        onClick?.(e);
        // Only a plain click on a link to this site is held or blended. A new tab, a download and a modified click go as they are.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (rest.target && rest.target !== '_self') || !target.startsWith('/')) return;
        if (!takesOver(target)) return;
        e.preventDefault();
        openPage(router, target, { replace: rest.replace, scroll: rest.scroll });
      }}
      {...rest}
    />
  );
}
