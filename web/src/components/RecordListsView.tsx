'use client';

import { OpenIn } from './OpenIn';
import { FilterSheetToggle } from './FilterSheetToggle';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fetchRecordsCategory, fetchRecordsIndex, fetchRecordsSlices, prefetchRecordsScope } from '@/data/recordFiles';
import { cellText, defaultScope, findSlice, scopesOf, searchLists, SLICE_FILTERS, switchGender, type Cell, type CellKind, type Gender, type RecordList, type RecordsCategory, type RecordsIndex, type RecordsScope, type RecordsSlices } from '@/domain/recordLists';
import { CountedText } from './charts/CountedText';
import { EntityLink } from './EntityLink';
import { ErrorState } from './states/PageStates';
import { TableWait } from './TableWait';
import { MoreButton } from './MoreButton';
import { TeamEmblem } from './TeamEmblem';
import { useAddressChange } from './useAddressChange';
import { useMatchRowLink } from './useMatchRowLink';
import { useScrollbarGap } from './useScrollbarGap';
import { useTableMotion } from './useTableMotion';
import '@/styles/player.css';
import '@/styles/teamsroot.css';
import '@/styles/recordlists.css';

const PAGE = 50;
/** The column of a list that carries its record: its number counts up and is drawn bold. */
const HEADLINE = ['Runs', 'Wkts', 'Figures', 'Awards', 'Catches', 'Dis', 'Ct', 'Score', 'Matches', 'Mat'];

const pairOf = (c: Cell): readonly [string, string | null] | null => (Array.isArray(c) && c.length >= 2 ? [String(c[0]), c[1] == null ? null : String(c[1])] : null);
const shownKind = (kind: CellKind): boolean => kind !== 'match' && kind !== 'sub';
const int = (n: number): string => n.toLocaleString('en');

