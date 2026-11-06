'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { prefetchSearch, searchPlayers } from '@/data/search';
import { MATCH_LIMIT, prefetchEverything, searchEverything, type Everything } from '@/data/navSearch';
import { prefetchMatch } from '@/data/matchData';
import { teamLine, tournamentLine } from '@/domain/navSearch';
import { matchSub } from '@/domain/matchSearch';
import { TOURNAMENT_PAGES } from '@/domain/links';
import { warmEngineWhenIdle } from '@/data/engine';
import { prefetchPlayerAll, prefetchProfile } from '@/data/profileData';
import { cleanSearch, playerLine, type PlayerHit } from '@/domain/search';
import { useSearchGender } from '@/data/searchGender';
import { SearchGenderToggle } from './SearchGenderToggle';
import { useFitPanel } from './useFitPanel';
import { matchSlug, playerSlug, tournamentSlug } from '@/domain/slug';
import { teamSlugOf } from '@/data/teamData';

interface Props {
  placeholder?: string;
  /** Opens with the cursor in the box, as the Change player popover does. */
  autoFocus?: boolean;
  /** Called after a pick or Escape, so a popover can close. */
  onDone?: () => void;
  /** Added to the player's address, such as ?view=batting, so a pick opens the same view of the new player. */
  suffix?: string;
  /** When given, a pick calls this and the page stays where it is, so the player page can switch player in place (its tiles show their own loaders). */
  onPick?: (hit: PlayerHit) => void;
}

interface Item { id: string; group: string; href: string; title: string; sub: string; player?: PlayerHit; /** Two lines, the title over the details, for a result whose details are long. */ stacked?: boolean; prefetch?: () => void }

/** The results of one typed text as one list in the order shown, so the arrow keys walk through all groups. */
function itemsOf(players: PlayerHit[], more: Everything | null, suffix: string, text: string): Item[] {
  const playerItems: Item[] = players.map((hit) => ({ id: `p${hit.playerId}`, group: 'Players', href: `/players/${playerSlug(hit.name, hit.playerId)}${suffix}`, title: hit.name, sub: playerLine(hit), player: hit, prefetch: () => prefetchPlayerAll(hit.playerId) }));
  if (!more) return playerItems;
  const pairItems: Item[] = more.pair ? [
    { id: 'pair', group: 'Compare', href: more.pair.href, title: `Compare ${more.pair.a.name} and ${more.pair.b.name}`, sub: more.pair.kind === 'teams' ? 'Teams, side by side' : 'Players, side by side' },
    ...(more.pair.kind === 'players' ? [more.pair.a, more.pair.b].map((p): Item => ({ id: `pp${p.id}`, group: 'Players', href: `/players/${playerSlug(p.name, p.id)}${suffix}`, title: p.name, sub: 'Open the profile', prefetch: () => prefetchPlayerAll(p.id) })) : []),
  ] : [];
  const teamItems: Item[] = more.teams.map((t) => ({ id: `t${t.id}`, group: 'Teams', href: `/teams/${teamSlugOf(t.id)}`, title: t.name, sub: teamLine(t) }));
  const tournamentItems: Item[] = more.tournaments.filter((t) => TOURNAMENT_PAGES.has(t.key)).map((t) => ({ id: `n${t.key}`, group: 'Tournaments', href: `/tournaments/${tournamentSlug(t.key)}`, title: t.name, sub: tournamentLine(t) }));
  // A text that is exactly a team or a tournament (india, rcb, ipl) lists it first, ahead of players whose names merely look like it.
  const exact = more.teamBest === 0 || more.tournamentBest === 0;
  const out: Item[] = [...pairItems, ...(exact ? [...teamItems, ...tournamentItems, ...playerItems] : [...playerItems, ...teamItems, ...tournamentItems])];
  const beside = out.length > 0;
  for (const m of more.matches.slice(0, beside ? 3 : MATCH_LIMIT)) out.push({ id: `m${m.id}`, group: 'Matches', href: `/matches/${matchSlug(m.teams[0], m.teams[1], m.date, m.id)}`, title: `${m.teams[0]} v ${m.teams[1]}`, sub: [m.date, matchSub(m), m.result].filter(Boolean).join(', '), prefetch: () => prefetchMatch(m.id), stacked: true });
  const shownMatches = more.matches.slice(0, beside ? 3 : MATCH_LIMIT).length;
  if (more.matchTotal > shownMatches) out.push({ id: 'mall', group: 'Matches', href: `/matches?q=${encodeURIComponent(cleanSearch(text))}`, title: `See all ${more.matchTotal.toLocaleString('en')} matches`, sub: '' });
  return out;
}

