'use client';

import Link from 'next/link';
import { PrefetchLink } from './PrefetchLink';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { loadMenu, type MenuData, type MenuKey, type MenuLink } from '@/data/navMenu';

// After a click the page changes under a pointer that has not moved. Safari reports the new top bar as the pointer entering it, which would open the menu again, so an
// enter is ignored until the pointer has moved a little from where it clicked. The state is shared because the new bar is a new copy of this component.
let clickedAt: { x: number; y: number } | null = null;
let watching = false;
function lockPointer(x: number, y: number): void {
  clickedAt = { x, y };
  if (watching) return;
  watching = true;
  window.addEventListener('mousemove', (e) => { if (clickedAt && Math.hypot(e.clientX - clickedAt.x, e.clientY - clickedAt.y) > 6) clickedAt = null; }, { passive: true });
}

/**
 * A top bar link that opens a menu of nine of its page on hover or keyboard focus, in two columns, with the page itself as the last link. The list loads on the first
 * hover. A short wait before closing lets the pointer cross the gap between the link and the menu.
 */
export function NavMenuItem({ href, label, menu }: { href: string; label: string; menu: MenuKey }) {
  const [data, setData] = useState<MenuData | null>(null);
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);

  const closeOnClick = (e: ReactMouseEvent): void => { window.clearTimeout(timer.current); setOn(false); if (e.detail > 0) lockPointer(e.clientX, e.clientY); };
  const show = (): void => { window.clearTimeout(timer.current); setOn(true); if (!data) loadMenu(menu).then(setData).catch(() => undefined); };
  const hide = (): void => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOn(false), 140); };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const links = data ? [...data.links, data.all] : [];
  const half = links.length <= 3 ? links.length : Math.ceil(links.length / 2);
  const item = (l: MenuLink): ReactNode => (l.external
    ? <a key={l.id} href={l.href} title={l.title} target="_blank" rel="noopener noreferrer" tabIndex={on ? 0 : -1} onClick={closeOnClick} className={l === data?.all ? 'all' : undefined}>{l.label}</a>
    : <Link key={l.id} href={l.href} title={l.title} tabIndex={on ? 0 : -1} onClick={closeOnClick} className={l === data?.all ? 'all' : undefined}>{l.label}</Link>);
  return (
    <div className="nmi" ref={root} onMouseEnter={() => { if (!clickedAt) show(); }} onMouseLeave={hide} onFocus={show} onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node)) hide(); }} onKeyDown={(e) => { if (e.key === 'Escape') setOn(false); }}>
      <PrefetchLink href={href} aria-haspopup="true" aria-expanded={on && data !== null} onClick={closeOnClick}>{label}</PrefetchLink>
      <div className={`nmp${on && data ? ' on' : ''}${links.length <= 3 ? ' one' : ''}`} aria-hidden={!(on && data)}>
        <div className="nmc">{links.slice(0, half).map((l) => item(l))}</div>
        <div className="nmc">{links.slice(half).map((l) => item(l))}</div>
      </div>
    </div>
  );
}
