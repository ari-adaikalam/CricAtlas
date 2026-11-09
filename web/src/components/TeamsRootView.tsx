'use client';

import { OpenIn } from './OpenIn';
import { FilterSheetToggle } from './FilterSheetToggle';
import { usePhone } from './usePhone';
import { useScrollbarGap } from './useScrollbarGap';
import { PrefetchLink as Link } from '@/components/PrefetchLink';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { fetchTeamIndex, prefetchTeam, teamSlugOf } from '@/data/teamData';
import { fetchTournamentIndex } from '@/data/tournamentData';
import {
  activeText, anyFilter, applyFilters, DEFAULT_SORT, FILTERS, NO_FILTERS, options, searchTeams, sortTeams, toRoot, type Filters, type FilterKey, type RootTeam, type Sort, type SortKey,
} from '@/domain/teamsRoot';
import { TeamEmblem } from './TeamEmblem';
import { MoreButton } from './MoreButton';
import { ErrorState } from './states/PageStates';
import { TableWait } from './TableWait';
import '@/styles/player.css';
import '@/styles/teamsroot.css';
import { openPage } from './openPage';

const PAGE = 50;
const COLS: ReadonlyArray<readonly [string, SortKey | null, boolean]> = [
  ['Team', 'name', true], ['League or country', 'country', true], ['Mat', 'matches', false], ['Won', 'won', false], ['Lost', 'lost', false], ['Win %', 'rate', false], ['Titles', 'titles', false], ['Active', 'firstYear', false], ['', null, false],
];
const int = (n: number): string => n.toLocaleString('en');

function paramsOf(f: Filters, q: string): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of Object.keys(f) as FilterKey[]) if (f[k] !== null) p.set(k, f[k]!);
  if (q) p.set('q', q);
  return p;
}

