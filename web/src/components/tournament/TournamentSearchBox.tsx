'use client';

import { PrefetchLink as Link } from '@/components/PrefetchLink';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { fetchTournamentIndex } from '@/data/tournamentData';
import { useSearchGender } from '@/data/searchGender';
import { findTournaments, tournamentLine } from '@/domain/tournament';
import type { TournamentInfo } from '@/domain/tournament';
import { tournamentSlug } from '@/domain/slug';
import { SearchGenderToggle } from '../SearchGenderToggle';
import { useFitPanel } from '../useFitPanel';
import { SearchClose } from '../SearchClose';

interface Props {
  placeholder?: string;
  autoFocus?: boolean;
  onDone?: () => void;
  onPick: (hit: TournamentInfo) => void;
}

const PAGE = 40;

/** The type-ahead that changes the tournament, built like the team search: a pill, a list, arrow keys, Enter and Escape, and an All, Men, Women choice at its top. There are about 30 tournaments, so there is no chip row. */
export function TournamentSearchBox({ placeholder = 'Find another tournament', autoFocus = false, onDone, onPick }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(autoFocus);
  const [all, setAll] = useState<TournamentInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [gender, setGender] = useSearchGender();
  const [now, setNow] = useState('');
  // International (the tournaments between national teams) or League. A quick browse, so it starts clear each time the box opens.
  const [kind, setKind] = useState<TournamentInfo['kind'] | null>(null);

  useEffect(() => { fetchTournamentIndex().then(setAll).catch((e: unknown) => { console.error('Tournament search failed', e); setFailed(true); setAll([]); }); }, []);
  useEffect(() => { const t = window.setTimeout(() => { setNow(text); setActive(-1); }, text ? 90 : 0); return () => window.clearTimeout(t); }, [text, gender, kind]);
  const hits = all === null ? null : findTournaments(now, all, gender, kind).slice(0, PAGE);
  useFitPanel(box, open, hits);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); onDone?.(); } };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, onDone]);

  function go(hit: TournamentInfo) { setOpen(false); setText(''); onDone?.(); onPick(hit); }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    const n = hits?.length ?? 0;
    if (e.key === 'Escape') { setOpen(false); onDone?.(); (e.target as HTMLElement).blur(); return; }
    if (n === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + n) % n); }
    if (e.key === 'Enter') { e.preventDefault(); const hit = hits?.[active >= 0 ? active : 0]; if (hit) go(hit); }
  }

  return (
    <div className="srch" ref={box}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
      <input
        type="search" value={text} placeholder={placeholder} aria-label="Find a tournament" autoComplete="off" autoFocus={autoFocus}
        role="combobox" aria-expanded={open} aria-controls={listId} aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }} onKeyDown={onKey}
      />
      <SearchClose show={open} onClose={() => { setOpen(false); onDone?.(); }} />
      <div className={`res mres${open ? ' on' : ''}`} id={listId} role="listbox" aria-label="Tournaments">
        {open && (
          <div className="rtop">
            <SearchGenderToggle value={gender} onChange={setGender} />
            <span className="rsep" aria-hidden="true" />
            <div className="rcw">
              <div className="rcomp" role="group" aria-label="Kind">
                {([['tournament', 'International'], ['league', 'League']] as const).map(([k, label]) => (
                  <button key={k} type="button" className={kind === k ? 'on' : undefined} aria-pressed={kind === k} onMouseDown={(e) => e.preventDefault()} onClick={() => setKind((was) => (was === k ? null : k))}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        {open && hits === null && <div className="none">Searching</div>}
        {open && hits !== null && hits.length > 0 && <h6>{now ? `${hits.length} ${hits.length === 1 ? 'tournament' : 'tournaments'}` : 'Tournaments with the most matches'}</h6>}
        {open && hits?.map((hit, i) => (
          <Link key={hit.key} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'on' : undefined} href={`/tournaments/${tournamentSlug(hit.key)}`} onClick={(e) => { e.preventDefault(); go(hit); }}>
            <span className="mh"><b>{hit.name}</b><em className="fmt">{hit.matches.toLocaleString('en')} matches</em></span>
            <span className="ms">{tournamentLine(hit)}</span>
          </Link>
        ))}
        {open && hits !== null && hits.length === 0 && <div className="none">{failed ? 'Search is not available right now.' : 'No tournament matches. Try a short name such as IPL or World Cup, or clear a chip.'}</div>}
      </div>
    </div>
  );
}
