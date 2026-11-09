'use client';

import { OpenIn } from './OpenIn';
import { FilterSheetToggle } from './FilterSheetToggle';
import { usePhone } from './usePhone';
import { useScrollbarGap } from './useScrollbarGap';
import { PrefetchLink as Link } from '@/components/PrefetchLink';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { fetchPlayerList, type ListPlayer } from '@/data/playerList';
import { fetchTournamentIndex } from '@/data/tournamentData';
import { photoBackdrop } from '@/domain/colours';
import { playerSlug } from '@/domain/slug';
import {
  activeText, anyFilter, applyFilters, DEFAULT_SORT, FILTERS, lineOf, NO_FILTERS, options, searchPlayers, sortPlayers, type Filters, type FilterKey, type Sort, type SortKey,
} from '@/domain/playersRoot';
import { ErrorState } from './states/PageStates';
import { TableWait } from './TableWait';
import { MoreButton } from './MoreButton';
import '@/styles/player.css';
import '@/styles/playersroot.css';
import { openPage } from './openPage';

const PAGE = 50;
const COLS: ReadonlyArray<readonly [string, SortKey | null, boolean]> = [['Player', 'name', true], ['Country', 'country', true], ['Active', 'firstYear', false], ['Mat', 'matches', false], ['Runs', 'runs', false], ['Wkts', 'wickets', false], ['', null, false]];
const int = (n: number): string => n.toLocaleString('en');
const initialsOf = (name: string): string => name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
const hrefOf = (p: ListPlayer): string => `/players/${playerSlug(p.name, p.id)}`;

function paramsOf(f: Filters, q: string): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of Object.keys(f) as FilterKey[]) if (f[k] !== null) p.set(k, f[k]!);
  if (q) p.set('q', q);
  return p;
}

