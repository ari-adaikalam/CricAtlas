'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** How long the ball turns before the next rows are added, so a click is seen to be heard. Long enough to read, short enough not to be a wait. */
const BEAT_MS = 360;

/**
 * The "Show 50 more" button of a long list (Ari, 2026-10-25). The rows are already in the page, and adding fifty of them can take a moment, so a click shows a small turning ball in the button first
 * (the app's own ball, as the loader) alone in place of its words and adds the rows on the next beat. The button keeps the width and height it had, so it does not shrink under the pointer, and it is not pressed twice while it turns.
 */
export function MoreButton({ onMore, children }: { onMore: () => void; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const button = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const press = (): void => {
    if (busy) return;
    const r = button.current?.getBoundingClientRect(); setSize(r ? { w: r.width, h: r.height } : undefined);
    setBusy(true);
    // Two frames, so the ball is painted before the rows are added: adding them is what takes the time.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      timer.current = window.setTimeout(() => { onMore(); setBusy(false); }, BEAT_MS);
    }));
  };
  return (
    <button ref={button} type="button" className="moreb" disabled={busy} aria-busy={busy} onClick={press} aria-label={busy ? 'Loading more' : undefined} style={busy && size ? { width: size.w, height: size.h } : undefined}>
      {busy ? <img className="mb" src="/brand/icons/icon-A-leather.svg" alt="" width={20} height={20} /> : children}
    </button>
  );
}
