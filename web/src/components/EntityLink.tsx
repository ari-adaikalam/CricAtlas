'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { menuFor, primaryHref, type EntityRef, type MenuItem } from '@/domain/links';
import { prefetchMatch } from '@/data/matchData';
import { prefetchPlayerAll } from '@/data/profileData';
import { prefetchTeam } from '@/data/teamData';
import { teamSlug } from '@/domain/slug';

const OPEN_MS = 140, CLOSE_MS = 160;

/**
 * Starts fetching what the page behind a name will need, the way a search result does when the pointer or the arrow keys are on it: a player's profile with their photo, their recorded views and
 * (on a device that can afford it) their files, or a match's bundle. The few hundred milliseconds between the pointer arriving and a click are used for this. A click made sooner just waits for it.
 */
function warm(entity: EntityRef): void {
  if (entity.id === null) return;
  if (entity.kind === 'player') prefetchPlayerAll(String(entity.id));
  else if (entity.kind === 'match') prefetchMatch(Number(entity.id));
  else if (entity.kind === 'team') prefetchTeam(teamSlug(String(entity.id)));
}

function Icon({ kind }: { kind: MenuItem['icon'] }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
  if (kind === 'compare') return <svg {...common}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.4-3 2.6-4.8 5.5-4.8s5 1.8 5.5 4.8" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M16 14.4c2.6 0 4.2 1.4 4.6 3.8" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3.2" /><path d="M6.2 18.2c1.2-2.3 3.2-3.5 5.8-3.5s4.6 1.2 5.8 3.5" /></svg>;
}

/**
 * A name that leads somewhere (Ari, 2026-10-20). A player's name is a link to their profile and, on hover or keyboard focus, opens a small menu (View profile, Compare this player). A match goes
 * straight to its page. A name with nothing built behind it is drawn as plain text, so no link ever leads to a missing page. The menu is drawn outside the page's rows (a portal), so a tile or a
 * scrolling row never clips it, and it stays inside the window.
 */
export function EntityLink({ entity, children, className }: { entity: EntityRef; children: ReactNode; className?: string }) {
  const href = primaryHref(entity);
  const items = menuFor(entity);
  const anchor = useRef<HTMLAnchorElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef(0);
  const menuId = useId();

  const place = useCallback((): void => {
    const el = anchor.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 240, height = items.length * 52 + 16;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left));
    const below = r.bottom + 6, above = r.top - height - 6;
    setPos({ left, top: below + height > window.innerHeight - 8 && above > 8 ? above : below });
  }, [items.length]);
  const open = useCallback((delay: number): void => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { place(); warm(entity); }, delay); }, [place, entity]);
  const close = useCallback((delay: number): void => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setPos(null), delay); }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!pos) return;
    const away = (): void => setPos(null);
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') setPos(null); };
    window.addEventListener('scroll', away, true); window.addEventListener('resize', away); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('scroll', away, true); window.removeEventListener('resize', away); window.removeEventListener('keydown', key); };
  }, [pos]);

  if (!href) return <>{children}</>;
  // A short fade when the next page arrives.
  const leaving = (): void => { document.documentElement.setAttribute('data-nav', '1'); window.setTimeout(() => document.documentElement.removeAttribute('data-nav'), 1500); };
  const hasMenu = items.length > 0;
  // A name with no menu (a match) has nothing to open, so hover only warms the page behind it.
  const warmOnly = !hasMenu ? { onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => warm(entity), OPEN_MS); } }, onFocus: () => warm(entity) } : {};
  return (
    <>
      <Link ref={anchor} href={href} className={`el${className ? ` ${className}` : ''}`} onClick={leaving}
        {...warmOnly}
        {...(hasMenu ? { 'aria-haspopup': 'menu' as const, 'aria-expanded': pos !== null, 'aria-controls': pos ? menuId : undefined,
          onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') open(OPEN_MS); }, onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') close(CLOSE_MS); },
          onFocus: (e: React.FocusEvent<HTMLAnchorElement>) => { if (e.currentTarget.matches(':focus-visible')) open(0); }, onBlur: () => close(CLOSE_MS) } : {})}>
        {children}
      </Link>
      {pos && typeof document !== 'undefined' && createPortal(
        <div id={menuId} className="elmenu" role="menu" style={{ left: pos.left, top: pos.top }} onPointerEnter={() => window.clearTimeout(timer.current)} onPointerLeave={() => close(CLOSE_MS)}>
          {items.map((item) => item.href
            ? <Link key={item.id} role="menuitem" href={item.href} className="elitem" onClick={leaving}><Icon kind={item.icon} /><span>{item.label}</span></Link>
            : <span key={item.id} role="menuitem" aria-disabled="true" className="elitem off" title="Not built yet"><Icon kind={item.icon} /><span>{item.label}</span></span>)}
        </div>, document.body)}
    </>
  );
}
