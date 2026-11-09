'use client';

import { usePhone } from './usePhone';

/** The × at the end of a "Find another ..." box on a phone, where the box covers the screen and has no other way out. Nothing off a phone. */
export function SearchClose({ show, onClose }: { show: boolean; onClose: () => void }) {
  const phone = usePhone();
  if (!phone || !show) return null;
  return <button type="button" className="sclose" aria-label="Close the search" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>;
}
