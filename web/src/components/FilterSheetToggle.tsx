'use client';

import { useEffect, useRef, useState } from 'react';

// The Filters button of a root page on a phone. It sits first inside the page's filter bar (`.fbar` or `.bfbar`). Closed, the bar is one row: this button and the count. Open, the bar is a sheet
// from the bottom of the screen that holds every filter, and each one applies as it is picked. The button and the Done button are hidden at other widths by globals.css.
export function FilterSheetToggle({ active: given }: { /** How many filters are set, when the page knows it; otherwise the selects marked `set` are counted. */ active?: number }) {
  const [open, setOpen] = useState(false);
  const [counted, setActive] = useState(0);
  const active = given ?? counted;
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const bar = button.current?.closest<HTMLElement>('.fbar, .bfbar');
    if (!bar) return;
    if (!open) { bar.setAttribute('data-sheet', 'closed'); return; }
    // The bar itself becomes the sheet and leaves the page, so a copy of the closed row stays in its place and nothing behind it jumps. The copy's Filters button is lit the way a chosen filter is on desktop,
    // and it is dimmed with the rest of the screen. It follows the bar while the sheet is open, so the totals in it stay current.
    const hold = document.createElement('div');
    hold.className = `${bar.className} hold`;
    hold.setAttribute('data-sheet', 'closed');
    hold.setAttribute('aria-hidden', 'true');
    hold.setAttribute('inert', '');
    const fill = (): void => {
      hold.replaceChildren(...Array.from(bar.childNodes, (n) => n.cloneNode(true)));
      hold.querySelector('.fbar-btn')?.classList.add('lit');
    };
    fill();
    bar.before(hold);
    bar.setAttribute('data-sheet', 'open');
    const watch = new MutationObserver(fill);
    watch.observe(bar, { subtree: true, childList: true, characterData: true });
    return () => { watch.disconnect(); hold.remove(); };
  }, [open]);

  // How many filters are set: the selects the page marks with `set`.
  useEffect(() => {
    const bar = button.current?.closest('.fbar, .bfbar');
    if (!bar) return;
    const count = (): void => setActive(bar.querySelectorAll('select.set').length);
    count();
    const watch = new MutationObserver(count);
    watch.observe(bar, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    return () => watch.disconnect();
  }, []);

  // Closes on Escape and on a tap outside the sheet (the dimming around it is the sheet's own shadow, so there is no element to tap).
  useEffect(() => {
    if (!open) return;
    const bar = button.current?.closest('.fbar, .bfbar');
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    const away = (e: PointerEvent): void => { if (bar && !bar.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', away);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', away); };
  }, [open]);

  return (
    <>
      <button ref={button} type="button" className="fbar-btn" aria-expanded={open} onClick={() => setOpen(true)}>Filters{active ? <b>{active}</b> : null}</button>
      <button type="button" className="fbar-done" onClick={() => setOpen(false)}>Done</button>
    </>
  );
}
