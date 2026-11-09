'use client';

import { PrefetchLink as Link } from '@/components/PrefetchLink';
import { Watermark } from './BrandArt';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchProfile, warmPhoto, type ProfileBundle } from '@/data/profileData';
import { PLAYER_ID } from '@/data/player';
import { searchPlayers } from '@/data/search';
import { cardStats, compareDefaultFilters, formatRows, roleTag, suggestOrder, type FormatCell } from '@/domain/compare';
import type { YearMeasure } from '@/domain/compareStats';
import { competitionOptions, filtersFromParams, filtersToParams, normaliseFilters, type PlayerFilters } from '@/domain/filters';
import { formatLabel } from '@/domain/labels';
import { playerLine, type PlayerHit, type SearchGender } from '@/domain/search';
import { CountedText } from './charts/CountedText';
import { CompareFace } from './CompareFace';
import { MorphText } from './MorphText';
import { useSmoothHeight } from './ProfileTable';
import { FilterBar } from './FilterBar';
import { NavBar, StripBrand } from './Nav';
import { usePhone } from './usePhone';
import { PageLoader } from './states/PageStates';
import { TileCarousel, TILE_PARAM } from './TileCarousel';
import { activePane, clearRemembered, leaveAsLayer, playKept } from './viewMorph';
import { overallTiles } from './compare/OverallTiles';
import { GOLD, PickChips, Reveal, SideColours, SKY, useTableHeight } from './compare/compareUi';
import { sideColours } from '@/domain/colours';
import { useScopes } from './compare/useScopes';
import { useDuels } from './compare/useDuels';
import { versusTiles } from './compare/VersusTiles';
import '@/styles/player.css';
import '@/styles/compare.css';
import '@/styles/comparefaces.css';
import '@/styles/compareextra.css';
import { SiteCredit } from '@/components/SiteCredit';

const int = (n: number): string => n.toLocaleString('en');
type Slot = 'a' | 'b';
interface Ids { a: string | null; b: string | null }
type Mode = 'sum' | 'ov' | 'vs';
type ViewMode = Exclude<Mode, 'sum'>;
const VIEW_ORDER: Record<Mode, number> = { sum: 0, ov: 1, vs: 2 };
const VIEW_PARAM: Record<Mode, string | null> = { sum: null, ov: 'overall', vs: 'versus' };
const VIEW_NAME: Record<ViewMode, string> = { ov: 'Overall', vs: 'Versus each other' };

const address = (ids: Ids): string => {
  const p = new URLSearchParams();
  if (ids.a) p.set('a', ids.a);
  if (ids.b) p.set('b', ids.b);
  const q = p.toString();
  return `/compare/players${q ? `?${q}` : ''}`;
};

/**
 * The Compare players pick screen: two cards, gold for the first player and sky for the second, with the player's facts and four numbers, a
 * Change player button, Swap between them, and the Career by format table. A slot with no player is a search box with suggestions (the same role as the other player first). "Compare this player" opens the
 * page with that player in the first slot (`?a=`). The tiles of the comparison follow in the next stages.
 */