/**
 * The search box of the home mockup: a pill with a magnifier, a panel of grouped results, arrow keys, Enter and Escape. The nav box lists Players, Teams, Tournaments and
 * Matches for a typed text. The box that switches the player on the player page (onPick) lists players only. Venues join when their page exists, so that no result leads to a
 * missing page.
 */
export function SearchBox({ placeholder = 'Search players, teams and more', autoFocus = false, onDone, suffix = '', onPick }: Props) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(autoFocus);
  const [hits, setHits] = useState<PlayerHit[] | null>(null);
  const [more, setMore] = useState<Everything | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [gender, setGender] = useSearchGender();

  // The list of players is fetched when the box appears, so it is ready before anyone types.
  useFitPanel(box, open, more ?? hits);
  useEffect(() => { prefetchSearch(); warmEngineWhenIdle(); if (!onPick) prefetchEverything(); }, [onPick]);

  // A short wait after typing, then the search. A newer search replaces an older one.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.all([searchPlayers(text, onPick ? 8 : 5, gender), onPick ? Promise.resolve(null) : searchEverything(text, gender)])
        .then(([found, rest]) => { if (!cancelled) { setHits(found); setMore(rest); setFailed(false); setActive(-1); for (const hit of found.slice(0, 3)) prefetchProfile(hit.playerId); } })
        .catch((error: unknown) => { console.error('Search failed', error); if (!cancelled) { setFailed(true); setHits([]); setMore(null); } });
    }, text ? 150 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [text, open, gender, onPick]);

  // The player the arrow keys are on is fetched ahead, as one the pointer is over is.
  const items = hits === null ? [] : itemsOf(hits, more, suffix, text);
  useEffect(() => { const item = active >= 0 ? items[active] : undefined; item?.prefetch?.(); }, [active, hits, more]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); onDone?.(); } };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, onDone]);

  function go(item: Item) {
    setOpen(false); setText(''); onDone?.();
    if (onPick && item.player) { onPick(item.player); return; }
    router.push(item.href);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    const n = items.length;
    if (e.key === 'Escape') { setOpen(false); onDone?.(); (e.target as HTMLElement).blur(); return; }
    if (n === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + n) % n); }
    if (e.key === 'Enter') { e.preventDefault(); const item = items[active >= 0 ? active : 0]; if (item) go(item); }
  }

  return (
    <div className="srch" ref={box}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
      <input
        type="search" value={text} placeholder={placeholder} aria-label="Search" autoComplete="off" autoFocus={autoFocus}
        role="combobox" aria-expanded={open} aria-controls={listId} aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }} onKeyDown={onKey}
      />
      <div suppressHydrationWarning className={`res${open ? ' on' : ''}`} id={listId} role="listbox" aria-label="Search results">
        {open && <SearchGenderToggle value={gender} onChange={setGender} />}
        {open && hits === null && <div className="none">Searching</div>}
        {open && items.map((item, i) => (
          <Fragment key={item.id}>
            {(i === 0 || items[i - 1]!.group !== item.group) && <h6>{item.group}</h6>}
            <Link id={`${listId}-${i}`} role="option" aria-selected={i === active} onPointerEnter={item.prefetch} className={`${i === active ? 'on' : ''}${item.stacked ? ' rstk' : ''}`.trim() || undefined} href={item.href} onClick={(e) => { if (onPick && item.player) { e.preventDefault(); onPick(item.player); } setOpen(false); setText(''); onDone?.(); }}>
              <b style={{ fontWeight: 500 }}>{item.title}</b><span>{item.sub}</span>
            </Link>
          </Fragment>
        ))}
        {open && hits !== null && items.length === 0 && <div className="none">{failed ? 'Search is not available right now.' : onPick ? "Nothing matches. Try a player's name." : 'Nothing matches. Try a name, a team, a tournament or two teams.'}</div>}
      </div>
    </div>
  );
}
