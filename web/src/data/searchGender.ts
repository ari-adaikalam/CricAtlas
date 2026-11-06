'use client';

import { useSyncExternalStore } from 'react';
import type { SearchGender } from '@/domain/search';

// The Everyone, Men, Women choice of the two searches (players and matches). It is one choice for both, kept on the device, so picking Women in one stays when the other opens.

const KEY = 'searchGender';
let current: SearchGender = 'all';
let loaded = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try { const v = window.localStorage.getItem(KEY); if (v === 'men' || v === 'women' || v === 'all') current = v; } catch { /* a private window: the choice lasts for the visit */ }
}

export function setSearchGender(next: SearchGender): void {
  load(); current = next;
  try { window.localStorage.setItem(KEY, next); } catch { /* not saved */ }
  listeners.forEach((fn) => fn());
}

export function useSearchGender(): [SearchGender, (next: SearchGender) => void] {
  const value = useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => { load(); return current; }, () => 'all' as SearchGender);
  return [value, setSearchGender];
}
