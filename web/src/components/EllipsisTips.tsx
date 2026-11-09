'use client';

import { useEffect } from 'react';
import { isTruncated, tipFor } from '@/domain/ellipsisTip';

/**
 * Any text the page cuts short with "…" shows its full text on hover or keyboard focus (Ari, 2026-10-24: it was missing at places, such as the match strip). One listener for the whole page, so a
 * new tile or page needs nothing and cannot forget it. An area that already has a tip of its own (`data-tip`, `title`) keeps it.
 */
const DELAY_MS = 350;
const REACH = 6;

/** The nearest area, from the element up, whose text is cut short. */
function cutArea(from: Element | null): HTMLElement | null {
  let el: Element | null = from;
  for (let i = 0; el && el !== document.body && i <= REACH; i++, el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.hasAttribute('data-tip') || el.hasAttribute('title')) return null;
    const cs = getComputedStyle(el);
    if (isTruncated({ textOverflow: cs.textOverflow, lineClamp: cs.getPropertyValue('-webkit-line-clamp') || 'none', scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })) return el;
  }
  return null;
}

export function EllipsisTips(): null {
  useEffect(() => {
    const tip = document.createElement('div');
    tip.className = 'ellip-tip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    let timer = 0;
    let shown: HTMLElement | null = null;

    const hide = (): void => { window.clearTimeout(timer); shown = null; tip.classList.remove('on'); };
    const show = (el: HTMLElement): void => {
      const text = tipFor(el.textContent);
      if (!text || !el.isConnected) return;
      shown = el;
      tip.textContent = text;
      tip.classList.add('on');
      const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - t.width - 8));
      const above = r.top - t.height - 8;
      tip.style.left = `${left}px`;
      tip.style.top = `${above >= 8 ? above : Math.min(r.bottom + 8, window.innerHeight - t.height - 8)}px`;
    };
    const start = (target: EventTarget | null): void => {
      const el = cutArea(target instanceof Element ? target : null);
      if (el === shown) return;
      hide();
      if (el) timer = window.setTimeout(() => show(el), DELAY_MS);
    };
    const over = (e: PointerEvent): void => start(e.target);
    const focus = (e: FocusEvent): void => start(e.target);
    document.addEventListener('pointerover', over, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', hide, true);
    return () => {
      hide(); tip.remove();
      document.removeEventListener('pointerover', over, true); document.removeEventListener('focusin', focus, true);
      document.removeEventListener('pointerdown', hide, true); document.removeEventListener('scroll', hide, true); document.removeEventListener('keydown', hide, true);
    };
  }, []);
  return null;
}
