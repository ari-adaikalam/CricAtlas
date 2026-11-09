'use client';

import { useEffect } from 'react';
import { warmAllRouteCode } from './routeCode';

/** Starts fetching the code of every kind of page once the first page has settled, so a first click finds it already here. */
export function RouteCodeWarmer() {
  useEffect(() => {
    const start = (): void => warmAllRouteCode();
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const t = window.setTimeout(() => { if (w.requestIdleCallback) w.requestIdleCallback(start, { timeout: 4000 }); else start(); }, 2500);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
