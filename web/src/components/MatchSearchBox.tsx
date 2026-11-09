'use client';

import { PrefetchLink as Link } from '@/components/PrefetchLink';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { prefetchMatch, prefetchMatchSearch, searchMatches } from '@/data/matchData';
import { matchSub, type MatchHit } from '@/domain/matchSearch';
import { dateText } from '@/domain/dates';
import { useSearchGender } from '@/data/searchGender';
import { SearchGenderToggle } from './SearchGenderToggle';
import { SearchFormatToggle } from './SearchFormatToggle';
import { formatFits, type FormatChip } from '@/domain/matchFormat';
import { useFitPanel } from './useFitPanel';
import { matchSlug } from '@/domain/slug';
import { usePhone } from './usePhone';

interface Props {
  placeholder?: string;
  /** Opens with the cursor in the box, as the Change match popover does. */
  autoFocus?: boolean;
  /** Called after a pick or Escape, so a popover can close. */
  onDone?: () => void;
  /** Called with the pick, and the page stays where it is so the match can change in place. */
  onPick: (hit: MatchHit) => void;
}

/** How many matches the panel lists at first, and how many more a click on Show more adds. */
const PAGE = 40;

/** The type-ahead that changes the match, built like the player search: a pill, grouped results, arrow keys, Enter and Escape. It reads one list of every match (m/search.json). */
export function MatchSearchBox({ placeholder = 'Find another match', autoFocus = false, onDone, onPick }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(autoFocus);
  const [format, setFormat] = useState<FormatChip>('all');
  const [allHits, setHits] = useState<MatchHit[] | null>(null);
  // The chips narrow the answer on screen, so a change of chip needs no new search.
  const hits = useMemo(() => (allHits === null ? null : allHits.filter((h) => formatFits(format, h.format))), [allHits, format]);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [gender, setGender] = useSearchGender();
  const [shown, setShown] = useState(PAGE);
  const phone = usePhone();

  useFitPanel(box, open, hits);
  useEffect(() => { prefetchMatchSearch(); }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchMatches(text, gender)
        .then((found) => { if (!cancelled) { setHits(found); setShown(PAGE); setFailed(false); setActive(-1); for (const hit of found.slice(0, 3)) prefetchMatch(hit.id); } })
        .catch((error: unknown) => { console.error('Match search failed', error); if (!cancelled) { setFailed(true); setHits([]); } });
    }, text ? 150 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [text, open, gender]);

  // The match the arrow keys are on is fetched ahead, as one the pointer is over is.
  useEffect(() => { const hit = active >= 0 ? hits?.[active] : undefined; if (hit) prefetchMatch(hit.id); }, [active, hits]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); onDone?.(); } };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, onDone]);

  function go(hit: MatchHit) { setOpen(false); setText(''); onDone?.(); onPick(hit); }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    const n = Math.min(hits?.length ?? 0, shown);
    if (e.key === 'Escape') { setOpen(false); onDone?.(); (e.target as HTMLElement).blur(); return; }
    if (n === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + n) % n); }
    if (e.key === 'Enter') { e.preventDefault(); const hit = hits?.[active >= 0 ? active : 0]; if (hit) go(hit); }
  }

  return (
    <div className="srch" ref={box}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
      <input
        type="search" value={text} placeholder={placeholder} aria-label="Find a match" autoComplete="off" autoFocus={autoFocus}
        role="combobox" aria-expanded={open} aria-controls={listId} aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }} onKeyDown={onKey}
      />
      {phone && open && <button type="button" className="sclose" aria-label="Close the search" onClick={() => { setOpen(false); onDone?.(); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
      <div className={`res mres${open ? ' on' : ''}`} id={listId} role="listbox" aria-label="Matches">
        {open && <div className="rtop"><SearchGenderToggle value={gender} onChange={setGender} /><span className="rsep" aria-hidden="true" /><SearchFormatToggle value={format} onChange={(f) => { setFormat(f); setShown(PAGE); setActive(-1); }} /></div>}
        {open && hits === null && <div className="none">Searching</div>}
        {open && hits !== null && hits.length > 0 && <h6>{text ? `${hits.length.toLocaleString('en')} ${hits.length === 1 ? 'match' : 'matches'}` : 'Latest matches'}</h6>}
        {open && hits?.slice(0, shown).map((hit, i) => (
          <Link key={hit.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onPointerEnter={() => prefetchMatch(hit.id)} className={i === active ? 'on' : undefined}
            href={`/matches/${matchSlug(hit.teams[0], hit.teams[1], hit.date, hit.id)}`}
            onClick={(e) => { e.preventDefault(); go(hit); }}>
            <span className="mh"><b>{hit.teams[0]} v {hit.teams[1]}</b><em className="fmt">{hit.format}</em><time dateTime={hit.date}>{dateText(hit.date)}</time></span>
            <span className="ms">{matchSub(hit)}{hit.result ? ` | ${hit.result}` : ''}</span>
          </Link>
        ))}
        {open && hits !== null && hits.length > shown && <button type="button" className="more" onMouseDown={(e) => e.preventDefault()} onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, hits.length - shown)} more of {(hits.length - shown).toLocaleString('en')}</button>}
        {open && hits !== null && hits.length === 0 && <div className="none">{failed ? 'Search is not available right now.' : 'Nothing matches. Try two teams, a competition or a year.'}</div>}
      </div>
    </div>
  );
}