function RecordTable({ list, bpo, shown, dataKey, onMore }: { list: RecordList; bpo: number; shown: number; dataKey: string; onMore: () => void }) {
  const link = useMatchRowLink();
  const { ref, motion, played } = useTableMotion<HTMLDivElement>(dataKey, dataKey);
  const matchAt = list.cols.findIndex(([k]) => k === 'match' || k === 'matchname');
  const subAt = list.cols.findIndex(([k]) => k === 'sub');
  const lead = list.cols.findIndex(([k]) => shownKind(k));
  const headline = list.hl != null ? list.hl : (() => { for (const h of HEADLINE) { const i = list.cols.findIndex(([, label]) => label === h); if (i >= 0) return i; } return -1; })();
  const draw = (kind: CellKind, cell: Cell, col: number): React.ReactNode => {
    if (cell === null) return '-';
    if (kind === 'player') { const [name, id] = pairOf(cell)!; return id ? <EntityLink entity={{ kind: 'player', id, name }}>{name}</EntityLink> : name; }
    if (kind === 'players') { const c = cell as readonly [string, string, string, string]; return <>{<EntityLink entity={{ kind: 'player', id: c[1], name: c[0] }}>{c[0]}</EntityLink>}<span className="amp"> and </span>{<EntityLink entity={{ kind: 'player', id: c[3], name: c[2] }}>{c[2]}</EntityLink>}</>; }
    if (kind === 'team') { const [name, id] = pairOf(cell)!; return id ? <span className="rt"><span className="tem"><TeamEmblem team={name} size={20} /></span><EntityLink entity={{ kind: 'team', id, name }}>{name}</EntityLink></span> : name; }
    if (kind === 'matchname') return pairOf(cell)![1];
    if (kind === 'match') return <span className="rm">Scorecard</span>;
    const text = cellText(kind, cell, bpo);
    return col === headline ? <CountedText text={text} play={played} /> : text;
  };
  return (
    <div className="rtab" ref={ref} data-rows={motion}>
      <table>
        <thead><tr><th className="l">#</th>{list.cols.map(([kind, label], i) => (!shownKind(kind) ? null : <th key={i} className={kind === 'player' || kind === 'players' || kind === 'team' || kind === 'text' || kind === 'matchname' || kind === 'date' ? 'l' : undefined}>{label}</th>))}</tr></thead>
        <tbody>
          {list.rows.slice(0, shown).map((row, r) => {
            const m = matchAt >= 0 ? row[matchAt] : null;
            const props = Array.isArray(m) && m.length >= 2 ? link(Number(m[0]), 'the scorecard') : {};
            return (
              <tr key={r} className={matchAt >= 0 ? 'rlink' : undefined} {...props}>
                <td className="l rk">{r + 1}</td>
                {list.cols.map(([kind, label], i) => (!shownKind(kind) ? null : <td key={i} className={`${kind === 'player' || kind === 'players' || kind === 'team' || kind === 'text' || kind === 'matchname' || kind === 'date' ? 'l' : ''}${i === headline ? ' hl' : ''}${['Ground', 'Series', 'Match', 'Teams', 'Team', 'Against', 'Period', 'Location', 'Venue', 'Opposition', 'Winner'].includes(label) && (kind === 'text' || kind === 'matchname') ? ' gr' : ''}`} title={typeof row[i] === 'string' && row[i].length > 14 ? String(row[i]) : undefined}>{draw(kind, row[i] ?? null, i)}{i === lead && subAt >= 0 && row[subAt] ? <span className="rsb">{String(row[subAt])}</span> : null}</td>))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.rows.length > shown && <div className="more"><MoreButton onMore={onMore}>Show {int(Math.min(PAGE, list.rows.length - shown))} more rows</MoreButton></div>}
    </div>
  );
}

/**
 * The Records page: a format or a competition, men or women, and under it the lists of records, grouped in the categories of the records pages people know (Team, Batting, Bowling,
 * Fielding, All-round, Partnership, Individual). The lists are worked out from the ball-by-ball data, so a career is a career since 2001, and the page says so.
 */
export function RecordListsView() {
  const gap = useScrollbarGap();
  const [index, setIndex] = useState<RecordsIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [scope, setScope] = useState<RecordsScope | null>(null);
  const [cat, setCat] = useState('batting');
  const [listId, setListId] = useState<string | null>(null);
  const [slice, setSlice] = useState<string | null>(null);
  const [slices, setSlices] = useState<RecordsSlices | null>(null);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<Record<string, RecordsCategory>>({});
  const [shown, setShown] = useState(PAGE);
  const wanted = useRef<{ list: string | null; cat: string | null }>({ list: null, cat: null });

  // What an address asks for: the scope, the category and list, the slice and the search. It is read when the page opens and again when a link (the Records menu) changes only the address.
  const fromAddress = (p: URLSearchParams, i: RecordsIndex): void => {
    setScope(defaultScope(i, p.get('scope')));
    setSlice(p.get('slice'));
    wanted.current = { list: p.get('list'), cat: p.get('cat') };
    setListId(null); setShown(PAGE);
    setCat(p.get('cat') && i.categories.some(([k]) => k === p.get('cat')) ? p.get('cat')! : 'batting');
    setQuery(p.get('q') ?? '');
  };
  const written = useRef<string | null>(null);
  useAddressChange((p) => { if (index) fromAddress(p, index); }, written);

  useEffect(() => {
    let live = true;
    fetchRecordsIndex().then((i) => {
      if (!live) return;
      setIndex(i);
      fromAddress(new URLSearchParams(window.location.search), i);
    }).catch((error: unknown) => { console.error('The records index failed to load', error); if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);
  useLayoutEffect(() => { if (index) document.body.removeAttribute('data-loading'); }, [index]);
  useEffect(() => { document.title = 'Records | CricAtlas'; }, []);

  // The years, teams, grounds and trophies of the scope. A slice named in the address that the scope does not have is dropped.
  useEffect(() => {
    if (!scope) return;
    let live = true;
    setSlices(null);
    fetchRecordsSlices(scope.key).then((d) => { if (live) { setSlices(d); setSlice((was) => (was && !findSlice(d, was) ? null : was)); } }).catch((error: unknown) => { console.error('The records slices failed to load', error); if (live) setSlices({}); });
    return () => { live = false; };
  }, [scope]);
  const sliceReady = slice === null || slices !== null;
  const sliceKey = slice ?? 'all';

  // The category on screen loads first, the others behind it (they are small), so a search finds a list in any category.
  const names = useMemo(() => index?.categories.map(([k]) => k) ?? [], [index]);
  useEffect(() => {
    if (!scope || !sliceReady) return;
    let live = true;
    const key = (c: string): string => `${scope.key}/${sliceKey}/${c}`;
    const order = [cat, ...names.filter((c) => c !== cat)];
    order.forEach((c) => { fetchRecordsCategory(scope.key, c, slice).then((d) => { if (live) setData((was) => (was[key(c)] ? was : { ...was, [key(c)]: d })); }).catch((error: unknown) => console.error('A records file failed to load', error)); });
    return () => { live = false; };
  }, [scope, cat, names, slice, sliceKey, sliceReady]);
  useEffect(() => { if (scope && sliceReady) prefetchRecordsScope(scope.key, names, slice); }, [scope, names, slice, sliceReady]);

  const loaded = (c: string): RecordsCategory | undefined => (scope ? data[`${scope.key}/${sliceKey}/${c}`] : undefined);
  const current = loaded(cat);
  const searching = query.trim() !== '';
  // The titles on the left: the category's, or every list of every loaded category that matches the search.
  const titles = useMemo(() => {
    if (!scope || !index) return [] as Array<{ cat: string; list: RecordList }>;
    const cats = searching ? names : [cat];
    return cats.flatMap((c) => searchLists(data[`${scope.key}/${sliceKey}/${c}`]?.lists ?? [], query).map((list) => ({ cat: c, list })));
  }, [scope, index, names, cat, data, query, searching, sliceKey]);
  const active = useMemo(() => {
    const pick = titles.find((t) => t.list.id === listId) ?? (wanted.current.list ? titles.find((t) => t.list.id === wanted.current.list) : undefined) ?? titles[0];
    return pick ?? null;
  }, [titles, listId]);

  useEffect(() => {
    if (!scope || !index) return;
    const p = new URLSearchParams();
    p.set('scope', scope.key);
    p.set('cat', active?.cat ?? cat);
    if (active) p.set('list', active.list.id);
    if (slice) p.set('slice', slice);
    if (query.trim()) p.set('q', query.trim());
    written.current = p.toString();
    window.history.replaceState(null, '', `/records?${p}`);
  }, [scope, index, cat, active, query, slice]);

  if (failed) return <ErrorState onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />;
  if (!index || !scope) {
    return (
      <div className="pgx rtp rrl" ref={gap}>
        <main className="wrap">
          <div className="hd"><h1>Records</h1></div>
          <div className="fbar"><div className="fr rshell" /></div>
          <OpenIn key="list" className="rlay"><TableWait /></OpenIn>
        </main>
      </div>
    );
  }

  const gender: Gender = scope.gender;
  const formats = scopesOf(index, gender).filter((s) => s.kind !== 'tournament');
  const tournaments = scopesOf(index, gender).filter((s) => s.kind === 'tournament');
  const chooseScope = (s: RecordsScope | null): void => { if (!s) return; setScope(s); setSlice((was) => (s.key === scope.key ? was : null)); setShown(PAGE); setListId(null); wanted.current = { list: null, cat: null }; };
  const chooseSlice = (key: string): void => { setSlice(key === '' ? null : key); setShown(PAGE); setListId(null); wanted.current = { list: null, cat: null }; };
  const chooseCat = (c: string): void => { setCat(c); setListId(null); setShown(PAGE); setQuery(''); wanted.current = { list: null, cat: null }; };
  const pickList = (c: string, id: string): void => { setCat(c); setListId(id); setShown(PAGE); wanted.current = { list: null, cat: null }; };
  const active_slice = findSlice(slices, slice);
  const listCount = (c: string, i: number): number => active_slice?.lists[i] ?? scope.lists[c] ?? 0;
  const total = active_slice ? active_slice.lists.reduce((a, b) => a + b, 0) : Object.values(scope.lists).reduce((a, b) => a + b, 0);
  const matchCount = active_slice?.matches ?? scope.matches;

  return (
    <div className="pgx rtp rrl" ref={gap}>
      <main className="wrap">
        <div className="hd">
          <h1>Records</h1>
        </div>
        <div className="fbar">
          <FilterSheetToggle />
          <div className="fr">
            <span className="sw rsw" role="group" aria-label="Men or women">
              {(['male', 'female'] as const).map((g) => <button key={g} type="button" className={gender === g ? 'on' : undefined} aria-pressed={gender === g} onClick={() => chooseScope(switchGender(index, scope, g))}>{g === 'male' ? 'Men' : 'Women'}</button>)}
            </span>
            <label className="fl rf">
              <select aria-label="Format or competition" value={scope.key} onChange={(e) => chooseScope(index.scopes.find((s) => s.key === e.target.value) ?? null)}>
                <optgroup label="Formats">{formats.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>
                {tournaments.length > 0 && <optgroup label="Competitions">{tournaments.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>}
              </select>
            </label>
            {SLICE_FILTERS.map((f) => {
              const groups = f.kinds.map((k) => ({ k, items: slices?.[k] ?? [] })).filter((g) => g.items.length > 0);
              if (groups.length === 0) return null;
              const mine = groups.some((g) => g.items.some((x) => x.key === slice));
              return (
                <label className="fl rs" key={f.id}>
                  <select aria-label={f.label} className={mine ? 'set' : undefined} value={mine ? slice ?? '' : ''} onChange={(e) => chooseSlice(e.target.value)}>
                    <option value="">{f.label}: all</option>
                    {groups.map((g) => (g.items.length > 0 && <optgroup key={g.k} label={g.k === 'decade' ? 'Decades' : g.k === 'year' ? 'Years' : f.label + 's'}>{g.items.map((x) => <option key={x.key} value={x.key}>{f.label}: {x.label}</option>)}</optgroup>))}
                  </select>
                </label>
              );
            })}
            <input className="rq" type="search" placeholder="Search lists" aria-label="Search the records" autoComplete="off" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
            <div className="cnt"><span className="t"><b>{int(total)}</b> lists, {int(matchCount)} matches</span></div>
          </div>
        </div>
        <div className="chips rcats" role="tablist" aria-label="Categories">
          {index.categories.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={!searching && cat === k} className={`chip${!searching && cat === k ? ' on' : ''}`} onClick={() => chooseCat(k)}>{label} <em>{listCount(k, index.categories.findIndex(([x]) => x === k))}</em></button>
          ))}
        </div>
        {/* The same key as the loading page above: the wrapper is kept when the data comes, so the heading's entrance, which waits for it, is not started a second time. */}
        <OpenIn key="list" className="rlay">
          <nav className="rnav" aria-label="Record lists">
            {titles.length === 0 && <div className="empty"><b>{current || searching ? 'No record list matches' : 'Loading'}</b>{searching ? <>Change the search. <button type="button" className="clr" onClick={() => setQuery('')}>Clear</button></> : null}</div>}
            {titles.map((t, i) => (
              <Fragment key={`${t.cat}/${t.list.id}`}>
                {searching && (i === 0 || titles[i - 1]!.cat !== t.cat) && <h3>{index.categories.find(([k]) => k === t.cat)?.[1]}</h3>}
                <button type="button" className={active?.list.id === t.list.id && active.cat === t.cat ? 'on' : undefined} onClick={() => pickList(t.cat, t.list.id)}>{t.list.title}</button>
              </Fragment>
            ))}
          </nav>
          <section className="rpanel" aria-live="polite">
            {active ? (
              <>
                <h2>{active.list.title}</h2>
                {(active.list.note || scope.bpo === 5) && <p className="rsub">{active.list.note ?? ''}{scope.bpo === 5 ? `${active.list.note ? ' ' : ''}Overs have five balls.` : ''}</p>}
                <RecordTable list={active.list} bpo={scope.bpo} shown={shown} dataKey={`${scope.key}|${sliceKey}|${active.list.id}`} onMore={() => setShown((n) => n + PAGE)} />
              </>
            ) : <div className="empty"><b>{current ? 'Pick a list' : 'Loading the lists'}</b></div>}
          </section>
        </OpenIn>
      </main>
    </div>
  );
}
