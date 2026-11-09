'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// The search and menu buttons of the top bar on a phone, and the scrim behind the menu. Hidden at every other width by globals.css. The menu is a panel that slides in from
// the right: `data-menu` on the bar is what opens it. It closes when a link is followed, on Escape, and on a tap outside it. The search button does not open the menu: it opens the search box alone under the bar (`data-menu='search'`), ready to type in.
export function NavBurger() {
  const [mode, setMode] = useState<'closed' | 'menu' | 'search'>('closed');
  const open = mode !== 'closed';
  const setOpen = (o: boolean): void => setMode(o ? 'menu' : 'closed');
  const button = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    const nav = button.current?.closest('.nav');
    if (!nav) return;
    nav.setAttribute('data-menu', mode === 'menu' ? 'open' : mode === 'search' ? 'search' : 'closed');
    // After the search box closes, the panel must vanish at once: sliding back out as the drawer would show the whole menu for a moment.
    if (mode === 'search') nav.setAttribute('data-was', 'search'); else if (mode === 'menu') nav.removeAttribute('data-was');
    if (!open) return;
    const away = (e: PointerEvent): void => { if (!(e.target as Element).closest('.nav-panel, .nav-burger, .nav-search-btn')) setOpen(false); };
    const follow = (e: Event): void => { if ((e.target as Element).closest('.nav-panel a')) setOpen(false); };
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    nav.addEventListener('click', follow);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); nav.removeEventListener('click', follow); document.removeEventListener('keydown', key); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [mode]);

  const search = (): void => {
    const nav = button.current?.closest('.nav');
    const next = mode === 'search' ? 'closed' : 'search';
    // The attribute is set here as well as by the effect: the box is hidden until it is, and a hidden box cannot take the focus. iOS only raises the keyboard for a focus that a tap caused.
    nav?.setAttribute('data-menu', next);
    if (next === 'search') nav?.setAttribute('data-was', 'search');
    if (next === 'search') nav?.querySelector<HTMLInputElement>('.nav-panel .srch input')?.focus({ preventScroll: true });
    setMode(next);
  };

  return (
    <>
      <button type="button" className="nav-search-btn" aria-label="Search players, teams and more" onClick={search}>
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>Search</span>
      </button>
      <button ref={button} type="button" className="nav-burger" aria-label={mode === 'menu' ? 'Close the menu' : 'Open the menu'} aria-expanded={mode === 'menu'} onClick={() => setMode((m) => (m === 'menu' ? 'closed' : 'menu'))}>
        <span /><span /><span />
      </button>
      <div className="nav-scrim" aria-hidden="true" />
    </>
  );
}
