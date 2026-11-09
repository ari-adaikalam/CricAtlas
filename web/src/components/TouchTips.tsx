'use client';

import { useEffect } from 'react';

// Chart tooltips on a touch screen (Ari, 2026-10-26: "tooltip for all in phone"). Every chart shows its tooltip from hover: a pointer move sets it and the pointer leaving clears it. A finger has neither: a tap makes
// no move, and the browser says the pointer has left the moment the finger lifts. So a tap on a chart is turned into the hover the chart already understands (a pointer over and a pointer move at the finger's place),
// the real "left" events of a finger are held back, and the tip is cleared with a pointer out when the next tap lands, or when anything scrolls (a swipe to the next tile). Links, buttons and fields are left alone,
// since a hover on a link opens its menu. Mounted once in the layout; it does nothing for a mouse or a pen.
const SKIP = 'a, button, input, select, textarea, label, summary, [role="button"], [role="menuitem"], [role="dialog"], nav, .nav-panel, .fsheet, .pmenu';

export function TouchTips() {
  useEffect(() => {
    let last: Element | null = null;
    const fire = (el: Element, type: string, from: PointerEvent): void => {
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerType: 'mouse', pointerId: 1, isPrimary: true, clientX: from.clientX, clientY: from.clientY, view: window }));
    };
    const clear = (from: PointerEvent | null): void => {
      const el = last; last = null;
      // React derives its leave from pointerout, a chart that listens on its own element (the Pitch map's canvas) waits for pointerleave: both are sent.
      if (el && el.isConnected) { const e = from ?? new PointerEvent('pointerout'); fire(el, 'pointerout', e); fire(el, 'pointerleave', e); }
    };
    const down = (e: PointerEvent): void => {
      if (!e.isTrusted || e.pointerType !== 'touch') return;
      clear(e);
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest(SKIP)) return;
      last = target;
      fire(target, 'pointerover', e);
      fire(target, 'pointermove', e);
    };
    // A finger's own "left" events would clear the tip the moment it lifts.
    const hold = (e: PointerEvent): void => { if (last && e.isTrusted && e.pointerType === 'touch') e.stopPropagation(); };
    const scrolled = (): void => clear(null);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerout', hold, true);
    document.addEventListener('pointerleave', hold, true);
    document.addEventListener('pointercancel', scrolled, true);
    document.addEventListener('scroll', scrolled, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerout', hold, true);
      document.removeEventListener('pointerleave', hold, true);
      document.removeEventListener('pointercancel', scrolled, true);
      document.removeEventListener('scroll', scrolled, true);
    };
  }, []);
  return null;
}
