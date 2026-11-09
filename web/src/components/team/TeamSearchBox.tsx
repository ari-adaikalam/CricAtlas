'use client';

import { PrefetchLink as Link } from '@/components/PrefetchLink';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { fetchTeamIndex, prefetchTeam, teamSlugOf, type TeamIndexRow } from '@/data/teamData';
import { useSearchGender } from '@/data/searchGender';
import { competitionChips, findTeams, INTERNATIONAL, leagueOf, teamLine, type TeamHit } from '@/domain/teamSearch';
import { SearchGenderToggle } from '../SearchGenderToggle';
import { ChipScroller } from '../ChipScroller';
import { useFitPanel } from '../useFitPanel';
import { TeamEmblem } from '../TeamEmblem';
import { SearchClose } from '../SearchClose';

interface Props {
  placeholder?: string;
  autoFocus?: boolean;
  onDone?: () => void;
  /** Called with the pick. The page stays where it is so the team can change in place. */
  onPick: (hit: TeamHit) => void;
}

const PAGE = 40;
const toHit = (r: TeamIndexRow): TeamHit => ({ id: r.id, name: r.name, gender: r.gender, national: r.national, matches: r.matches, firstYear: r.firstYear, lastYear: r.lastYear, league: leagueOf(r.id) });

/** The type-ahead that changes the team, built like the match search: a pill, a list a page at a time, arrow keys, Enter and Escape, and an All, Men, Women choice at its top. */
export function TeamSearchBox({ placeholder = 'Find another team', autoFocus = false, onDone, onPick }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(autoFocus);
  const [all, setAll] = useState<TeamHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [gender, setGender] = useSearchGender();
  const [shown, setShown] = useState(PAGE);
  const [now, setNow] = useState('');
  // The competition chip is a quick browse, so it starts clear each time the box opens (the Men and Women choice is the lasting one).
  const [competition, setCompetition] = useState<string | null>(null);

  useEffect(() => { fetchTeamIndex().then((rows) => setAll(rows.map(toHit))).catch((e: unknown) => { console.error('Team search failed', e); setFailed(true); setAll([]); }); }, []);
  // The list is worked out in memory, so it follows the text at once. The pause only keeps the panel from redrawing on every key.
  useEffect(() => { const t = window.setTimeout(() => { setNow(text); setShown(PAGE); setActive(-1); }, text ? 90 : 0); return () => window.clearTimeout(t); }, [text, gender, competition]);
  const hits = all === null ? null : findTeams(now, all, gender, competition);
  const chips = useMemo(() => (all ? competitionChips(all, gender) : []), [all, gender]);
  useFitPanel(box, open, hits);

  useEffect(() => { const hit = active >= 0 ? hits?.[active] : undefined; if (hit) prefetchTeam(teamSlugOf(hit.id)); }, [active, hits]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); onDone?.(); } };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, onDone]);

  function go(hit: TeamHit) { setOpen(false); setText(''); onDone?.(); onPick(hit); }
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
        type="search" value={text} placeholder={placeholder} aria-label="Find a team" autoComplete="off" autoFocus={autoFocus}
        role="combobox" aria-expanded={open} aria-controls={listId} aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }} onKeyDown={onKey}
      />
      <SearchClose show={open} onClose={() => { setOpen(false); onDone?.(); }} />
      <div className={`res mres${open ? ' on' : ''}`} id={listId} role="listbox" aria-label="Teams">
        {open && (
          <div className="rtop">
            <SearchGenderToggle value={gender} onChange={setGender} />
            <span className="rsep" aria-hidden="true" />
            <ChipScroller label="competitions" watch={chips.length}>
              {chips.map((c) => (
                <button key={c.name} type="button" className={competition === c.name ? 'on' : undefined} aria-pressed={competition === c.name} disabled={c.shown === 0 && competition !== c.name}
                  title={c.shown === 0 ? `No ${gender === 'men' ? "men's" : "women's"} teams in this competition` : `${c.shown} ${c.shown === 1 ? 'team' : 'teams'}`}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => setCompetition((was) => (was === c.name ? null : c.name))}>{c.name}</button>
              ))}
            </ChipScroller>
          </div>
        )}
        {open && hits === null && <div className="none">Searching</div>}
        {open && hits !== null && hits.length > 0 && <h6>{now || competition ? `${hits.length.toLocaleString('en')} ${hits.length === 1 ? 'team' : 'teams'}${competition ? (competition === INTERNATIONAL ? ' (national)' : ` in the ${competition}`) : ''}` : 'Teams with the most matches'}</h6>}
        {open && hits?.slice(0, shown).map((hit, i) => (
          <Link key={hit.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onPointerEnter={() => prefetchTeam(teamSlugOf(hit.id))} className={i === active ? 'on' : undefined}
            href={`/teams/${teamSlugOf(hit.id)}`} onClick={(e) => { e.preventDefault(); go(hit); }}>
            <span className="mh"><span className="tem"><TeamEmblem team={hit.name} size={20} /></span><b>{hit.name}</b><em className="fmt">{hit.matches.toLocaleString('en')} matches</em></span>
            <span className="ms">{teamLine(hit)}</span>
          </Link>
        ))}
        {open && hits !== null && hits.length > shown && <button type="button" className="more" onMouseDown={(e) => e.preventDefault()} onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, hits.length - shown)} more of {(hits.length - shown).toLocaleString('en')}</button>}
        {open && hits !== null && hits.length === 0 && <div className="none">{failed ? 'Search is not available right now.' : competition ? `No ${gender === 'men' ? "men's " : gender === 'women' ? "women's " : ''}teams${now ? ' match' : ''} in ${competition === INTERNATIONAL ? 'international cricket' : `the ${competition}`}. Tap the chip again to clear it.` : 'No team matches. Try a country, a club or the short letters.'}</div>}
      </div>
    </div>
  );
}