export function ComparePlayersView({ active = true, onSwitch }: { active?: boolean; onSwitch?: () => void } = {}) {
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
  const [bundles, setBundles] = useState<Record<string, ProfileBundle | null>>({});
  const [change, setChange] = useState<Slot | null>(null);
  // An address can name a player that is not in the data: that slot opens empty with a line saying so, until a player is picked there.
  const [lost, setLost] = useState<Record<Slot, boolean>>({ a: false, b: false });
  // What was typed and found for each slot: each search box has its own text and its own suggestions.
  const [texts, setTexts] = useState<Record<Slot, string>>({ a: '', b: '' });
  const [hitsBy, setHitsBy] = useState<Record<Slot, PlayerHit[] | null>>({ a: null, b: null });
  const setText = (slot: Slot, value: string): void => setTexts((was) => ({ ...was, [slot]: value }));
  const setHits = (slot: Slot, value: PlayerHit[] | null): void => setHitsBy((was) => ({ ...was, [slot]: value }));
  // Each slot's chips (all, men or women) and its search box.
  const [genders, setGenders] = useState<Record<Slot, SearchGender>>({ a: 'all', b: 'all' });
  const inputs = useRef<Record<Slot, HTMLInputElement | null>>({ a: null, b: null });
  const [mode, setMode] = useState<Mode>('sum');
  const [filters, setFilters] = useState<PlayerFilters | null>(null);
  const [measure, setMeasure] = useState<YearMeasure>('Runs');
  const [kept, setKept] = useState<readonly ViewMode[]>([]);
  // A page opened (or refreshed) on a view starts in that view's frame while the two players load, so the pick screen does not flash first.
  const [pending, setPending] = useState<ViewMode | null>(null);
  // On such a refresh the frame is in its final state at once (no sliding of the pick screen or the top bar), until the first thing the viewer does.
  const [instant, setInstant] = useState(false);
  // The card of a slot keeps its last player while the next one loads, so a change of player morphs the card in place and never shows an empty one. `leaving` keeps the search layer on screen while it fades out.
  const shownRef = useRef<Record<Slot, ProfileBundle | null>>({ a: null, b: null });
  const [leaving, setLeaving] = useState<Slot | null>(null);
  const tableCard = useSmoothHeight();
  const [tableH, measureTable] = useTableHeight();
  const frozen = useRef<Partial<Record<ViewMode, ReactNode>>>({});
  const enterKept = useRef<1 | -1 | null>(null);
  const wanted = useRef<{ view: string | null; filters: Partial<PlayerFilters> }>({ view: null, filters: {} });

  useLayoutEffect(() => { document.body.classList.add('has-app'); return () => document.body.classList.remove('has-app'); }, []);
  // Read in a layout effect so the first drawn frame already knows which screen the address asks for.
  useLayoutEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const ok = (v: string | null): string | null => (v && PLAYER_ID.test(v) ? v : null);
    const a = ok(p.get('a')), b = ok(p.get('b'));
    wanted.current = { view: p.get('view'), filters: filtersFromParams(p) };
    setIds({ a, b: b !== a ? b : null });
    setLost(active ? { a: Boolean(p.get('a')) && !a, b: Boolean(p.get('b')) && !b } : { a: false, b: false });
    const view = p.get('view');
    if (a && b && a !== b && (view === 'overall' || view === 'versus')) { setPending(view === 'overall' ? 'ov' : 'vs'); setInstant(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, []);
  useEffect(() => {
    if (!ids) return;
    for (const id of [ids.a, ids.b]) {
      if (!id || id in bundles) continue;
      fetchProfile(id).then((bundle) => { warmPhoto(bundle?.player['image url']); return bundle; }).then((bundle) => { setBundles((was) => ({ ...was, [id]: bundle })); }).catch(() => setBundles((was) => ({ ...was, [id]: null })));
    }
  }, [ids, bundles]);

  const bundleOf = (id: string | null): ProfileBundle | null => (id ? bundles[id] ?? null : null);
  const A = bundleOf(ids?.a ?? null), B = bundleOf(ids?.b ?? null);
  const openSlot: Slot | null = ids === null ? null : change ?? (!ids.a ? 'a' : !ids.b ? 'b' : null);

  // The suggestions of each slot, one effect for each so that one slot's list is never asked for again because of the other: what was typed in that slot, else the players with most matches. A pick in the
  // other slot only takes that player out of the list (at draw time), so the list does not refresh or reorder.
  const searchable = (slot: Slot): boolean => ids !== null && (openSlot === slot || !ids[slot]);
  for (const slot of ['a', 'b'] as const) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (!searchable(slot)) return;
      const text = texts[slot];
      let alive = true;
      const t = window.setTimeout(() => {
        searchPlayers(text, text ? 20 : 40, genders[slot]).then((found) => {
          if (!alive) return;
          setHits(slot, (text ? found : suggestOrder(found, null)).slice(0, text ? 20 : 30));
        }).catch(() => setHits(slot, []));
      }, text ? 150 : 0);
      return () => { alive = false; window.clearTimeout(t); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [texts[slot], genders[slot], searchable(slot)]);
  }
  // On a phone the keyboard opens only when the viewer taps the search box themselves, never because a slot became the open one.
  useEffect(() => { if (openSlot && !phone) inputs.current[openSlot]?.focus(); }, [openSlot, change, phone]);

  // Picking a player in one slot clears only that slot's search; the other slot keeps what was typed and the list it shows, so it does not refresh.
  const go = (next: Ids, only?: Slot): void => { wanted.current = { view: null, filters: {} }; setPending(null); setInstant(false); setIds(next); setChange(null); setTexts((was) => (only ? { ...was, [only]: '' } : { a: '', b: '' })); if (!only) setHitsBy({ a: null, b: null }); setFilters(null); setMode('sum'); setKept([]); frozen.current = {}; clearRemembered(); window.history.replaceState(null, '', address(next)); };
  // The search layer of a slot that has a player stays mounted while it fades out.
  const closeSearch = (slot: Slot): void => { setLeaving(slot); window.setTimeout(() => setLeaving((now) => (now === slot ? null : now)), 340); };
  const pick = (slot: Slot, id: string): void => {
    closeSearch(slot); setLost((was) => ({ ...was, [slot]: false })); if (!ids) return; go(slot === 'a' ? { a: id, b: ids.b === id ? null : ids.b } : { a: ids.a === id ? null : ids.a, b: id }, slot); };

  const fact = (label: string, value: string | null) => <div key={label} title={`${label}: ${value ?? '-'}`}><span>{label}</span><MorphText as="b" text={value ?? '-'} /></div>;
  const card = (slot: Slot, fresh: ProfileBundle | null) => {
    const colour = slot === 'a' ? GOLD : SKY;
    if (fresh) shownRef.current[slot] = fresh;
    const bundle = fresh ?? shownRef.current[slot];
    if (!bundle) {
      // A player the data does not have stays in their slot as a card that says so, so the layout does not change under the visitor.
      const gone = ids?.[slot] ? bundles[ids[slot]!] === null : false;
      return (
        <div className="pcard" key={slot} style={{ ['--pc' as string]: colour }}>
          <div className="pctop"><div className="pcb"><h2>{gone ? 'Player not found' : 'Loading player'}</h2>{gone && <div className="g">That player is not in the data.</div>}</div></div>
          {gone && <button type="button" className="chg" onClick={() => { setChange(slot); setText(slot, ''); setHits(slot, null); }}>Choose another player</button>}
        </div>
      );
    }
    const p = bundle.player, s = cardStats(bundle.rows);
    const first = p['first international year'], last = p['last international year'];
    const played = first === null ? null : last !== null && last !== first ? `${first} to ${last}` : String(first);
    const line = [p.country, p.gender === 'female' ? 'women' : p.gender === 'male' ? 'men' : null].filter(Boolean).join(', ');
    return (
      <div className="pcard" key={slot} style={{ ['--pc' as string]: colour }}>
        <div className="pctop">
          <CompareFace player={p} size={52} morph />
          <div className="pcb"><MorphText as="h2" text={p.name} nowrap /><div className="g"><MorphText text={line} /> <em className="rch"><MorphText text={roleTag(p['playing role'])} /></em></div></div>
        </div>
        {!phone && <div className="pfacts">{fact('Played', played)}{fact('Role', p['playing role'])}{fact('Batting', p['batting style'])}{fact('Bowling', p['bowling style'])}</div>}
        <div className="pstat">{([['Matches', int(s.matches)], ['Runs', int(s.runs)], ['Average', s.average === null ? '-' : s.average.toFixed(1)], ['Wickets', int(s.wickets)]] as const).map(([l, v]) => <div key={l} title={l === 'Average' ? 'Batting average' : undefined}><b><CountedText text={v} morph /></b><span>{l}</span></div>)}</div>
        <button type="button" className="chg" onClick={() => { setChange(slot); setText(slot, ''); setHits(slot, null); }}>Change player</button>
      </div>
    );
  };

  const suggList = (slot: Slot, id?: string) => (
    <div className="sugg" id={id}>
      {hitsBy[slot] === null ? <div className="thin">Searching</div> : hitsBy[slot]!.filter((h) => h.playerId !== ids?.a && h.playerId !== ids?.b).length === 0 ? <div className="thin">No player matches.</div> : hitsBy[slot]!.filter((h) => h.playerId !== ids?.a && h.playerId !== ids?.b).map((h) => {
        const next: Ids = slot === 'a' ? { a: h.playerId, b: ids?.b ?? null } : { a: ids?.a ?? null, b: h.playerId };
        return (
          <Link key={h.playerId} className="sg" href={address(next)} scroll={false} onClick={(e) => { e.preventDefault(); pick(slot, h.playerId); }}>
            <b>{h.name}</b><span>{playerLine(h)}</span>
          </Link>
        );
      })}
    </div>
  );

  // The search panel of a slot: the title and the search box, the chips, and the suggestions, which fill the panel's height. A slot with no player shows it as the slot itself; a slot with a player shows it as a layer over the card.
  const panel = (slot: Slot, has: boolean) => (
    <div className="pcard add" style={{ ['--pc' as string]: slot === 'a' ? GOLD : SKY }}>
      <div className="pcb">
        <div className="sloth">
          <h2>{has ? 'Choose another player' : 'Add a player'}</h2>
          <input ref={(el) => { inputs.current[slot] = el; }} className="bpq" type="search" value={texts[slot]} placeholder="Search players" aria-label={`Search players for the ${slot === 'a' ? 'first' : 'second'} side`} autoComplete="off" onChange={(e) => setText(slot, e.target.value)} />
        </div>
        <PickChips label="Show" value={genders[slot]} onChange={(next) => setGenders((was) => ({ ...was, [slot]: next }))} options={[['all', 'All'], ['men', 'Men'], ['women', 'Women']]} />
        {lost[slot] && <div className="thin" role="status">That player is not in the data. Choose another.</div>}
        {suggList(slot)}
      </div>
      {has && <button type="button" className="chg" onClick={() => { closeSearch(slot); setChange(null); setText(slot, ''); }}>Cancel</button>}
    </div>
  );

  // What the career table and the cards show: the player of each slot, or the one before while the next loads.
  const dispA = ids?.a ? A ?? shownRef.current.a : null, dispB = ids?.b ? B ?? shownRef.current.b : null;
  const titleA = dispA?.player.name, titleB = dispB?.player.name;
  useEffect(() => { if (active) document.title = `${titleA && titleB ? `${titleA} v ${titleB}` : 'Compare players'} | CricAtlas`; }, [active, titleA, titleB]);
  const rows = useMemo(() => (ids && (dispA || dispB) ? formatRows(dispA?.rows ?? [], dispB?.rows ?? null) : []), [dispA, dispB, ids]);
  // The two players' colours: their country's (two players of one country get its two colours).
  const sides = sideColours(dispA?.player.country ?? null, dispB?.player.country ?? null);
  const people: Array<[Slot, ProfileBundle]> = [];
  if (dispA) people.push(['a', dispA]);
  if (dispB) people.push(['b', dispB]);

  // A slot is as tall as its search needs while it has no player or is being changed, and as tall as its card otherwise; the height eases between the two. A slot with a player holds its card for good and the
  // search is a layer over it that fades in and out. A slot with no player has no card, and its search panel fades out over the new card when a player is picked.
  const slotView = (slot: Slot) => {
    if (ids === null) return null;
    const id = ids[slot], searching = !id || change === slot;
    // Both slots are as tall as the search needs while a player is still to be picked or changed, and as tall as their cards once both are chosen.
    const roomy = !(ids.a && ids.b) || change !== null;
    return (
      <div className={`pslot${roomy ? ' tall' : ''}`} key={`${slot}-s`}>
        {id && card(slot, bundleOf(id))}
        {(searching || leaving === slot) && <div className={`pover${searching ? ' on' : ''}`}>{panel(slot, Boolean(id))}</div>}
      </div>
    );
  };
  const cell = (c: FormatCell | null, key: string) => (c ? <Fragment key={key}><td className="g"><CountedText text={int(c.matches)} morph /></td><td><CountedText text={int(c.runs)} morph /></td><td><CountedText text={int(c.wickets)} morph /></td></Fragment> : <td className="d g" colSpan={3} key={key}>Did not play</td>);
  const both = Boolean(ids?.a && ids.b && A && B);
  const union = useMemo(() => [...(A?.rows ?? []), ...(B?.rows ?? [])], [A, B]);

  // The filters, once both players are loaded: the address, else a competition both have played.
  useEffect(() => {
    if (filters || !both || !A || !B) return;
    const base = compareDefaultFilters(A.rows, B.rows);
    if (!base) { setPending(null); return; }
    const asked = wanted.current.filters;
    const start: PlayerFilters = { format: asked.format ?? base.format, competition: asked.format ? asked.competition ?? null : base.competition, season: asked.season ?? null };
    setFilters(normaliseFilters(union, start) ?? base);
    if (wanted.current.view === 'overall') { setMode('ov'); setKept(['ov']); }
    if (wanted.current.view === 'versus') { setMode('vs'); setKept(['vs']); }
    setPending(null);
    wanted.current = { view: null, filters: {} };
  }, [both, A, B, filters, union]);

  const pairIds = ids?.a && ids.b ? { a: ids.a, b: ids.b } : null;
  const duels = useDuels(both ? pairIds : null, filters, kept.includes('vs'));
  const scopes = useScopes(both ? pairIds : null, both && A && B ? { a: A.rows, b: B.rows } : null, filters);

  function writeUrl(nextFilters: PlayerFilters | null, nextMode: Mode): void {
    const params = new URLSearchParams();
    if (ids?.a) params.set('a', ids.a);
    if (ids?.b) params.set('b', ids.b);
    if (nextFilters && nextMode !== 'sum') for (const [k, v] of filtersToParams(nextFilters)) params.set(k, v);
    if (VIEW_PARAM[nextMode]) params.set('view', VIEW_PARAM[nextMode]!);
    const tile = nextMode === mode ? new URLSearchParams(window.location.search).get(TILE_PARAM) : null;
    if (tile && nextMode !== 'sum') params.set(TILE_PARAM, tile);
    window.history.replaceState(null, '', `/compare/players?${params}`);
  }
  function changeFilters(next: PlayerFilters): void { const clean = normaliseFilters(union, next) ?? next; setFilters(clean); writeUrl(clean, mode); }
  function show(next: Mode): void {
    if (next === mode || !both || !filters) return;
    setInstant(false);
    // Between the two views the row slides the way the team page's views do: towards the later view going forward, back the other way going back.
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

  const nameA = A?.player.name ?? '', nameB = B?.player.name ?? '';
  const ctxOf = () => {
    if (!A || !B || !filters || !scopes.a || !scopes.b || !pairIds) return null;
    const hundred = [...scopes.a.bowl, ...scopes.b.bowl];
    return { perFive: hundred.length > 0 && hundred.every((x) => x.tournament_key === 'hnd'), tests: filters.format === 'TEST', canClear: filters.competition !== null || filters.season !== null, onClear: () => changeFilters({ ...filters, competition: null, season: null }), a: scopes.a, b: scopes.b, filters };
  };
  const overall = useMemo(() => {
    const c = ctxOf();
    return c && pairIds ? overallTiles({ nameA, nameB, idA: pairIds.a, idB: pairIds.b, measure, ...c }, setMeasure) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [A, B, filters, scopes.a, scopes.b, measure, pairIds?.a, pairIds?.b]);
  const versus = useMemo(() => {
    const c = ctxOf();
    return c ? versusTiles({ nameA, nameB, innings: duels?.innings ?? null, shared: duels?.shared ?? [], ...c }) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [A, B, filters, scopes.a, scopes.b, duels, pairIds?.a, pairIds?.b]);
  // One bowler and one batter: the batting numbers of the bowler are few, so the balls between the two come first.
  const mixedRoles = Boolean(dispA && dispB) && (roleTag(dispA!.player['playing role']) === 'Bowler') !== (roleTag(dispB!.player['playing role']) === 'Bowler');

  const SUMMARY: Record<ViewMode, string> = {
    ov: `Like with like: batting against batting, bowling against bowling.${mixedRoles ? ' One of the two is a bowler, so the batting numbers come from few innings and are a thin comparison. Versus each other uses the balls between them.' : ''} Click a stop to jump to it.`,
    vs: 'Only the balls where one of them batted while the other bowled. Click a stop to jump to it.',
  };
  const viewOf = (m: ViewMode): ReactNode => {
    const tiles = m === 'ov' ? overall : versus;
    return tiles
      ? <TileCarousel key={`${m}|${pairIds?.a}|${pairIds?.b}`} name={VIEW_NAME[m]} note="" summary={SUMMARY[m]} tiles={tiles} resetKey={`${pairIds?.a}|${pairIds?.b}`} instant={false} stale={!scopes.fresh || (m === 'vs' && duels !== null && !duels.fresh)} />
      : <div className="thin">Loading the comparison</div>;
  };
  // The page shows "Setting the field" like the other pages until it knows what the address asks for, and on a refresh on a view until that view's tiles are ready, so no half-built frame is drawn.
  const opening = ids === null || (instant && (pending !== null || (mode !== 'sum' && !(mode === 'ov' ? overall : versus))));
  if (opening) return active ? <PageLoader /> : <span hidden data-idle="players" />;

  return (
    <SideColours a={sides.a} b={sides.b}>
    <div className="pgx cpp">
      <div className={`app ${mode === 'sum' && !pending ? 'state-sum' : `state-ana view-${mode === 'sum' ? pending : mode}`}${instant ? ' instant' : ''}`} data-up="2">
        <NavBar />
        <section className="sum">
          <Watermark />
          <div className="sumin">
            <div className="pickbody">
            <div className="cmph">
              <h1>Compare players <Link className="lnk2" href="/compare/teams" onClick={onSwitch ? (e) => { e.preventDefault(); onSwitch(); } : undefined}>Compare teams instead</Link></h1>
              <div className="cmpc" style={{ ['--tall' as string]: `${156 + tableH}px` }}>
                {slotView('a')}
                <div className="vsb"><span>v</span>{ids?.a && ids.b && !change ? <Link className="swap" href={address({ a: ids.b, b: ids.a })} scroll={false} onClick={(e) => { e.preventDefault(); go({ a: ids.b, b: ids.a }); }} title="Swap the two players">Swap</Link> : null}
                  {(ids?.a || ids?.b) && <button type="button" className="swap clearsel" onClick={() => go({ a: null, b: null })} title="Clear both players and start again">Clear</button>}
                </div>
                {slotView('b')}
              </div>
            </div>
            <Reveal on={Boolean(ids?.a && ids.b) && change === null} className="tablewrap">
            {(rows.length > 0 || Boolean(ids?.a && ids.b)) && (
              <div id="ptabs"><div className="in tt" ref={(el) => { (tableCard as { current: HTMLDivElement | null }).current = el; measureTable(el); }} style={rows.length === 0 ? { minHeight: 230, boxSizing: 'border-box' } : undefined}><h5 className="sh0">Career by format</h5>
                {rows.length > 0 && <div className="hwrap"><table className="hft">
                  <thead>
                    <tr><th className="l" rowSpan={2}>Format</th>{people.map(([slot, b]) => <th key={slot} colSpan={3} className="pg"><MorphText text={b.player.name} /></th>)}</tr>
                    <tr>{people.map(([slot]) => <Fragment key={slot}><th>Matches</th><th>Runs</th><th>Wickets</th></Fragment>)}</tr>
                  </thead>
                  <tbody>{rows.map((r) => <tr key={r.label}><td className="l"><b>{r.label}</b></td>{people.map(([slot]) => cell(slot === 'a' ? r.a : r.b, `${r.label}${slot}`))}</tr>)}</tbody>
                </table></div>}
              </div></div>
            )}
            </Reveal>
            <Reveal on={Boolean(ids?.a && ids.b)} className="btnwrap">
            <div className="btns2">
              <button type="button" className={`btn ${mixedRoles ? 's' : 'p'}`} aria-busy={!(both && filters)} onClick={() => show('ov')}>Overall</button><button type="button" className={`btn ${mixedRoles ? 'p' : 's'}`} aria-busy={!(both && filters)} onClick={() => show('vs')}>Versus each other</button>
            </div>
            </Reveal>
            <Reveal on={!(ids?.a && ids.b)}><span className="hint">{ids?.a || ids?.b ? 'Pick a second player to open the comparison.' : 'Pick two players to open the comparison.'}</span></Reveal>
            </div>
          </div>
          <p className="credit"><SiteCredit /></p>
        </section>
        <p className="vcredit"><SiteCredit /></p>
        {both && filters && (
          <div className="top">
            {phone ? (
              <>
                <button type="button" className="pback" aria-label="Back to the two players" onClick={() => show('sum')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
                <div className="pwho">
                  <span className="pwt"><b>{nameA} <i>v</i> {nameB}</b><span className="pscope">{[formatLabel(filters.format), filters.competition ? competitionOptions(union, filters.format).find((o) => o.key === filters.competition)?.name ?? filters.competition : 'All competitions', filters.season ?? 'Career'].join(', ')}</span></span>
                </div>
                <button type="button" className="pfilt" aria-expanded={sheet} onClick={() => setSheet(true)}>Filters{(filters.competition ? 1 : 0) + (filters.season ? 1 : 0) > 0 ? <b>{(filters.competition ? 1 : 0) + (filters.season ? 1 : 0)}</b> : null}</button>
              </>
            ) : (
              <>
                <StripBrand />
                <div className="who"><div className="one"><b>{nameA}</b> <span>v</span> <b>{nameB}</b></div></div>
                <FilterBar rows={union} filters={filters} analysis={false} onChange={changeFilters} />
              </>
            )}
            <div className="trt">
              <span className="sw" id="vsw">{(['ov', 'vs'] as const).map((m) => <button key={m} type="button" className={mode === m ? 'on' : undefined} onClick={() => show(m)}>{VIEW_NAME[m]}</button>)}</span>
              <button type="button" className="mini" onClick={() => show('sum')} title="Back to the two players. Change either one there.">Change players</button>
            </div>
          </div>
        )}
        {phone && both && filters && (
          <div className={`fsheet${sheet ? ' open' : ''}`} role="dialog" aria-label="Filters" aria-hidden={!sheet}>
            <div className="fsh">
              <b>Filters</b>
              {(filters.competition !== null || filters.season !== null) && <button type="button" className="mini" onClick={() => changeFilters({ ...filters, competition: null, season: null })}>Clear</button>}
            </div>
            <FilterBar rows={union} filters={filters} analysis={false} onChange={changeFilters} />
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
