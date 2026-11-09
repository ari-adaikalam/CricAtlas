'use client';

import { PrefetchLink as Link } from '@/components/PrefetchLink';
import { FilterSheetToggle } from './FilterSheetToggle';
import { OpenIn } from './OpenIn';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fetchMatchList, type ListMatch } from '@/data/matchList';
import { dateText } from '@/domain/dates';
import { anyFilter, applyFilters, buildSeries, bySection, DEFAULT_SORT, FILTERS, NO_FILTERS, options, searchSeries, sortSeries, SECTION_TITLE, type Filters, type FilterKey, type Section, type Series, type Sort, type SortKey } from '@/domain/seriesRoot';
import { teamLabels } from '@/domain/matchesRoot';
import { matchSlug, tournamentSlug } from '@/domain/slug';
import { ErrorState } from './states/PageStates';
import { TableWait } from './TableWait';
import { MoreButton } from './MoreButton';
import { TeamName } from './team/teamUi';
import { TeamText } from './tournament/parts';
import { useAddressChange } from './useAddressChange';
import { useScrollbarGap } from './useScrollbarGap';
import '@/styles/player.css';
import '@/styles/tournamentsroot.css';
import '@/styles/seriesroot.css';
import { openPage } from './openPage';

const PAGE = 50;
const DEFAULT_SEASON = '2026';
const SECTION_NOUN: Record<Section, string> = { Test: 'Test series', ODI: 'ODI series', T20I: 'T20I series', T20: 'T20 series', 'The Hundred': 'Hundred series' };
const COLS: ReadonlyArray<readonly [string, SortKey | null, boolean]> = [['', null, true], ['Series', 'name', true], ['Dates', 'date', true], ['Mat', 'matches', false], ['Result', null, true]];
const int = (n: number): string => n.toLocaleString('en');

function paramsOf(f: Filters, q: string): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of Object.keys(f) as FilterKey[]) if (f[k] !== null) p.set(k, f[k]!);
  if (f.season === null) p.set('season', '');
  if (q) p.set('q', q);
  return p;
}

/** "19 Dec 2001 to 3 Jan 2002", with the first year left out when both dates share it. */
function datesText(s: Series): string {
  if (s.first === s.last) return dateText(s.first);
  const sameYear = s.first.slice(0, 4) === s.last.slice(0, 4);
  return `${dateText(s.first, { month: true, year: !sameYear })} to ${dateText(s.last)}`;
}

function MatchLine({ m }: { m: ListMatch }) {
  const router = useRouter();
  const href = `/matches/${matchSlug(m.team1.name, m.team2.name, m.date, m.id)}`;
  const winner = m.winner >= 0 ? (m.winner === 0 ? m.team1 : m.team2) : null;
  return (
    <div className="sxm" role="link" tabIndex={0} onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) openPage(router, href); }}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPage(router, href); } }}>
      <span className="sd">{dateText(m.date)}</span>
      <span className="sg"><TeamText id={m.team1.id} name={m.team1.name} inRow /> v <TeamText id={m.team2.id} name={m.team2.name} inRow />{m.stage && <span className="tg f">{m.stage}</span>}</span>
      <span className="sr">{winner ? <><b>{winner.name}</b> won {m.margin}</> : m.margin.charAt(0).toUpperCase() + m.margin.slice(1)}</span>
      <span className="sv">{m.venue ?? ''}</span>
    </div>
  );
}

