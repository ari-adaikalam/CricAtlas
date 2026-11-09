'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_EMBLEM, EMBLEM_KEY, type EmblemStyle } from '@/domain/emblem';

// The emblem style the viewer chose (stumps, roundel or split disc), kept on the device. One choice for the whole app: every emblem on the page follows it at once.

let current: EmblemStyle = DEFAULT_EMBLEM;
let loaded = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try { const v = window.localStorage.getItem(EMBLEM_KEY); if (v === 'E' || v === 'B' || v === 'D') current = v; } catch { /* a private window: the choice lasts for the visit */ }
}

export function setEmblemStyle(next: EmblemStyle): void {
  load(); current = next;
  try { window.localStorage.setItem(EMBLEM_KEY, next); } catch { /* not saved */ }
  listeners.forEach((fn) => fn());
}

export function useEmblemStyle(): EmblemStyle {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => { load(); return current; }, () => DEFAULT_EMBLEM);
}
