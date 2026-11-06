'use client';

import { useContext } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { KeyboardEvent, MouseEvent } from 'react';
import { prefetchMatch } from '@/data/matchData';
import { primaryHref } from '@/domain/links';

/**
 * Makes a whole row lead to its match (Ari, 2026-10-22). A click anywhere in the row goes to the match, except on a link inside it (the team's name, which has its own page), and Enter or Space on the
 * focused row does the same. The match is fetched when the pointer reaches the row, so the click finds it ready.
 */
export function useMatchRowLink(): (matchId: number, name: string) => {
  role: 'link'; tabIndex: 0; onClick: (e: MouseEvent<HTMLElement>) => void; onKeyDown: (e: KeyboardEvent<HTMLElement>) => void; onPointerEnter: () => void;
} {
  // The router when the page is mounted in the app (it is not in a server-rendered test), otherwise the click falls back to an ordinary navigation.
  const router = useContext(AppRouterContext);
  return (matchId, name) => {
    const go = (): void => { const href = primaryHref({ kind: 'match', id: matchId, name }); if (href) { if (router) router.push(href); else window.location.assign(href); } };
    return {
      role: 'link', tabIndex: 0,
      onClick: (e) => { if ((e.target as HTMLElement).closest('a')) return; go(); },
      onKeyDown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(); } },
      onPointerEnter: () => prefetchMatch(matchId),
    };
  };
}
