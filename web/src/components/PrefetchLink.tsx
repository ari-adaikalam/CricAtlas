'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ComponentProps } from 'react';
import { warmData } from '@/data/warm';

/** How long the pointer rests on a link before the page behind it is warmed. A pointer passing over the bar warms nothing. */
const INTENT_MS = 60;
const warmed = new Set<string>();

/**
 * A link that starts loading its page when the pointer rests on it, or when it is focused or touched (the standard: prefetch on intent, and on press at the latest), so the click finds the page's
 * code and data on their way or already here (Ari, 2026-10-24). The router prefetches the route (in production; the dev server only builds a page when it is asked for, so there one request for
 * the page stands in for it), and the page's lists are fetched. Each address is warmed once.
 */
export function PrefetchLink({ href, onPointerEnter, onPointerLeave, onFocus, onPointerDown, ...rest }: ComponentProps<typeof Link>) {
  const router = useRouter();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const warm = (): void => {
    const to = typeof href === 'string' ? href : href.pathname ?? '';
    if (!to.startsWith('/') || warmed.has(to)) return;
    warmed.add(to);
    router.prefetch(to);
    if (process.env.NODE_ENV === 'development') void fetch(to, { headers: { 'x-warm': '1' } }).catch(() => undefined);
    warmData(to.split('?')[0]!);
  };
  return (
    <Link
      href={href}
      onPointerEnter={(e) => { onPointerEnter?.(e); window.clearTimeout(timer.current); timer.current = window.setTimeout(warm, INTENT_MS); }}
      onPointerLeave={(e) => { onPointerLeave?.(e); window.clearTimeout(timer.current); }}
      onFocus={(e) => { onFocus?.(e); warm(); }}
      onPointerDown={(e) => { onPointerDown?.(e); warm(); }}
      {...rest}
    />
  );
}