export function TeamsRootView() {
  const gap = useScrollbarGap();
  const router = useRouter();
  const [rows, setRows] = useState<RootTeam[] | null>(null);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [more, setMore] = useState(false);
  // On a phone the Filters sheet holds every filter, so the second row is always there.
  const phone = usePhone();
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let live = true;
    Promise.all([fetchTeamIndex(), fetchTournamentIndex().catch(() => [])])
      .then(([index, tournaments]) => {
        if (!live) return;
        setRows(index.map(toRoot));
        setNames(new Map(tournaments.map((t) => [t.key, t.name])));
        const p = new URLSearchParams(window.location.search);
        const start = { ...NO_FILTERS };
        for (const k of Object.keys(start) as FilterKey[]) { const v = p.get(k); if (v) start[k] = v; }
        setFilters(start); setQuery(p.get('q') ?? '');
      })
      .catch((error: unknown) => { console.error('The team list failed to load', error); if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);

  // The loader hides the site bar until its mark is cleared, which a timer does a moment after it goes. The page does not wait for the timer: its own bar is shown as soon as it draws.
  useLayoutEffect(() => { if (rows) document.body.removeAttribute('data-loading'); }, [rows]);
  useEffect(() => { document.title = 'Teams | CricAtlas'; }, []);
  useEffect(() => {
    if (rows) window.history.replaceState(null, '', `${window.location.pathname}${paramsOf(filters, query).toString() ? `?${paramsOf(filters, query)}` : ''}`);
  }, [rows, filters, query]);

  const all = useMemo(() => rows ?? [], [rows]);
  const searched = useMemo(() => searchTeams(all, query), [all, query]);
  const filtered = useMemo(() => applyFilters(searched, filters), [searched, filters]);
  const sorted = useMemo(() => sortTeams(filtered, sort), [filtered, sort]);

  if (failed) return <ErrorState onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />;

  const change = (key: FilterKey, value: string | null): void => { setFilters((f) => ({ ...f, [key]: value })); setShown(PAGE); };
  const clear = (): void => { setFilters(NO_FILTERS); setQuery(''); setShown(PAGE); };
  const dirty = anyFilter(filters) || query.trim() !== '';
  const hiddenSet = FILTERS.filter((d) => d.more && filters[d.key] !== null).length;
  const go = (t: RootTeam): void => openPage(router, `/teams/${teamSlugOf(t.id)}`);

  const selectFor = (key: FilterKey, label: string) => (
    <label className="fl" key={key}>
      <select className={filters[key] !== null ? 'set' : ''} aria-label={label} value={filters[key] ?? ''} onChange={(e) => change(key, e.target.value || null)}>
        <option value="">{label}: all</option>
        {options(searched, filters, key, names).map((o) => <option key={o.value} value={o.value} disabled={o.teams === 0}>{o.label}{o.teams === 0 ? ' (no teams)' : ''}</option>)}
      </select>
    </label>
  );

  const row = (t: RootTeam, i: number) => (
    <tr key={t.id} data-rk={t.id} className="rlink rin" style={{ ['--i' as string]: Math.min(i, 12) }} role="link" tabIndex={0} onPointerEnter={() => prefetchTeam(teamSlugOf(t.id))}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) go(t); }} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(t); } }}>
      <td className="l">
        <div className="pl">
          <span className="tem"><TeamEmblem team={t.name} size={38} /></span>
          <div><b><Link href={`/teams/${teamSlugOf(t.id)}`}>{t.name}</Link></b><em>{t.national ? 'National team' : 'Franchise'}, {t.gender === 'female' ? 'women' : 'men'}</em></div>
        </div>
      </td>
      <td className="l">{t.national ? t.country : `${t.league ?? ''}${t.league && t.country ? ', ' : ''}${t.country}`}</td>
      <td>{int(t.matches)}</td><td>{int(t.won)}</td><td>{int(t.lost)}</td><td>{t.rate === null ? '-' : `${Math.round(t.rate * 100)}%`}</td><td>{t.titles}</td><td>{activeText(t)}</td>
      <td><Link className="cb" href={`/compare/teams?a=${encodeURIComponent(t.id)}`}>Compare</Link></td>
    </tr>
  );


  return (
    <div className="pgx rtp" ref={gap}>
      <main className="wrap">
        <div className="hd">
          <h1>Teams</h1>
        </div>
        <div className="big">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input type="search" placeholder="Search teams by name" aria-label="Search teams" autoComplete="off" value={query}
            onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
        </div>
        <div className="fbar">
          <FilterSheetToggle />
          <div className="fr">
            {FILTERS.filter((d) => !d.more).map((d) => selectFor(d.key, d.label))}
            <button type="button" className={`mt${more || hiddenSet ? ' on' : ''}`} onClick={() => setMore((v) => !v)}>More filters{hiddenSet ? ` (${hiddenSet})` : ''} {more ? '▴' : '▾'}</button>
            <div className="cnt">
              <span className="t" style={rows ? undefined : { visibility: 'hidden' }}><b>{int(filtered.length)}</b>{dirty ? ` of ${int(all.length)}` : ''} teams</span>
              <span className={`clrw${dirty ? ' on' : ''}`} aria-hidden={!dirty}><button type="button" className="clr" tabIndex={dirty ? 0 : -1} onClick={clear}>Clear all</button></span>
            </div>
          </div>
          {(more || phone) && <div className="fr f2">{FILTERS.filter((d) => d.more).map((d) => selectFor(d.key, d.label))}</div>}
        </div>
        <OpenIn className="tbl">
          <table>
            <thead>
              <tr>{COLS.map(([label, key, left]) => (
                <th key={label || 'x'} className={`${left ? 'l' : ''}${key && sort.key === key ? ` on${sort.dir > 0 ? ' asc' : ''}` : ''}`}
                  onClick={key ? () => { setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'name' || key === 'country' || key === 'firstYear' ? 1 : -1 })); } : undefined}>{label}</th>
              ))}</tr>
            </thead>
            <tbody>
              {sorted.slice(0, shown).map((t, i) => row(t, i))}
            </tbody>
          </table>
          {!rows && <TableWait />}
          {rows && sorted.length === 0 && <div className="empty"><b>No team matches these filters</b>Clear a filter or change the search. <button type="button" className="clr" onClick={clear}>Clear all</button></div>}
          {sorted.length > shown && (
          <div className="more"><MoreButton onMore={() => setShown((n) => n + PAGE)}>Show {int(Math.min(PAGE, sorted.length - shown))} more teams</MoreButton></div>
        )}
        </OpenIn>
      </main>
    </div>
  );
}
