'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * A page that keeps its filters in its address (Records, Series) reads the address when it opens. A link to the same page with another address (a choice in the top bar menu) changes the address
 * and nothing else, so the page has to notice. `apply` is called with the new address when it changed from outside. `written` holds the address the page last wrote itself with
 * `history.replaceState`, so the page's own changes are not read back as if they were a link.
 */
export function useAddressChange(apply: (params: URLSearchParams) => void, written: MutableRefObject<string | null>): void {
  const params = useSearchParams();
  const current = params.toString();
  const first = useRef(true);
  const latest = useRef(apply);
  latest.current = apply;
  useEffect(() => {
    if (first.current) { first.current = false; written.current = current; return; }
    if (current === written.current) return;
    written.current = current;
    latest.current(new URLSearchParams(current));
  }, [current, written]);
}
