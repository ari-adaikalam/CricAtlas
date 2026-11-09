'use client';

import { usePathname } from 'next/navigation';
import { PrefetchLink } from './PrefetchLink';
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { loadMenu, type MenuData, type MenuKey, type MenuLink } from '@/data/navMenu';
import { warmRouteCode } from './routeCode';

// After a click the page changes under a pointer that has not moved. Safari reports the new top bar as the pointer entering it, which would open the menu again, so an
// enter is ignored until the pointer has moved clear of where it clicked. The state is shared because the new bar is a new copy of this component.
// The first entry of a menu sits a few pixels under its label, and a hand resting on the mouse wanders that far, which opened the menu again right after a click (Ari, 2026-11-08): the
// distance is wide enough that only a move meant for the bar clears it.
const CLEAR_PX = 44;
let clickedAt: { x: number; y: number } | null = null;
// The top bar item the click came from (its menu or its label). The new bar is a new copy with no hover and no focus, so its label would drop from white to grey and, once the browser noticed the
// pointer again, go white again: a blink. While the pointer is still where it clicked, the copy keeps that label white, as the old one was (Ari, 2026-11-08).
let clickedItem: string | null = null;
const changes = new Set<() => void>();
let watching = false;
/** A move over the label opens the menu too (see the label's onMouseMove): the first row of a menu is within the distance of its label, so after a click on it the pointer enters the label while still locked, and without a new enter the menu would stay shut until the pointer left and came back.
 * The lock is also released here: the enter of the label comes before the window's mousemove below in the same event, so on the first move that crosses the distance the enter would still find the lock set and the menu would not open until the pointer left and came back. */
function releaseIfFar(x: number, y: number): void {
  if (clickedAt && Math.hypot(x - clickedAt.x, y - clickedAt.y) > CLEAR_PX) { clickedAt = null; clickedItem = null; changes.forEach((f) => f()); }
}
function lockPointer(x: number, y: number, item: string): void {
  clickedAt = { x, y };
  clickedItem = item;
  changes.forEach((f) => f());
  if (watching) return;
  watching = true;
  window.addEventListener('mousemove', (e) => {
    releaseIfFar(e.clientX, e.clientY);
  }, { passive: true });
}

/**
 * A top bar link that opens a menu of nine of its page on hover or keyboard focus, in two columns, with the page itself as the last link. The list loads on the first
 * hover. A short wait before closing lets the pointer cross the gap between the link and the menu.
 */
export function NavMenuItem({ href, label, menu }: { href: string; label: string; menu: MenuKey }) {
  const [data, setData] = useState<MenuData | null>(null);
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const cancelWatch = useRef<(() => void) | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(false);
  // A click leaves the menu open while the page opens, and a change from one player to another has no fade to close it with: once the address has changed the menu closes, instead of hanging over the new page until the timer below.
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } window.clearTimeout(timer.current); setOn(false); }, [pathname]);
  // Every copy of the bar takes part, including the layout's own, which is mounted all the time and only hidden: all follow the click when it happens, not only when they mount.
  useLayoutEffect(() => {
    const sync = (): void => setHeld(clickedAt !== null && clickedItem === href);
    sync();
    changes.add(sync);
    return () => { changes.delete(sync); };
  }, [href]);

  // A click does not shut the menu: while the page opens (up to a short wait for its data, then the fade) the menu stays as it is and fades out with the old page, so the screen does not change under the
  // click before the next page is on its way (Ari, 2026-11-08: the menu vanishing at once read as Home flashing). If the address does not change, it closes after a moment. A link to another site closes it at once.
  const closeOnClick = (e: ReactMouseEvent, external = false): void => {
    window.clearTimeout(timer.current);
    if (e.detail > 0) lockPointer(e.clientX, e.clientY, href);
    if (external) { setOn(false); return; }
    timer.current = window.setTimeout(() => setOn(false), 1800);
    // The menu closes when the address changes, the query included: Records and Series entries change only the query, and the API entries only `?tile=`, so the path alone does not say the page has changed.
    const from = window.location.pathname + window.location.search, until = performance.now() + 3000;
    cancelWatch.current?.();
    let frame = 0;
    const watch = (): void => {
      if (window.location.pathname + window.location.search !== from) { window.clearTimeout(timer.current); setOn(false); return; }
      if (performance.now() < until) frame = requestAnimationFrame(watch);
    };
    frame = requestAnimationFrame(watch);
    cancelWatch.current = () => cancelAnimationFrame(frame);
  };
  const show = (): void => { window.clearTimeout(timer.current); setOn(true); warmRouteCode(href + '/x'); if (!data) loadMenu(menu).then(setData).catch(() => undefined); };
  const hide = (): void => { if (document.documentElement.hasAttribute('data-opening')) return; window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOn(false), 140); };
  useEffect(() => () => { window.clearTimeout(timer.current); cancelWatch.current?.(); }, []);

  const links = data ? [...data.links, data.all] : [];
  const half = links.length <= 3 ? links.length : Math.ceil(links.length / 2);
  const item = (l: MenuLink): ReactNode => (l.external
    ? <a key={l.id} href={l.href} title={l.title} target="_blank" rel="noopener noreferrer" tabIndex={on ? 0 : -1} onClick={(e) => closeOnClick(e, true)} className={l === data?.all ? 'all' : undefined}>{l.label}</a>
    : <PrefetchLink key={l.id} href={l.href} title={l.title} tabIndex={on ? 0 : -1} onClick={closeOnClick} className={l === data?.all ? 'all' : undefined}>{l.label}</PrefetchLink>);
  return (
    <div className={`nmi${held ? ' held' : ''}`} ref={root} onMouseEnter={(e) => { releaseIfFar(e.clientX, e.clientY); if (!clickedAt) show(); }} onMouseMove={(e) => { releaseIfFar(e.clientX, e.clientY); if (!on && !clickedAt && !document.documentElement.hasAttribute('data-opening')) show(); }} onMouseLeave={hide} onFocus={show} onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node)) hide(); }} onKeyDown={(e) => { if (e.key === 'Escape') setOn(false); }}>
      <PrefetchLink href={href} aria-haspopup="true" aria-expanded={on && data !== null} onClick={closeOnClick}>{label}</PrefetchLink>
      <div className={`nmp${on && data ? ' on' : ''}${links.length <= 3 ? ' one' : ''}`} aria-hidden={!(on && data)}>
        <div className="nmc">{links.slice(0, half).map((l) => item(l))}</div>
        <div className="nmc">{links.slice(half).map((l) => item(l))}</div>
      </div>
    </div>
  );
}
