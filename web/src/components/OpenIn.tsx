'use client';

import { useRef, type ReactNode } from 'react';
import { useReveal } from './useReveal';

/**
 * The opening of a root page (Ari, 2026-10-24): the list is built hidden, then slides in from the right while it fades, once the page is drawing smoothly, the way a view opens from the profile
 *The heading and the filters fade in with it (globals.css, "Opening a root page"). Rows, bars and counts inside wait for it through `data-enter-at`.
 */
export function OpenIn({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref, undefined, false, true);
  return <div ref={ref} className={className} data-enter="wait">{children}</div>;
}
