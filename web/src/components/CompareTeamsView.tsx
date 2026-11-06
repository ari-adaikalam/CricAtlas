'use client';

import Link from 'next/link';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchPhases, fetchPlayers, fetchTeam, fetchTeamIndex, fetchWickets, teamSlugOf, type TeamBundle, type TeamIndexRow } from '@/data/teamData';
import { fetchTournamentIndex } from '@/data/tournamentData';
import { canCompareTeams, groupText, sharedCompetitions, teamCard } from '@/domain/compare';
import { scopeOf, sharedMatches, type TeamData } from '@/domain/compareTeams';
import { competitionOptions, defaultFilters, filtersFromParams, filtersToParams, normaliseFilters, type TeamFilters, } from '@/domain/team';
import { CountedText } from './charts/CountedText';
import { MorphText } from './MorphText';
import { useSmoothHeight } from './ProfileTable';
import { pct } from './team/teamUi';
import { NavBar, StripBrand } from './Nav';
import { usePhone } from './usePhone';
import { TileCarousel, TILE_PARAM } from './TileCarousel';
import { activePane, clearRemembered, leaveAsLayer, playKept } from './viewMorph';
import { teamOverallTiles, teamVersusTiles, type TeamCtx } from './compare/TeamTiles';
import { TeamFilterBar } from './team/TeamFilterBar';
import { FORMAT_NAME } from '@/domain/filters';
import { GOLD, PickChips, Reveal, SideColours, SKY, useTableHeight } from './compare/compareUi';
import { sideColours } from '@/domain/colours';
import { PageLoader } from './states/PageStates';
import { TeamEmblem } from './TeamEmblem';
import '@/styles/player.css';
import '@/styles/compareteams.css';
import '@/styles/comparefaces.css';
import '@/styles/compareextra.css';
import { SiteCredit } from '@/components/SiteCredit';

const int = (n: number): string => n.toLocaleString('en');
type Slot = 'a' | 'b';
interface Ids { a: string | null; b: string | null }
type Mode = 'sum' | 'ov' | 'vs';
type ViewMode = Exclude<Mode, 'sum'>;
const VIEW_PARAM: Record<Mode, string | null> = { sum: null, ov: 'overall', vs: 'versus' };
const VIEW_NAME: Record<ViewMode, string> = { ov: 'Overall', vs: 'Versus each other' };
const VIEW_ORDER: Record<Mode, number> = { sum: 0, ov: 1, vs: 2 };

const address = (ids: Ids): string => {
  const p = new URLSearchParams();
  if (ids.a) p.set('a', ids.a);
  if (ids.b) p.set('b', ids.b);
  const q = p.toString();
  return `/compare/teams${q ? `?${q}` : ''}`;
};
const ID = /^[a-z0-9-]+\|[a-z0-9-]+\|(male|female)$/;

const FORMAT_WORD: Record<string, string> = { TEST: 'Tests', ODI: 'ODIs', T20I: 'T20Is', T20: 'T20 league', HUNDRED: 'The Hundred' };
const FORMAT_ORDER = ['TEST', 'ODI', 'T20I', 'T20', 'HUNDRED'];

/**
 * The Compare teams pick screen: two cards, gold and sky, with the team's type, competitions and four numbers, Change team and Swap, and the
 * table of competitions both teams play. Only teams of one group can be compared (national sides of one gender, or the franchises of one league), so a slot's search lists those and names the rest.
 * "Compare this team" opens the page with that team in the first slot (`?a=`).
 */
