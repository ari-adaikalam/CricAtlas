'use client';

import { useEffect, useState } from 'react';
import { ComparePlayersView } from './ComparePlayersView';
import { CompareTeamsView } from './CompareTeamsView';
import '@/styles/compareextra.css';

type Kind = 'players' | 'teams';

/**
 * Compare players and Compare teams on one page (Ari, 2026-10-25). Both are kept in the page and the one not shown fades out under the other, so "Compare teams instead" changes the page in place:
 * the top bar and the background stay, and the heading and the cards dissolve into the others. The address changes without a navigation, and the back button comes back to the other one. What was
 * picked on each side is kept while the page is open.
 */
export function CompareSwitch({ initial }: { initial: Kind }) {
  const [kind, setKind] = useState<Kind>(initial);
  useEffect(() => {
    const sync = (): void => setKind(window.location.pathname.endsWith('/teams') ? 'teams' : 'players');
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const switchTo = (next: Kind): void => {
    if (next === kind) return;
    window.history.pushState(null, '', `/compare/${next}`);
    setKind(next);
  };
  return (
    <div className={`cswitch on-${kind}`}>
      <div className={`cs${kind === 'players' ? ' on' : ''}`} aria-hidden={kind !== 'players'}><ComparePlayersView active={kind === 'players'} onSwitch={() => switchTo('teams')} /></div>
      <div className={`cs${kind === 'teams' ? ' on' : ''}`} aria-hidden={kind !== 'teams'}><CompareTeamsView active={kind === 'teams'} onSwitch={() => switchTo('players')} /></div>
    </div>
  );
}
