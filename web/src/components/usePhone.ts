'use client';

import { useSyncExternalStore } from 'react';

/** A phone is a window up to 760 px wide. False on the server and while a page hydrates, so a desktop window never sees a phone's markup. */
export const PHONE_QUERY = '(max-width: 760px)';

const subscribe = (notify: () => void): (() => void) => {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', notify);
  return () => mq.removeEventListener('change', notify);
};

export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}
