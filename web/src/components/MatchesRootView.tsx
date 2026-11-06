'use client';

import { OpenIn } from './OpenIn';
import { FilterSheetToggle } from './FilterSheetToggle';
import { usePhone } from './usePhone';
import { useScrollbarGap } from './useScrollbarGap';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { fetchMatchList, type ListMatch } from '@/data/matchList';
import { fetchTournamentIndex } from '@/data/tournamentData';
import { matchSlug } from '@/domain/slug';
import {
  anyFilter, applyFilters, dayMonth, DEFAULT_SORT, FILTERS, formatTag, NO_FILTERS, options, resultOf, searchMatches, sortMatches, teamLabels, type Filters, type FilterKey, type Sort, type SortKey,
} from '@/domain/matchesRoot';
import { EntityLink } from './EntityLink';
import { ErrorState } from './states/PageStates';
import { TableWait } from './TableWait';
import { MoreButton } from './MoreButton';
import { TeamText } from './tournament/parts';
import '@/styles/player.css';
import '@/styles/matchesroot.css';

const PAGE = 50;
const COLS: ReadonlyArray<readonly [string, SortKey | null, boolean]> = [['Date', 'date', true], ['Match', null, true], ['Result', null, true], ['Competition', null, true], ['Venue', 'venue', true], ['Player of the match', null, true]];
const int = (n: number): string => n.toLocaleString('en');
const hrefOf = (m: ListMatch): string => `/matches/${matchSlug(m.team1.name, m.team2.name, m.date, m.id)}`;

function paramsOf(f: Filters, q: string): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of Object.keys(f) as FilterKey[]) if (f[k] !== null) p.set(k, f[k]!);
  if (q) p.set('q', q);
  return p;
}