/** The player's photo (hotlinked), or the initials on the country's colour when there is none or it does not load. */
function Avatar({ p, size = 38 }: { p: ListPlayer; size?: number }) {
  const [failed, setFailed] = useState(false);
  const base = photoBackdrop(p.country);
  return (
    <span className={`av${p.gender === 'female' ? ' w' : ''}`} aria-hidden="true" style={{ width: size, height: size, flexBasis: size, position: 'relative', overflow: 'hidden', ...base }}>
      {initialsOf(p.name)}
      {p.image && !failed && <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
    </span>
  );
}

export function PlayersRootView() {
  const gap = useScrollbarGap();
  const router = useRouter();
  const [rows, setRows] = useState<ListPlayer[] | null>(null);
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
    Promise.all([fetchPlayerList(), fetchTournamentIndex().catch(() => [])])
      .then(([list, tournaments]) => {
        if (!live) return;
        setRows(list);
        setNames(new Map(tournaments.map((t) => [t.key, t.name])));
        const p = new URLSearchParams(window.location.search);
        const start = { ...NO_FILTERS };
        for (const k of Object.keys(start) as FilterKey[]) { const v = p.get(k); if (v) start[k] = v; }
        setFilters(start); setQuery(p.get('q') ?? '');
      })
      .catch((error: unknown) => { console.error('The player list failed to load', error); if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);

  // The loader hides the site bar until its mark is cleared, which a timer does a moment after it goes. The page does not wait for the timer: its own bar is shown as soon as it draws.
  useLayoutEffect(() => { if (rows) document.body.removeAttribute('data-loading'); }, [rows]);
  useEffect(() => { document.title = 'Players | CricAtlas'; }, []);
  useEffect(() => {
    if (!rows) return;
    const q = paramsOf(filters, query).toString();
    window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
  }, [rows, filters, query]);

  const all = useMemo(() => rows ?? [], [rows]);
  const searched = useMemo(() => searchPlayers(all, query), [all, query]);
  const filtered = useMemo(() => applyFilters(searched, filters), [searched, filters]);
  // The search ranks its matches (a name that starts with the text first); a chosen sort or none other than the default keeps its own order.
  const sorted = useMemo(() => (query.trim() && sort === DEFAULT_SORT ? filtered : sortPlayers(filtered, sort)), [filtered, sort, query]);

  if (failed) return <ErrorState onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />;

  const change = (key: FilterKey, value: string | null): void => { setFilters((f) => ({ ...f, [key]: value })); setShown(PAGE); };
  const clear = (): void => { setFilters(NO_FILTERS); setQuery(''); setShown(PAGE); };
  const dirty = anyFilter(filters) || query.trim() !== '';
  const hiddenSet = FILTERS.filter((d) => d.more && filters[d.key] !== null).length;
  const go = (p: ListPlayer): void => openPage(router, hrefOf(p));

  const selectFor = (key: FilterKey, label: string) => (
    <label className="fl" key={key}>
      <select className={filters[key] !== null ? 'set' : ''} aria-label={label} value={filters[key] ?? ''} onChange={(e) => change(key, e.target.value || null)}>
        <option value="">{label}: all</option>
        {options(searched, filters, key, names).map((o) => <option key={o.value} value={o.value} disabled={o.players === 0}>{o.label}{o.players === 0 ? ' (no players)' : ''}</option>)}
      </select>
    </label>
  );

  const row = (p: ListPlayer, i: number) => (
    <tr key={p.id} data-rk={p.id} className="rlink rin" style={{ ['--i' as string]: Math.min(i, 12) }} role="link" tabIndex={0}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) go(p); }} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(p); } }}>
      <td className="l"><div className="pl"><Avatar p={p} /><div><b><Link href={hrefOf(p)}>{p.name}</Link></b><em>{lineOf(p)}</em></div></div></td>
      <td className="l">{p.country ?? '-'}</td>
      <td>{activeText(p)}</td>
      <td>{int(p.matches)}</td>
      <td>{p.runs > 0 ? int(p.runs) : '-'}</td>
      <td>{p.wickets > 0 ? int(p.wickets) : '-'}</td>
      <td><Link className="cb" href={`/compare/players?a=${encodeURIComponent(p.id)}`}>Compare</Link></td>
    </tr>
  );


  return (
    <div className="pgx rpp" ref={gap}>
      <main className="wrap">
        <div className="hd">
          <h1>Players</h1>
        </div>
        <div className="big">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input type="search" placeholder="Search players by name" aria-label="Search players" autoComplete="off" value={query}
            onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
        </div>
        <div className="fbar">
          <FilterSheetToggle />
          <div className="fr">
            {FILTERS.filter((d) => !d.more).map((d) => selectFor(d.key, d.label))}
            <button type="button" className={`mt${more || hiddenSet ? ' on' : ''}`} onClick={() => setMore((v) => !v)}>More filters{hiddenSet ? ` (${hiddenSet})` : ''} {more ? '▴' : '▾'}</button>
            <div className="cnt">
              <span className="t" style={rows ? undefined : { visibility: 'hidden' }}><b>{int(filtered.length)}</b>{dirty ? ` of ${int(all.length)}` : ''} players</span>
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
                  onClick={key ? () => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'name' || key === 'country' || key === 'firstYear' ? 1 : -1 })) : undefined}>{label}</th>
              ))}</tr>
            </thead>
            <tbody>{sorted.slice(0, shown).map((t, i) => row(t, i))}</tbody>
          </table>
          {!rows && <TableWait />}
          {rows && sorted.length === 0 && <div className="empty"><b>No player matches these filters</b>Clear a filter or change the search. <button type="button" className="clr" onClick={clear}>Clear all</button></div>}
          {sorted.length > shown && <div className="more"><MoreButton onMore={() => setShown((n) => n + PAGE)}>Show {int(Math.min(PAGE, sorted.length - shown))} more players</MoreButton></div>}
        </OpenIn>
      </main>
    </div>
  );
}
