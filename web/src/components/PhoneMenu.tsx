'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The three-dot menu of a phone's header: a button and a small list under it. It closes on a tap outside, on Escape and when an item is chosen. The items are buttons or links with
 * `role="menuitem"`. Its look is in phone.css (`.pmore`, `.pmb`, `.pmenu`).
 */
export function PhoneMenu({ children, label = 'More', className = '' }: { children: ReactNode; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className={`pmore ${className}`.trim()} ref={box}>
      <button type="button" className="pmb" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && <div className="pmenu" role="menu" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}