export function SeriesRootView() {
  const gap = useScrollbarGap();
  const [matches, setMatches] = useState<ListMatch[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [query, setQuery] = useState('');
  const [limits, setLimits] = useState<Partial<Record<Section, number>>>({});
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set());

  // The filters, search and open rows an address asks for. The page opens on 2026 (Ari, 2026-10-24); an address with a season, or with season= left empty, keeps its own.
  const fromAddress = (p: URLSearchParams, list: readonly ListMatch[]): void => {
    const start = { ...NO_FILTERS };
    for (const k of Object.keys(start) as FilterKey[]) { const v = p.get(k); if (v) start[k] = v; }
    if (!p.has('season')) start.season = DEFAULT_SEASON;
    setFilters(start); setQuery(p.get('q') ?? ''); setLimits({});
    // A link from the Series menu opens the rows it names.
    setOpenRows(p.get('open') ? new Set(applyFilters(searchSeries(buildSeries(list), p.get('q') ?? ''), start).slice(0, 20).map((s) => s.id)) : new Set());
  };
  const written = useRef<string | null>(null);
  useAddressChange((p) => { if (matches) fromAddress(p, matches); }, written);
  useEffect(() => {
    let live = true;
    fetchMatchList()
      .then((list) => {
        if (!live) return;
        setMatches(list);
        fromAddress(new URLSearchParams(window.location.search), list);
      })
      .catch((error: unknown) => { console.error('The match list failed to load', error); if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);

  useLayoutEffect(() => { if (matches) document.body.removeAttribute('data-loading'); }, [matches]);
  useEffect(() => { document.title = 'Series | CricAtlas'; }, []);
  useEffect(() => {
    if (!matches) return;
    const q = paramsOf(filters, query).toString();
    written.current = q;
    window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
  }, [matches, filters, query]);
  const all = useMemo(() => (matches ? buildSeries(matches) : []), [matches]);
  const names = useMemo(() => (matches ? teamLabels(matches) : new Map<string, string>()), [matches]);
  const searched = useMemo(() => searchSeries(all, query), [all, query]);
  const filtered = useMemo(() => applyFilters(searched, filters), [searched, filters]);
  const sorted = useMemo(() => sortSeries(filtered, sort), [filtered, sort]);

  if (failed) return <ErrorState onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />;

  const change = (key: FilterKey, value: string | null): void => { setFilters((f) => ({ ...f, [key]: value })); setLimits({}); };
  const clear = (): void => { setFilters(NO_FILTERS); setQuery(''); setLimits({}); };
  const dirty = anyFilter(filters) || query.trim() !== '';
  const toggle = (id: string): void => setOpenRows((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Each section shows its newest rows and its own Show more, so no section is cut off by another.
  const sections = bySection(sorted).map((g) => ({ ...g, total: g.rows.length, rows: g.rows.slice(0, limits[g.section] ?? PAGE) }));
  let at = 0;

  const row = (s: Series, i: number) => {
    const isOpen = openRows.has(s.id);
    const two = s.teams.length === 2;
    return (
      <Fragment key={s.id}>
        <tr data-rk={s.id} className={`rlink rin${isOpen ? ' open' : ''}`} style={{ ['--i' as string]: Math.min(i, 12) }} role="button" tabIndex={0} aria-expanded={isOpen}
          onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) toggle(s.id); }} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(s.id); } }}>
          <td className="l cv"><span className="chev" aria-hidden="true" /></td>
          <td className="l">
            <div className="sxn">
              {two
                ? <b className="sxt"><TeamName id={s.teams[0]!.id} name={s.teams[0]!.name} size={18} inRow /><span className="vs">v</span><TeamName id={s.teams[1]!.id} name={s.teams[1]!.name} size={18} inRow /></b>
                : <b>{s.key ? <Link href={`/tournaments/${tournamentSlug(s.key)}`}>{s.name}</Link> : s.name}</b>}
              <em>{two ? `${s.name}${s.name.includes(s.season.slice(0, 4)) ? '' : ` ${s.season}`}${s.female ? ', women' : ''}` : `${s.teams.length} teams, ${s.season}${s.female ? ', women' : ''}`}</em>
            </div>
          </td>
          <td className="l wrapc">{datesText(s)}</td>
          <td>{int(s.matches.length)}</td>
          <td className="l wrapc">{s.result || <span className="mut">-</span>}</td>
        </tr>
        <tr className={`sxr${isOpen ? ' on' : ''}`} aria-hidden={!isOpen}>
          <td colSpan={5}>
            <div className="sxw"><div className="sxi">{isOpen && s.matches.map((m) => <MatchLine key={m.id} m={m} />)}</div></div>
          </td>
        </tr>
      </Fragment>
    );
  };

  return (
    <div className="pgx rtn rsr" ref={gap}>
      <main className="wrap">
        <div className="hd">
          <h1>Series</h1>
        </div>
        <div className="big">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input type="search" placeholder="Search by team, event or season" aria-label="Search series" autoComplete="off" value={query} onChange={(e) => { setQuery(e.target.value); setLimits({}); }} />
        </div>
        <div className="fbar">
          <FilterSheetToggle />
          <div className="fr">
            {FILTERS.map(({ key, label }) => (
              <label className="fl" key={key}>
                <select className={filters[key] !== null ? 'set' : ''} aria-label={label} value={filters[key] ?? ''} onChange={(e) => change(key, e.target.value || null)}>
                  <option value="">{label}: all</option>
                  {options(searched, filters, key, names).map((o) => <option key={o.value} value={o.value} disabled={o.series === 0}>{o.label}{o.series === 0 ? ' (none)' : ''}</option>)}
                </select>
              </label>
            ))}
            <div className="cnt">
              <span className="t" style={matches ? undefined : { visibility: 'hidden' }}><b>{int(filtered.length)}</b>{dirty ? ` of ${int(all.length)}` : ''} series</span>
              <span className={`clrw${dirty ? ' on' : ''}`} aria-hidden={!dirty}><button type="button" className="clr" tabIndex={dirty ? 0 : -1} onClick={clear}>Clear all</button></span>
            </div>
          </div>
        </div>
        <OpenIn className="tbl">
          <table>
            <thead>
              <tr>{COLS.map(([label, key, left], c) => (
                <th key={c} className={`${left ? 'l' : ''}${key && sort.key === key ? ` on${sort.dir > 0 ? ' asc' : ''}` : ''}`}
                  onClick={key ? () => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 })) : undefined}>{label}</th>
              ))}</tr>
            </thead>
            <tbody>
              {sections.map((g) => (
                <Fragment key={g.section}>
                  <tr className="sec"><td colSpan={5}><b>{SECTION_TITLE[g.section]}</b><span>{int(g.total)} {g.total === 1 ? 'series' : 'series'}</span></td></tr>
                  {g.rows.map((s) => row(s, at++))}
                  {g.total > g.rows.length && <tr className="more"><td colSpan={5}><MoreButton onMore={() => setLimits((l) => ({ ...l, [g.section]: g.rows.length + PAGE }))}>Show {int(Math.min(PAGE, g.total - g.rows.length))} more {SECTION_NOUN[g.section]}</MoreButton></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!matches && <TableWait />}
          {matches && sorted.length === 0 && <div className="empty"><b>No series fits these filters</b>Clear a filter or change the search. <button type="button" className="clr" onClick={clear}>Clear all</button></div>}
        </OpenIn>
      </main>
    </div>
  );
}
