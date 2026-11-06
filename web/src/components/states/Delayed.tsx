'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** Shows its children only after a short wait, so a load that finishes quickly never flashes a loader. */
export function Delayed({ ms = 300, children }: { ms?: number; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  return show ? <>{children}</> : null;
}
