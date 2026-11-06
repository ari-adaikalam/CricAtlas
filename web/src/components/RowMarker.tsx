'use client';

import { useEffect } from 'react';
import { ROW_SELECTOR } from '@/domain/rowSelector';

/**
 * Marks every row and card that plays in with its tile (Ari, 2026-10-24: "rows appear before their tile plays" kept coming back, because the rule that hides them named each kind of row by its class, in three
 * places, and a new kind was missing from them). Inside any element that has `data-rows`, every row in `ROW_SELECTOR` gets `data-mrow`. The stylesheets hide and play `[data-mrow]` and never name a class. The marks
 * are written in a microtask after the page changes, before the browser paints, so a row is hidden from its first frame. One observer does it for the whole page, so a new tile needs nothing.
 */
const MARK = 'data-mrow';

function mark(root: Element): void {
  const within = (el: Element): boolean => el.closest('[data-rows]') !== null;
  if (root.matches(ROW_SELECTOR) && within(root)) root.setAttribute(MARK, '');
  for (const row of Array.from(root.querySelectorAll(ROW_SELECTOR))) if (!row.hasAttribute(MARK) && within(row)) row.setAttribute(MARK, '');
}

export function RowMarker(): null {
  useEffect(() => {
    mark(document.body);
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') { if (r.target instanceof Element) mark(r.target); continue; }
        for (const n of Array.from(r.addedNodes)) if (n instanceof Element) mark(n);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-rows'] });
    return () => observer.disconnect();
  }, []);
  return null;
}