export function MatchesRootView() {
  const gap = useScrollbarGap();
  const router = useRouter();
  const [rows, setRows] = useState<ListMatch[] | null>(null);
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
    Promise.all([fetchMatchList(), fetchTournamentIndex().catch(() => [])])
      .then(([list, tournaments]) => {
        if (!live) return;
        setRows(list);
        setNames(new Map(tournaments.map((t) => [t.key, t.name])));
        const p = new URLSearchParams(window.location.search);
        const start = { ...NO_FILTERS };
        for (const k of Object.keys(start) as FilterKey[]) { const v = p.get(k); if (v) start[k] = v; }
        setFilters(start); setQuery(p.get('q') ?? '');
      })
      .catch((error: unknown) => { console.error('The match list failed to load', error); if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);

  // The page's own bar shows as soon as the page draws, without waiting for the loader's timer.
  useLayoutEffect(() => { if (rows) document.body.removeAttribute('data-loading'); }, [rows]);
  useEffect(() => { document.title = 'Matches | CricAtlas'; }, []);
  useEffect(() => {
    if (!rows) return;
    const q = paramsOf(filters, query).toString();
    window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
  }, [rows, filters, query]);

  const all = useMemo(() => rows ?? [], [rows]);
  const labels = useMemo(() => teamLabels(all), [all]);
  const searched = useMemo(() => searchMatches(all, query), [all, query]);
  const filtered = useMemo(() => applyFilters(searched, filters), [searched, filters]);
  const sorted = useMemo(() => sortMatches(filtered, sort), [filtered, sort]);

  if (failed) return <ErrorState onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />;

  const change = (key: FilterKey, value: string | null): void => { setFilters((f) => ({ ...f, [key]: value })); setShown(PAGE); };
  const clear = (): void => { setFilters(NO_FILTERS); setQuery(''); setShown(PAGE); };
  const dirty = anyFilter(filters) || query.trim() !== '';
  const hiddenSet = FILTERS.filter((d) => d.more && filters[d.key] !== null).length;
  const go = (m: ListMatch): void => router.push(hrefOf(m));

  const selectFor = (key: FilterKey, label: string) => (
    <label className="fl" key={key}>
      <select className={filters[key] !== null ? 'set' : ''} aria-label={label} value={filters[key] ?? ''} onChange={(e) => change(key, e.target.value || null)}>
        <option value="">{label}: all</option>
        {options(searched, filters, key, names, labels).map((o) => <option key={o.value} value={o.value} disabled={o.matches === 0}>{o.label}{o.matches === 0 ? ' (no matches)' : ''}</option>)}
      </select>
    </label>
  );

  const side = (team: ListMatch['team1'], score: string, won: boolean) => (
    <div className={`mmr${won ? ' w' : ''}`}><span><TeamText id={team.id} name={team.name} inRow /></span><b>{score || '-'}</b></div>
  );

  const row = (m: ListMatch, i: number) => {
    const result = resultOf(m);
    return (
      <tr key={m.id} data-rk={m.id} className="rlink rin" style={{ ['--i' as string]: Math.min(i, 12) }} role="link" tabIndex={0}
        onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) go(m); }} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(m); } }}>
        <td className="dt"><b>{dayMonth(m.date)}</b><span>{m.date.slice(0, 4)}</span></td>
        <td className="l"><div className="mmt">{side(m.team1, m.score1, m.winner === 0)}{side(m.team2, m.score2, m.winner === 1)}</div></td>
        <td className="rs">
          {m.winner >= 0
            ? <><b><TeamText id={(m.winner === 0 ? m.team1 : m.team2).id} name={(m.winner === 0 ? m.team1 : m.team2).name} inRow /> won</b><span>{m.margin}</span></>
            : <><b>{result}</b>{m.kind === 'test' && result === 'Drawn' ? <span>Test drawn</span> : result === 'Tied' ? <span>Scores level</span> : null}</>}
        </td>
        <td className="mcp">
          {m.key ? <EntityLink entity={{ kind: 'tournament', id: m.key, name: m.competition }}>{m.competition}</EntityLink> : m.competition}
          {m.stage && <span className="tg f">{m.stage}</span>}
          <span>{formatTag(m)}, {m.female ? 'women' : 'men'}</span>
        </td>
        <td className="mcp">{m.venue ?? '-'}<span>{m.country ?? ''}</span></td>
        <td className="pm">{m.potm ? <EntityLink entity={{ kind: 'player', id: m.potm.id, name: m.potm.name }}>{m.potm.name}</EntityLink> : '-'}</td>
      </tr>
    );
  };


  return (
    <div className="pgx rmp" ref={gap}>
      <main className="wrap">
        <div className="hd">
          <h1>Matches</h1>
        </div>
        <div className="big">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input type="search" placeholder="Search by team, venue, competition, stage or player" aria-label="Search matches" autoComplete="off" value={query}
            onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
        </div>
        <div className="fbar">
          <FilterSheetToggle />
          <div className="fr">
            {FILTERS.filter((d) => !d.more).map((d) => selectFor(d.key, d.label))}
            <button type="button" className={`mt${more || hiddenSet ? ' on' : ''}`} onClick={() => setMore((v) => !v)}>More filters{hiddenSet ? ` (${hiddenSet})` : ''} {more ? '▴' : '▾'}</button>
            <div className="cnt">
              <span className="t" style={rows ? undefined : { visibility: 'hidden' }}><b>{int(filtered.length)}</b>{dirty ? ` of ${int(all.length)}` : ''} matches</span>
              <span className={`clrw${dirty ? ' on' : ''}`} aria-hidden={!dirty}><button type="button" className="clr" tabIndex={dirty ? 0 : -1} onClick={clear}>Clear all</button></span>
            </div>
          </div>
          {(more || phone) && <div className="fr f2">{FILTERS.filter((d) => d.more).map((d) => selectFor(d.key, d.label))}</div>}
        </div>
        <OpenIn className="tbl">
          <table>
            <thead>
              <tr>{COLS.map(([label, key, left]) => (
                <th key={label} className={`${left ? 'l' : ''}${key && sort.key === key ? ` on${sort.dir > 0 ? ' asc' : ''}` : ''}`}
                  onClick={key ? () => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'venue' ? 1 : -1 })) : undefined}>{label}</th>
              ))}</tr>
            </thead>
            <tbody>{sorted.slice(0, shown).map((m, i) => row(m, i))}</tbody>
          </table>
          {!rows && <TableWait />}
          {rows && sorted.length === 0 && <div className="empty"><b>No match fits these filters</b>Clear a filter or change the search. <button type="button" className="clr" onClick={clear}>Clear all</button></div>}
          {sorted.length > shown && <div className="more"><MoreButton onMore={() => setShown((n) => n + PAGE)}>Show {int(Math.min(PAGE, sorted.length - shown))} more matches</MoreButton></div>}
        </OpenIn>
      </main>
    </div>
  );
}