export function CompareTeamsView({ active = true, onSwitch }: { active?: boolean; onSwitch?: () => void } = {}) {
  const phone = usePhone();
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (!sheet) return;
    const away = (e: PointerEvent): void => { if (!(e.target as Element).closest('.fsheet, .pfilt')) setSheet(false); };
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') setSheet(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [sheet]);
  const [ids, setIds] = useState<Ids | null>(null);
  const [index, setIndex] = useState<TeamIndexRow[] | null>(null);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [bundles, setBundles] = useState<Record<string, TeamBundle | null>>({});
  const [change, setChange] = useState<Slot | null>(null);
  // An address can name a team that is not in the data, or a second team that cannot be compared with the first: that slot opens empty with a line saying so, until a team is picked there.
  const [lost, setLost] = useState<Record<Slot, string | null>>({ a: null, b: null });
  // What was typed in each slot's search box: each has its own text and its own suggestions.
  const [texts, setTexts] = useState<Record<Slot, string>>({ a: '', b: '' });
  const setText = (slot: Slot, value: string): void => setTexts((was) => ({ ...was, [slot]: value }));
  // Each slot's chips (all, international, or one league) and its search box.
  const [kinds, setKinds] = useState<Record<Slot, string>>({ a: 'all', b: 'all' });
  const inputs = useRef<Record<Slot, HTMLInputElement | null>>({ a: null, b: null });
  // A slot keeps its last team's numbers and table while the next team's file loads, so a change of team morphs in place; `leaving` keeps the search layer on screen while it fades out.
  const shownBundle = useRef<Record<Slot, TeamBundle | null>>({ a: null, b: null });
  const [leaving, setLeaving] = useState<Slot | null>(null);
  const tableCard = useSmoothHeight();
  const [tableH, measureTable] = useTableHeight();
  const [mode, setMode] = useState<Mode>('sum');
  const [filters, setFilters] = useState<TeamFilters | null>(null);
  const [kept, setKept] = useState<readonly ViewMode[]>([]);
  const frozen = useRef<Partial<Record<ViewMode, ReactNode>>>({});
  const enterKept = useRef<1 | -1 | null>(null);
  const wanted = useRef<{ view: string | null; filters: Partial<TeamFilters> }>({ view: null, filters: {} });
  // A page opened on a view shows "Setting the field" until that view is ready, and then opens in its final frame (see ComparePlayersView).
  const [pending, setPending] = useState<ViewMode | null>(null);
  const [instant, setInstant] = useState(false);
  const [files, setFiles] = useState<{ key: string; value: NonNullable<TeamCtx['files']> } | null>(null);

  useLayoutEffect(() => { document.body.classList.add('has-app'); return () => document.body.classList.remove('has-app'); }, []);
  useEffect(() => {
    fetchTeamIndex().then(setIndex).catch(() => setIndex([]));
    fetchTournamentIndex().then((list) => setNames(new Map(list.map((t) => [t.key, t.name])))).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!index) return;
    const p = new URLSearchParams(window.location.search);
    const known = new Set(index.map((t) => t.id));
    const ok = (v: string | null): string | null => (v && ID.test(v) && known.has(v) ? v : null);
    const a = ok(p.get('a')); let b = ok(p.get('b'));
    // An address that names a pair that cannot be compared opens with the second slot empty.
    if (a && b && !canCompareTeams(a, b)) b = null;
    setIds({ a, b: b !== a ? b : null });
    const named = p.get('b');
    setLost(!active ? { a: null, b: null } : { a: p.get('a') && !a ? 'That team is not in the data. Choose another.' : null, b: named && !b ? (ok(named) ? 'That team cannot be compared with the first. Choose another.' : 'That team is not in the data. Choose another.') : null });
    wanted.current = { view: p.get('view'), filters: filtersFromParams(p) };
    const view = p.get('view');
    if (a && b && a !== b && canCompareTeams(a, b) && (view === 'overall' || view === 'versus')) { setPending(view === 'overall' ? 'ov' : 'vs'); setInstant(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [index]);
  useEffect(() => {
    if (!ids) return;
    for (const id of [ids.a, ids.b]) {
      if (!id || id in bundles) continue;
      fetchTeam(teamSlugOf(id)).then((b) => setBundles((was) => ({ ...was, [id]: b }))).catch(() => setBundles((was) => ({ ...was, [id]: null })));
    }
  }, [ids, bundles]);

  const row = (id: string | null): TeamIndexRow | null => (id && index ? index.find((t) => t.id === id) ?? null : null);
  const A = row(ids?.a ?? null), B = row(ids?.b ?? null);
  const openSlot: Slot | null = ids === null ? null : change ?? (!ids.a ? 'a' : !ids.b ? 'b' : null);
  const otherIdOf = (slot: Slot): string | null => (slot === 'a' ? ids?.b ?? null : ids?.a ?? null);

  const league = (key: string): string => names.get(key) ?? key.toUpperCase();
  // The teams a slot's search lists: those matching what was typed in that slot, comparable with the team in the other slot, and the ones that are not.
  const listFor = (slot: Slot): { yes: TeamIndexRow[]; no: TeamIndexRow[] } => {
    if (!index) return { yes: [], no: [] };
    const q = texts[slot].trim().toLowerCase(), otherId = otherIdOf(slot);
    const have = new Set([ids?.a, ids?.b]);
    const kind = kinds[slot];
    const inKind = (t: TeamIndexRow): boolean => kind === 'all' || (kind === 'intl' ? t.national : !t.national && t.comps.includes(kind));
    const all = index.filter((t) => !have.has(t.id) && inKind(t) && (!q || t.name.toLowerCase().includes(q) || t.earlier.some((n) => n.toLowerCase().includes(q))));
    const ok = (t: TeamIndexRow): boolean => !otherId || canCompareTeams(t.id, otherId);
    return { yes: all.filter(ok).sort((x, y) => y.matches - x.matches).slice(0, q ? 20 : 30), no: all.filter((t) => !ok(t)).sort((x, y) => y.matches - x.matches) };
  };
  // On a phone the keyboard opens only when the viewer taps the search box themselves, never because a slot became the open one.
  useEffect(() => { if (openSlot && !phone) inputs.current[openSlot]?.focus(); }, [openSlot, change, phone]);
  // The league chips: every league that has a franchise in the list, the one with most teams first.
  const leagueChips = useMemo(() => {
    const count = new Map<string, number>();
    for (const t of index ?? []) if (!t.national) for (const k of t.comps) count.set(k, (count.get(k) ?? 0) + 1);
    return [...count.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([k]) => k);
  }, [index]);

  // Picking in one slot clears only that slot's search; the other slot keeps what was typed.
  const go = (next: Ids, only?: Slot): void => { wanted.current = { view: null, filters: {} }; setPending(null); setInstant(false); setIds(next); setChange(null); setTexts((was) => (only ? { ...was, [only]: '' } : { a: '', b: '' })); setFilters(null); setMode('sum'); setKept([]); frozen.current = {}; clearRemembered(); window.history.replaceState(null, '', address(next)); };
  const closeSearch = (slot: Slot): void => { setLeaving(slot); window.setTimeout(() => setLeaving((now) => (now === slot ? null : now)), 340); };
  const pick = (slot: Slot, id: string): void => {
    if (!ids) return;
    closeSearch(slot); setLost((was) => ({ ...was, [slot]: null }));
    const mine = slot === 'a' ? ids.b : ids.a;
    // A pick that cannot be compared with the team already chosen replaces it.
    const keep = mine && canCompareTeams(mine, id) ? mine : null;
    go(slot === 'a' ? { a: id, b: keep } : { a: keep, b: id }, slot);
  };

  const typeOf = (t: TeamIndexRow): string => (t.national ? 'National team' : 'Franchise');
  const compsOf = (t: TeamIndexRow): string => (t.national ? [...t.fmts].sort((x, y) => FORMAT_ORDER.indexOf(x) - FORMAT_ORDER.indexOf(y)).map((f) => FORMAT_WORD[f] ?? f).join(', ') : t.comps.map(league).join(', '));
  const fact = (label: string, value: string) => <div key={label} title={`${label}: ${value || '-'}`}><span>{label}</span><MorphText as="b" text={value || '-'} /></div>;
  const card = (slot: Slot, t: TeamIndexRow) => {
    const colour = slot === 'a' ? GOLD : SKY;
    const fresh = bundles[t.id] ?? null;
    if (fresh) shownBundle.current[slot] = fresh;
    const bundle = fresh ?? shownBundle.current[slot];
    const s = bundle ? teamCard(bundle.matches) : null;
    return (
      <div className="pcard" key={slot} style={{ ['--pc' as string]: colour }}>
        <div className="pctop">
          <div className="photo tph" aria-hidden="true"><span className="fadein" key={t.id}><TeamEmblem team={t.name} size={52} /></span></div>
          <div className="pcb"><MorphText as="h2" text={t.name} nowrap /><div className="g"><MorphText text={`${t.gender === 'female' ? 'Women' : 'Men'}${t.national ? ', national team' : ', franchise'}`} /></div></div>
        </div>
        {!phone && <div className="pfacts">{fact('Type', t.national ? 'International' : 'League')}{fact('Competitions', compsOf(t))}</div>}
        <div className="pstat">{([['Matches', int(s?.matches ?? t.matches)], ['Win rate', pct(s ? s.rate : null)], ['Titles', s ? String(s.titles) : '-'], ['Lost finals', s ? String(s.finalsLost) : '-']] as const).map(([l, v]) => <div key={l}><b><CountedText text={v} morph /></b><span>{l}</span></div>)}</div>
        <button type="button" className="chg" onClick={() => { setChange(slot); setText(slot, ''); }}>Change team</button>
      </div>
    );
  };

  const suggList = (slot: Slot, id?: string) => {
    const { yes, no } = listFor(slot), other = row(otherIdOf(slot));
    return (
    <div className="sugg" id={id}>
      {index === null ? <div className="thin">Searching</div> : yes.map((t) => {
        const next: Ids = slot === 'a' ? { a: t.id, b: ids?.b ?? null } : { a: ids?.a ?? null, b: t.id };
        return <Link key={t.id} className="sg" href={address(next)} scroll={false} onClick={(e) => { e.preventDefault(); pick(slot, t.id); }}><b>{t.name}</b><span>{typeOf(t)}, {t.gender === 'female' ? 'women, ' : ''}{compsOf(t)}</span></Link>;
      })}
      {index !== null && yes.length === 0 && <div className="thin">No team matches.</div>}
      {other && no.length > 0 && <div className="sgn">Not comparable with {other.name} ({groupText(other.id, league)}): {no.slice(0, 4).map((t) => t.name).join(', ')}{no.length > 4 ? ` and ${no.length - 4} more` : ''}</div>}
    </div>
    );
  };

  // The search panel of a slot: the title and the search box, the chips, and the suggestions, which fill the panel's height. A slot with no team shows it as the slot itself; a slot with a team shows it as a layer over the card.
  const panel = (slot: Slot, has: boolean) => (
    <div className="pcard add" style={{ ['--pc' as string]: slot === 'a' ? GOLD : SKY }}>
      <div className="pcb">
        <div className="sloth">
          <h2>{has ? 'Choose another team' : 'Add a team'}</h2>
          <input ref={(el) => { inputs.current[slot] = el; }} className="bpq" type="search" value={texts[slot]} placeholder={row(otherIdOf(slot)) ? `Search teams that can be compared with ${row(otherIdOf(slot))!.name}` : 'Search teams'} aria-label={`Search teams for the ${slot === 'a' ? 'first' : 'second'} side`} autoComplete="off" onChange={(e) => setText(slot, e.target.value)} />
        </div>
        <PickChips label="Show" value={kinds[slot]} onChange={(next) => setKinds((was) => ({ ...was, [slot]: next }))} options={[['all', 'All'], ['intl', 'International'], ...leagueChips.map((k) => [k, league(k)] as const)]} />
        {lost[slot] && <div className="thin" role="status">{lost[slot]}</div>}
        {suggList(slot)}
      </div>
      {has && <button type="button" className="chg" onClick={() => { closeSearch(slot); setChange(null); setText(slot, ''); }}>Cancel</button>}
    </div>
  );

  // A slot is as tall as its search needs while it has no team or is being changed, and as tall as its card otherwise; the height eases between the two (see ComparePlayersView).
  const slotView = (slot: Slot) => {
    if (ids === null) return null;
    const id = ids[slot], t = slot === 'a' ? A : B, searching = !id || change === slot;
    const roomy = !(ids.a && ids.b) || change !== null;
    return (
      <div className={`pslot${roomy ? ' tall' : ''}`} key={`${slot}-s`}>
        {id && t && card(slot, t)}
        {(searching || leaving === slot) && <div className={`pover${searching ? ' on' : ''}`}>{panel(slot, Boolean(id))}</div>}
      </div>
    );
  };

  const BA = ids?.a ? bundles[ids.a] ?? shownBundle.current.a : null, BB = ids?.b ? bundles[ids.b] ?? shownBundle.current.b : null;
  const rows = useMemo(() => (A && B && BA && BB ? sharedCompetitions(BA.matches, BB.matches, A.national) : null), [A, B, BA, BB]);

  // ---- The comparison: the two teams' files, the choices shared by both, and the tiles ----------------------------------
  const freshA = ids?.a ? bundles[ids.a] ?? null : null, freshB = ids?.b ? bundles[ids.b] ?? null : null;
  const titleA = freshA?.info.name, titleB = freshB?.info.name;
  useEffect(() => { if (active) document.title = `${titleA && titleB ? `${titleA} v ${titleB}` : 'Compare teams'} | CricAtlas`; }, [active, titleA, titleB]);
  const data = useMemo<{ a: TeamData; b: TeamData } | null>(() => (freshA && freshB ? { a: { info: freshA.info, matches: freshA.matches, innings: freshA.innings }, b: { info: freshB.info, matches: freshB.matches, innings: freshB.innings } } : null), [freshA, freshB]);
  const union = useMemo(() => (data ? sharedMatches(data.a, data.b) : []), [data]);

  // The filters, once both teams are loaded: the address, else the busiest competition both play.
  useEffect(() => {
    if (filters || !data) return;
    const base = union.length ? defaultFilters(union) : null;
    if (!base) { setPending(null); return; }
    const start: TeamFilters = { ...base, ...wanted.current.filters, opponent: null, venue: null };
    setFilters(normaliseFilters(union, start, data.a.info.national) ?? base);
    if (wanted.current.view === 'overall') { setMode('ov'); setKept(['ov']); }
    if (wanted.current.view === 'versus') { setMode('vs'); setKept(['vs']); }
    setPending(null);
    wanted.current = { view: null, filters: {} };
  }, [data, union, filters]);

  const pairKey = ids?.a && ids.b ? `${ids.a}|${ids.b}` : '';
  // Players, wickets and phases of both teams load behind the Overall view's first paint (JSON files, no query engine).
  useEffect(() => {
    if (!ids?.a || !ids.b || !kept.includes('ov')) return;
    const [sa, sb] = [teamSlugOf(ids.a), teamSlugOf(ids.b)];
    let live = true;
    Promise.all([fetchPlayers(sa), fetchPlayers(sb), fetchWickets(sa), fetchWickets(sb), fetchPhases(sa), fetchPhases(sb)])
      .then(([pa, pb, wa, wb, ha, hb]) => { if (live) setFiles({ key: pairKey, value: { players: { a: pa, b: pb }, wickets: { a: wa, b: wb }, phases: { a: ha, b: hb } } }); })
      .catch((error: unknown) => console.error('Compare teams files failed to load', error));
    return () => { live = false; };
  }, [pairKey, kept]); // eslint-disable-line react-hooks/exhaustive-deps

  function writeUrl(nextFilters: TeamFilters | null, nextMode: Mode): void {
    const params = new URLSearchParams();
    if (ids?.a) params.set('a', ids.a);
    if (ids?.b) params.set('b', ids.b);
    if (nextFilters && nextMode !== 'sum') for (const [k, v] of filtersToParams(nextFilters)) params.set(k, v);
    if (VIEW_PARAM[nextMode]) params.set('view', VIEW_PARAM[nextMode]!);
    const tile = nextMode === mode ? new URLSearchParams(window.location.search).get(TILE_PARAM) : null;
    if (tile && nextMode !== 'sum') params.set(TILE_PARAM, tile);
    window.history.replaceState(null, '', `/compare/teams?${params}`);
  }
  function changeFilters(next: TeamFilters): void { const clean = data ? normaliseFilters(union, next, data.a.info.national) ?? next : next; setFilters(clean); writeUrl(clean, mode); }
  function show(next: Mode): void {
    if (next === mode || !data || !filters) return;
    setInstant(false);
    // Between the two views the row slides the way the team page's views do.
    const dir = mode !== 'sum' && next !== 'sum' ? (VIEW_ORDER[next] > VIEW_ORDER[mode] ? 1 : -1) : undefined;
    leaveAsLayer(activePane(), dir, next === 'sum');
    if (dir !== undefined && next !== 'sum' && kept.includes(next)) enterKept.current = dir;
    if (next === 'sum') { setKept([]); frozen.current = {}; clearRemembered(); } else setKept((was) => (mode === 'sum' ? [next] : was.includes(next) ? was : [...was, next]));
    setMode(next);
    writeUrl(filters, next);
  }
  useLayoutEffect(() => {
    const dir = enterKept.current;
    enterKept.current = null;
    if (dir === null || mode === 'sum') return;
    playKept(activePane(), dir);
  }, [mode]);

  const ctx = useMemo<TeamCtx | null>(() => {
    if (!data || !filters) return null;
    return {
      a: scopeOf(data.a, filters), b: scopeOf(data.b, filters), between: scopeOf(data.a, filters, data.b.info.id), filters, genderA: data.a.info.gender,
      files: files && files.key === pairKey ? files.value : null, canClear: filters.competition !== null || filters.season !== null,
      onClear: () => changeFilters({ ...filters, competition: null, season: null }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filters, files, pairKey]);
  const overall = useMemo(() => (ctx ? teamOverallTiles(ctx) : null), [ctx]);
  const versus = useMemo(() => (ctx ? teamVersusTiles(ctx) : null), [ctx]);
  const SUMMARY: Record<ViewMode, string> = {
    ov: `Like with like, for the competitions both teams play. Click a stop to jump to it.`,
    vs: 'Only matches between the two teams. Click a stop to jump to it.',
  };
  const viewOf = (m: ViewMode): ReactNode => {
    const tiles = m === 'ov' ? overall : versus;
    return tiles ? <TileCarousel key={`${m}|${pairKey}`} name={VIEW_NAME[m]} note="" summary={SUMMARY[m]} tiles={tiles} resetKey={pairKey} instant={false} /> : <div className="thin">Loading the comparison</div>;
  };

  // The page shows "Setting the field" until it knows what the address asks for, and on a refresh on a view until that view's tiles are ready.
  const opening = ids === null || (instant && (pending !== null || (mode !== 'sum' && !(mode === 'ov' ? overall : versus))));
  if (opening) return active ? <PageLoader /> : <span hidden data-idle="teams" />;

  // The two teams' own colours (two sides too alike take the second colour of the second team).
  const sides = sideColours(data?.a.info.name ?? null, data?.b.info.name ?? null);
  return (
    <SideColours a={sides.a} b={sides.b}>
    <div className="pgx cpt">
      <div className={`app ${mode === 'sum' ? 'state-sum' : `state-ana view-${mode}`}${instant ? ' instant' : ''}`} data-up="2">
        <NavBar />
        <section className="sum">
          <img className="wm" src="/brand/icons/icon-C-leather-on-dark.svg" alt="" />
          <div className="sumin">
            <div className="pickbody">
            <div className="cmph">
              <h1>Compare teams <Link className="lnk2" href="/compare/players" onClick={onSwitch ? (e) => { e.preventDefault(); onSwitch(); } : undefined}>Compare players instead</Link></h1>
              <div className="cmpc" style={{ ['--tall' as string]: `${156 + tableH}px` }}>
                {slotView('a')}
                <div className="vsb"><span>v</span>{ids?.a && ids.b && !change ? <Link className="swap" href={address({ a: ids.b, b: ids.a })} scroll={false} onClick={(e) => { e.preventDefault(); go({ a: ids.b, b: ids.a }); }} title="Swap the two teams">Swap</Link> : null}
                  {(ids?.a || ids?.b) && <button type="button" className="swap clearsel" onClick={() => go({ a: null, b: null })} title="Clear both teams and start again">Clear</button>}
                </div>
                {slotView('b')}
              </div>

            </div>
            <Reveal on={Boolean(ids?.a && ids.b) && change === null} className="tablewrap">
            {A && B && (rows === null || rows.length > 0) && (
              <div id="ptabs"><div className="in tt" ref={(el) => { (tableCard as { current: HTMLDivElement | null }).current = el; measureTable(el); }} style={rows === null ? { minHeight: 150, boxSizing: 'border-box' } : undefined}><h5 className="sh0">Competitions both teams play</h5>
                {rows && <div className="hwrap"><table className="hft">
                  <thead>
                    <tr><th className="l" rowSpan={2}>Competition</th>{([['a', A], ['b', B]] as const).map(([slot, t]) => <th key={slot} colSpan={3} className="pg">{t.name}</th>)}</tr>
                    <tr>{(['a', 'b'] as const).map((slot) => <Fragment key={slot}><th>Matches</th><th>Won</th><th>Win rate</th></Fragment>)}</tr>
                  </thead>
                  <tbody>{rows.map((r) => <tr key={r.label}><td className="l"><b>{r.label}</b></td>{([r.a, r.b] as const).map((c, i) => <Fragment key={i}><td className="g">{int(c.played)}</td><td>{int(c.won)}</td><td>{pct(c.rate)}</td></Fragment>)}</tr>)}</tbody>
                </table></div>}
              </div></div>
            )}
            {rows && rows.length === 0 && <p className="hint">These two teams have no competition in common.</p>}
            </Reveal>
            <Reveal on={Boolean(ids?.a && ids.b)} className="btnwrap">
            <div className="btns2">
              <button type="button" className="btn p" aria-busy={!filters} onClick={() => show('ov')}>Overall</button><button type="button" className="btn s" aria-busy={!filters} onClick={() => show('vs')}>Versus each other</button>
            </div>
            </Reveal>
            <Reveal on={!(ids?.a && ids.b)}><span className="hint">{ids?.a || ids?.b ? 'Pick a second team to open the comparison.' : 'Pick two teams to open the comparison.'}</span></Reveal>
            </div>
          </div>
          <p className="credit"><SiteCredit /></p>
        </section>
        <p className="vcredit"><SiteCredit /></p>
        {data && filters && (
          <div className="top">
            {phone ? (
              <>
                <button type="button" className="pback" aria-label="Back to the two teams" onClick={() => show('sum')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
                <div className="pwho">
                  <span className="pwt"><b>{data.a.info.name} <i>v</i> {data.b.info.name}</b><span className="pscope">{[FORMAT_NAME[filters.format], competitionOptions(union, filters.format).find((o) => o.key === filters.competition)?.name ?? 'All competitions', filters.season ?? 'All time'].join(', ')}</span></span>
                </div>
                <button type="button" className="pfilt" aria-expanded={sheet} onClick={() => setSheet(true)}>Filters{(data.a.info.national && filters.competition ? 1 : 0) + (filters.season ? 1 : 0) > 0 ? <b>{(data.a.info.national && filters.competition ? 1 : 0) + (filters.season ? 1 : 0)}</b> : null}</button>
              </>
            ) : (
              <>
                <StripBrand />
                <div className="who"><div className="one"><span className="tem"><TeamEmblem team={data.a.info.name} size={24} /></span><b>{data.a.info.name}</b> <span>v</span> <span className="tem"><TeamEmblem team={data.b.info.name} size={24} /></span><b>{data.b.info.name}</b></div></div>
                <TeamFilterBar ms={union} filters={filters} national={data.a.info.national} noIntl={false} onChange={changeFilters} />
              </>
            )}
            <div className="trt">
              <span className="sw" id="vsw">{(['ov', 'vs'] as const).map((m) => <button key={m} type="button" className={mode === m ? 'on' : undefined} onClick={() => show(m)}>{VIEW_NAME[m]}</button>)}</span>
              <button type="button" className="mini" onClick={() => show('sum')} title="Back to the two teams. Change either one there.">Change teams</button>
            </div>
          </div>
        )}
        {phone && data && filters && (
          <div className={`fsheet${sheet ? ' open' : ''}`} role="dialog" aria-label="Filters" aria-hidden={!sheet}>
            <div className="fsh">
              <b>Filters</b>
              {(filters.competition !== null || filters.season !== null) && <button type="button" className="mini" onClick={() => changeFilters({ ...filters, competition: data.a.info.national ? null : filters.competition, season: null })}>Clear</button>}
            </div>
            <TeamFilterBar ms={union} filters={filters} national={data.a.info.national} noIntl={false} onChange={changeFilters} />
            <button type="button" className="fsd" onClick={() => setSheet(false)}>Done</button>
          </div>
        )}
        {(['ov', 'vs'] as const).map((m) => {
          if (!kept.includes(m)) return null;
          if (mode === m) frozen.current[m] = viewOf(m);
          return <section key={m} className={`pane${mode === m ? '' : ' held'}`} id={`p-${m}`}>{frozen.current[m] ?? viewOf(m)}</section>;
        })}
      </div>
    </div>
    </SideColours>
  );
}
