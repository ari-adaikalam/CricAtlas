'use client';

import { OpenIn } from './OpenIn';
import { FilterSheetToggle } from './FilterSheetToggle';
import { useScrollbarGap } from './useScrollbarGap';
import { PrefetchLink as Link } from '@/components/PrefetchLink';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { fetchTournamentIndex } from '@/data/tournamentData';
import { tournamentSlug } from '@/domain/slug';
import { initialsOf, type TournamentInfo } from '@/domain/tournament';
import {
  anyFilter, applyFilters, DEFAULT_SORT, FILTERS, formatText, heldText, kindLine, noChampionText, NO_FILTERS, options, searchTournaments, sortTournaments, titlesText, type Filters, type FilterKey, type Sort, type SortKey,
} from '@/domain/tournamentsRoot';
import { ErrorState } from './states/PageStates';
import { TableWait } from './TableWait';
import { TeamText } from './tournament/parts';
import '@/styles/player.css';
import '@/styles/tournamentsroot.css';
import { openPage } from './openPage';

const COLS: ReadonlyArray<readonly [string, SortKey, boolean]> = [['Tournament', 'name', true], ['Format', 'format', true], ['Eds', 'editions', false], ['Held', 'held', false], ['Mat', 'matches', false], ['Teams', 'teams', false], ['Latest champion', 'champion', true], ['Most titles', 'titles', true]];
const int = (n: number): string => n.toLocaleString('en');
const hrefOf = (t: TournamentInfo): string => `/tournaments/${tournamentSlug(t.key)}`;

function paramsOf(f: Filters, q: string): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of Object.keys(f) as FilterKey[]) if (f[k] !== null) p.set(k, f[k]!);
  if (q) p.set('q', q);
  return p;
}

export function TournamentsRootView() {
  const gap = useScrollbarGap();
  const router = useRouter();
  const [rows, setRows] = useState<TournamentInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let live = true;
    fetchTournamentIndex()
      .then((list) => {
        if (!live) return;
        setRows(list);
        const p = new URLSearchParams(window.location.search);
        const start = { ...NO_FILTERS };
        for (const k of Object.keys(start) as FilterKey[]) { const v = p.get(k); if (v) start[k] = v; }
        setFilters(start); setQuery(p.get('q') ?? '');
      })
      .catch((error: unknown) => { console.error('The tournament list failed to load', error); if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);

  // The page's own bar shows as soon as the page draws, without waiting for the loader's timer.
  useLayoutEffect(() => { if (rows) document.body.removeAttribute('data-loading'); }, [rows]);
  useEffect(() => { document.title = 'Tournaments | CricAtlas'; }, []);
  useEffect(() => {
    if (!rows) return;
    const q = paramsOf(filters, query).toString();
    window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
  }, [rows, filters, query]);

  const all = useMemo(() => rows ?? [], [rows]);
  const searched = useMemo(() => searchTournaments(all, query), [all, query]);
  const filtered = useMemo(() => applyFilters(searched, filters), [searched, filters]);
  const sorted = useMemo(() => sortTournaments(filtered, sort), [filtered, sort]);

  if (failed) return <ErrorState onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />;

  const clear = (): void => { setFilters(NO_FILTERS); setQuery(''); };
  const dirty = anyFilter(filters) || query.trim() !== '';
  const go = (t: TournamentInfo): void => openPage(router, hrefOf(t));

  const row = (t: TournamentInfo, i: number) => {
    const titles = titlesText(t);
    return (
      <tr key={t.key} data-rk={t.key} className="rlink rin" style={{ ['--i' as string]: Math.min(i, 12) }} role="link" tabIndex={0}
        onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) go(t); }} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(t); } }}>
        <td className="l"><div className="pl"><span className={`bd${t.kind === 'league' ? ' f' : ''}${t.gender === 'female' ? ' w' : ''}`} aria-hidden="true">{initialsOf(t.name)}</span><div><b><Link href={hrefOf(t)}>{t.name}</Link></b><em>{kindLine(t)}</em></div></div></td>
        <td className="l">{formatText(t)}</td>
        <td>{t.editions}</td>
        <td>{heldText(t)}</td>
        <td>{int(t.matches)}</td>
        <td>{t.teams}</td>
        <td className="l wrapc">{t.champion ? <><TeamText id={t.champion.id} name={t.champion.name} inRow /><span className="mut"> ({t.champion.edition})</span></> : <span className="mut">{noChampionText(t)}</span>}</td>
        <td className="l wrapc">{titles ? <>{titles.more ?? titles.names.map((n, k) => <span key={n.id}>{k > 0 && ', '}<TeamText id={n.id} name={n.name} inRow /></span>)}<span className="mut"> ({titles.count})</span></> : '-'}</td>
      </tr>
    );
  };


  return (
    <div className="pgx rtn" ref={gap}>
      <main className="wrap">
        <div className="hd">
          <h1>Tournaments</h1>
        </div>
        <div className="big">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input type="search" placeholder="Search tournaments by name" aria-label="Search tournaments" autoComplete="off" value={query}
            onChange={(e) => { setQuery(e.target.value); }} />
        </div>
        <div className="fbar">
          <FilterSheetToggle />
          <div className="fr">
            {FILTERS.map(({ key, label }) => (
              <label className="fl" key={key}>
                <select className={filters[key] !== null ? 'set' : ''} aria-label={label} value={filters[key] ?? ''} onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value || null }))}>
                  <option value="">{label}: all</option>
                  {options(searched, filters, key).map((o) => <option key={o.value} value={o.value} disabled={o.tournaments === 0}>{o.label}{o.tournaments === 0 ? ' (no tournaments)' : ''}</option>)}
                </select>
              </label>
            ))}
            <div className="cnt">
              <span className="t" style={rows ? undefined : { visibility: 'hidden' }}><b>{int(filtered.length)}</b>{dirty ? ` of ${int(all.length)}` : ''} tournaments</span>
              <span className={`clrw${dirty ? ' on' : ''}`} aria-hidden={!dirty}><button type="button" className="clr" tabIndex={dirty ? 0 : -1} onClick={clear}>Clear all</button></span>
            </div>
          </div>
        </div>
        <OpenIn className="tbl">
          <table>
            <thead>
              <tr>{COLS.map(([label, key, left]) => (
                <th key={label} className={`${left ? 'l' : ''}${sort.key === key ? ` on${sort.dir > 0 ? ' asc' : ''}` : ''}`}
                  onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'name' || key === 'format' || key === 'champion' || key === 'held' ? 1 : -1 }))}>{label}</th>
              ))}</tr>
            </thead>
            <tbody>{sorted.map((t, i) => row(t, i))}</tbody>
          </table>
          {!rows && <TableWait />}
          {rows && sorted.length === 0 && <div className="empty"><b>No tournament fits these filters</b>Clear a filter or change the search. <button type="button" className="clr" onClick={clear}>Clear all</button></div>}
        </OpenIn>
      </main>
    </div>
  );
}
