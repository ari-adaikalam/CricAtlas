'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Watermark } from './BrandArt';
import { listenAddress } from './addressEvents';
import { fetchTournament, fetchTournamentIndex, fetchTournamentPlayers, isTournamentKey, prefetchTournamentLater, type TournamentBundle, type TournamentPlayers } from '@/data/tournamentData';
import {
  applyFilters, defaultFilters, describe, editionResults, filtersFromParams, filtersToParams, indexInnings, stageOptions, initialsOf, monthYear, normaliseFilters, formatsOf, editionLabel,
  type TFilters, type TournamentInfo,
} from '@/domain/tournament';
import { tournamentSlug } from '@/domain/slug';
import { playerAgg, splitRows, type Split, type SplitTile } from '@/domain/tournamentPlayers';
import { teamAbbreviation } from '@/domain/profile';
import { MorphText } from './MorphText';
import { useFitRows } from './useFitRows';
import { NavBar, StripBrand } from './Nav';
import { usePhone } from './usePhone';
import { TeamName, type Loaded } from './team/teamUi';
import { TileCarousel, TILE_PARAM, type TileDef } from './TileCarousel';
import { ErrorState, NotFoundState, PageLoader } from './states/PageStates';
import { activePane, clearRemembered, leaveAsLayer, playKept } from './viewMorph';
import { TournamentFilterBar, TournamentScopeBar } from './tournament/TournamentFilterBar';
import { TournamentSearchBox } from './tournament/TournamentSearchBox';
import { overviewTiles } from './tournament/OverviewTiles';
import { playersTiles } from './tournament/PlayersTiles';
import { teamsTiles } from './tournament/TeamsTiles';
import type { Ctx } from './tournament/tournamentUi';
import '@/styles/player.css';
import '@/styles/tournament.css';
import { SiteCredit } from '@/components/SiteCredit';
import { useSmoothHeight } from './ProfileTable';

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; bundle: TournamentBundle; info: TournamentInfo };
type Mode = 'sum' | 'ov' | 'ply' | 'tm';
type ViewMode = Exclude<Mode, 'sum'>;
const VIEW_PARAM: Record<Mode, string | null> = { sum: null, ov: 'overview', ply: 'players', tm: 'teams' };
const FROM_PARAM: Record<string, Mode> = { overview: 'ov', players: 'ply', teams: 'tm' };
const VIEW_ORDER: Record<Mode, number> = { sum: 0, ov: 1, ply: 2, tm: 3 };
const VIEW_NAME: Record<ViewMode, string> = { ov: 'Overview', ply: 'Players', tm: 'Teams and matches' };

export function TournamentView({ slug: firstSlug }: { slug: string }) {
  const [slug, setSlug] = useState(firstSlug);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [filters, setFilters] = useState<TFilters | null>(null);
  const [mode, setMode] = useState<Mode>('sum');
  const [attempt, setAttempt] = useState(0);
  const [changing, setChanging] = useState(false);
  const [changingTop, setChangingTop] = useState(false);
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
  const first = useRef(true);
  const switching = useRef(false);
  const [kept, setKept] = useState<readonly ViewMode[]>([]);
  const frozen = useRef<Partial<Record<ViewMode, ReactNode>>>({});
  const enterKept = useRef<1 | -1 | null>(null);
  const [query, setQuery] = useState('');
  const [splits, setSplits] = useState<Record<SplitTile, Split>>({ runs: 'all', wkts: 'all', best: 'all', rate: 'all' });
  const [players, setPlayers] = useState<Loaded<TournamentPlayers>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTournament(slug), fetchTournamentIndex()])
      .then(([bundle, index]) => {
        if (cancelled) return;
        const info = index.find((t) => tournamentSlug(t.key) === slug);
        if (!bundle || !info) { setLoad({ status: 'missing' }); return; }
        if (switching.current && !first.current) { switching.current = false; if (mode !== 'sum') leaveAsLayer(activePane(), undefined, false, true); }
        const params = new URLSearchParams(window.location.search);
        const base = defaultFilters(bundle.matches);
        const normalised = base ? normaliseFilters(bundle.matches, { ...base, ...filtersFromParams(params) }) : null;
        setLoad({ status: 'ready', bundle, info });
        setFilters(normalised);
        if (first.current) {
          first.current = false;
          const startMode = FROM_PARAM[params.get('view') ?? ''] ?? 'sum';
          setMode(startMode);
          setKept(startMode === 'sum' ? [] : [startMode]);
        }
        prefetchTournamentLater(slug);
      })
      .catch((error: unknown) => { console.error('Tournament data failed to load', slug, error); if (!cancelled) setLoad({ status: 'error' }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, attempt]);

  useEffect(() => {
    if (load.status !== 'ready') return;
    let live = true;
    setPlayers({ status: 'loading' });
    fetchTournamentPlayers(slug).then((data) => { if (live) setPlayers({ status: 'ready', data }); }).catch((error: unknown) => { console.error('Tournament players failed to load', slug, error); if (live) setPlayers({ status: 'error' }); });
    return () => { live = false; };
  }, [load.status === 'ready' ? slug : null]); // eslint-disable-line react-hooks/exhaustive-deps

  // The browser's Back and Forward return to the tournament in the address, in place.
  useEffect(() => {
    const onPop = () => {
      const s = window.location.pathname.split('/').filter(Boolean).pop() ?? '';
      if (isTournamentKey(s) && s !== slug) setSlug(s);
      setMode(FROM_PARAM[new URLSearchParams(window.location.search).get('view') ?? ''] ?? 'sum');
    };
    return listenAddress(onPop);
  }, [slug]);

  useLayoutEffect(() => {
    const dir = enterKept.current;
    enterKept.current = null;
    if (dir === null || mode === 'sum') return;
    const pane = activePane();
    playKept(pane, dir);
    const car = pane?.querySelector<HTMLElement>('.car');
    const tile = car?.getAttribute('data-first');
    const url = new URL(window.location.href);
    if (tile && car && car.scrollLeft > 8) url.searchParams.set(TILE_PARAM, tile); else url.searchParams.delete(TILE_PARAM);
    window.history.replaceState(null, '', url);
  }, [mode]);

  useLayoutEffect(() => {
    if (load.status !== 'ready') return;
    document.body.classList.add('has-app');
    return () => document.body.classList.remove('has-app');
  }, [load.status]);

  useEffect(() => { if (load.status === 'ready') document.title = `${load.info.name} | CricAtlas`; }, [load]);

  const ready = load.status === 'ready' ? load : null;
  const all = useMemo(() => ready?.bundle.matches ?? [], [ready]);
  const innings = useMemo(() => indexInnings(ready?.bundle.innings ?? []), [ready]);
  const scope = useMemo(() => (filters ? applyFilters(all, filters) : []), [all, filters]);
  const inFormat = useMemo(() => (filters ? all.filter((m) => m.format === filters.format) : []), [all, filters?.format]); // eslint-disable-line react-hooks/exhaustive-deps
  const names = useMemo(() => {
    const out = new Map<string, string>();
    for (const m of [...all].sort((a, b) => a.date.localeCompare(b.date))) { out.set(m.team1Id, m.team1); out.set(m.team2Id, m.team2); }
    return out;
  }, [all]);
  const results = useMemo(() => editionResults(inFormat), [inFormat]);
  // The profile's table takes the height it is given, its rows sharing it, as the player page's does.
  const glanceFit = useFitRows<HTMLDivElement>(`${slug}:${results.length}`);
  // Another tournament has more or fewer editions: the card eases to its new height instead of jumping (the player page's table does the same).
  const glanceCard = useSmoothHeight();
  const aggs = useMemo(() => {
    if (players.status !== 'ready') return null;
    const { bat, bowl } = players.data;
    return { all: playerAgg(bat, bowl, scope), first: playerAgg(splitRows(bat, 'first'), splitRows(bowl, 'first'), scope), chase: playerAgg(splitRows(bat, 'chase'), splitRows(bowl, 'chase'), scope) };
  }, [players, scope]);

  function writeUrl(next: TFilters | null, nextMode: Mode): void {
    const params = next ? filtersToParams(next) : new URLSearchParams();
    const tile = nextMode === mode ? new URLSearchParams(window.location.search).get(TILE_PARAM) : null;
    if (tile && nextMode !== 'sum') params.set(TILE_PARAM, tile);
    if (VIEW_PARAM[nextMode]) params.set('view', VIEW_PARAM[nextMode]!);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  }
  function change(next: TFilters): void {
    const clean = normaliseFilters(all, next) ?? next;
    setFilters(clean); writeUrl(clean, mode);
  }

  function show(next: Mode): void {
    if (next === mode || !ready || !filters) return;
    const dir = mode !== 'sum' && next !== 'sum' ? (VIEW_ORDER[next] > VIEW_ORDER[mode] ? 1 : -1) : undefined;
    leaveAsLayer(activePane(), dir, next === 'sum');
    if (dir !== undefined && next !== 'sum' && kept.includes(next)) enterKept.current = dir;
    // Going to the profile drops the views that were kept, so they open fresh next time.
    if (next === 'sum') { setKept([]); clearRemembered(); setQuery(''); setSplits({ runs: 'all', wkts: 'all', best: 'all', rate: 'all' }); } else setKept((was) => (mode === 'sum' ? [next] : was.includes(next) ? was : [...was, next]));
    setMode(next);
    const params = filtersToParams(filters);
    if (VIEW_PARAM[next]) params.set('view', VIEW_PARAM[next]!);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  }

  // Change tournament: the address changes without a navigation and the page stays on its view. The old tournament stays until the new one's file has arrived.
  function switchTournament(hit: TournamentInfo): void {
    const next = tournamentSlug(hit.key);
    if (next === slug) return;
    const params = new URLSearchParams();
    const view = VIEW_PARAM[mode];
    if (view) params.set('view', view);
    const tile = new URLSearchParams(window.location.search).get(TILE_PARAM);
    if (tile && mode !== 'sum') params.set(TILE_PARAM, tile);
    const q = params.toString();
    window.history.pushState(null, '', `/tournaments/${next}${q ? `?${q}` : ''}`);
    switching.current = true;
    setKept((was) => was.filter((m) => m === mode));
    clearRemembered();
    setQuery('');
    setSplits({ runs: 'all', wkts: 'all', best: 'all', rate: 'all' });
    setSlug(next);
    setChangingTop(false);
  }

  if (load.status === 'loading') return <PageLoader />;
  if (load.status === 'missing') return <NotFoundState what="tournament" />;
  if (load.status === 'error') return <ErrorState onRetry={() => { setLoad({ status: 'loading' }); setAttempt((n) => n + 1); }} />;
  if (!filters || !ready) return <NotFoundState what="tournament" />;

  const { info } = ready;
  const clearAll = (): void => change({ ...filters, stage: 'all', team: null, venue: null });
  const setCount = [filters.stage !== 'all' ? filters.stage : null, filters.team, filters.venue].filter((v) => v !== null).length;
  const ctx: Ctx = {
    info, format: filters.format, filters, ms: scope, inFormat, innings, results, names, players, agg: aggs?.all ?? null, aggs, splits, onSplit: (tile, split) => setSplits((was) => ({ ...was, [tile]: split })), query, onQuery: setQuery, onClear: clearAll,
    onPickTeam: (id) => change({ ...filters, team: id }), onPickVenue: (venue) => change({ ...filters, venue }),
  };
  const description = describe(info, all);
  const latest = results[0];
  // The latest edition is on the right, as the newest match is on a team's form.
  const champions = results.filter((r) => r.final).slice(0, 5).reverse();
  const glance = results;
  const nameOf = (id: string | null): string => (id ? (names.get(id) ?? id) : '-');

  // Any filter change replays the cards, numbers and rows of the tiles on screen, one rule for every tile (the carousel's reset path, as when another player is chosen on the player page).
  const reset = `${slug}|${filters.format}|${filters.stage}|${filters.edition}|${filters.team}|${filters.venue}`;
  const sets: Record<ViewMode, TileDef[]> = { ov: overviewTiles(ctx), ply: playersTiles(ctx), tm: teamsTiles(ctx) };
  const NAMES: Record<ViewMode, string> = { ov: 'Overview', ply: 'Players', tm: 'Teams and matches' };
  const views = Object.fromEntries((['ov', 'ply', 'tm'] as const).map((m) => [m, (
    <TileCarousel key={slug} name={NAMES[m]} note="" summary="The filters above apply to every tile. Click a stop to jump to it." tiles={sets[m]} resetKey={reset} replayMs={1800} instant={false} />
  )])) as Record<ViewMode, ReactNode>;
  const viewOf = (m: ViewMode): ReactNode => (
    <>
      {!phone && <TournamentScopeBar ms={all.filter((x) => x.format === filters.format)} filters={filters} count={scope.length} onChange={change} />}
      {views[m]}
    </>
  );
  const formats = formatsOf(all);

  return (
    <div className="pgx tgx tog">
      <div className={`app ${mode === 'sum' ? 'state-sum' : `state-ana view-${mode}`}`} data-up="2">
        <NavBar />
        <section className="sum">
          <Watermark />
          <div className="sumin">
            <div className="phead tourn-head">
              <div className="photo" aria-hidden="true">{initialsOf(info.name)}</div>
              <div className="pid">
                <div className="nrow">
                  <MorphText as="h1" text={info.name} nowrap />
                  <div className="chg">
                    {phone
                      ? (changing ? null : <button type="button" className="pmb chgb" aria-label="Change tournament" title="Change tournament" onClick={() => setChanging(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4" /></svg></button>)
                      : <button type="button" className="mini" style={changing ? { visibility: 'hidden' } : undefined} onClick={() => setChanging(true)}>Change tournament</button>}
                    {changing && <TournamentSearchBox autoFocus onDone={() => setChanging(false)} onPick={switchTournament} />}
                  </div>
                </div>
                <MorphText as="div" className="g" text={description} />
                <div className="pawd"><b>{all.length.toLocaleString('en')}</b> matches in the data</div>
              </div>
              <div className="fwrap">
                <div className="ih"><h2>Champions</h2><span className="ov">latest editions</span></div>
                <div className="form">
                  {champions.map((r) => (
                    <div className="fb" key={r.edition}>
                      <i className="tfb hi" title={`${r.label} champion`} style={r.label.length > 4 ? { fontSize: 12.5, maxWidth: 64 } : { maxWidth: 64 }}>{r.label}</i>
                      {r.championId ? <span title={nameOf(r.championId)}>{teamAbbreviation(nameOf(r.championId))}</span> : <span>-</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div id="ptabs">
              <div className="in tt" ref={glanceCard}>
                <h5 className="sh0">Editions at a glance{formats.length > 1 ? `, ${filters.format === 'T20' ? 'T20s' : filters.format === 'ODI' ? 'ODIs' : filters.format === 'TEST' ? 'Tests' : 'The Hundred'}` : ''}</h5>
                <div className="tsc" ref={glanceFit}>
                  <table className="cmp2 ct">
                    <thead><tr>{['Edition', 'Champion', 'Runner-up', 'Final', 'Matches'].map((h, i) => <th key={h} style={i < 3 ? { textAlign: 'left' } : undefined}>{h}</th>)}</tr></thead>
                    <tbody>
                      {glance.map((r) => (
                        <tr key={r.edition}>
                          <td style={{ textAlign: 'left' }}>{r.label}</td>
                          <td style={{ textAlign: 'left' }}>{r.championId ? <TeamName id={r.championId} name={nameOf(r.championId)} size={16} /> : '-'}</td>
                          <td style={{ textAlign: 'left' }}>{r.runnerUpId ? <TeamName id={r.runnerUpId} name={nameOf(r.runnerUpId)} size={16} /> : '-'}</td>
                          <td>{r.final ? monthYear(r.final.date) : '-'}</td>
                          <td>{r.matches}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="btns">
              <button type="button" className="btn p" onClick={() => show('ov')}>Overview</button>
              <button type="button" className="btn s" onClick={() => show('ply')}>Players</button>
              <button type="button" className="btn s" onClick={() => show('tm')}>Teams and matches</button>
            </div>
          </div>
          <p className="credit"><SiteCredit /></p>
        </section>
        <p className="vcredit"><SiteCredit /></p>
        <div className="top">
          {!phone && <StripBrand />}
          {phone ? (
            <>
              <button type="button" className="pback" aria-label="Back to the summary" onClick={() => show('sum')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
              <div className="pwho">
                <span className="photo" aria-hidden="true">{initialsOf(info.name)}</span>
                <span className="pwt"><b>{info.name}</b><span className="pscope">{[filters.edition ? editionLabel(filters.edition) : 'All editions', filters.stage === 'all' ? 'All stages' : (stageOptions(all, filters.format, filters.edition).find((o) => o.value === filters.stage)?.label ?? filters.stage)].join(', ')}</span></span>
              </div>
              <button type="button" className="pfilt" aria-expanded={sheet} onClick={() => setSheet(true)}>Filters{setCount > 0 ? <b>{setCount}</b> : null}</button>
              <div className="pmore"><button type="button" className="pmb chgb" aria-label="Change tournament" title="Change tournament" onClick={() => setChangingTop(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4" /></svg></button></div>
              {changingTop && <div className="chg tchg open"><TournamentSearchBox autoFocus onDone={() => setChangingTop(false)} onPick={switchTournament} /></div>}
            </>
          ) : (
            <>
              <div className="who">
                <div className="one"><b>{info.name}</b>{latest && <> <span>|</span> {results.length} {results.length === 1 ? 'edition' : 'editions'}{latest.championId && <> <span>|</span> <em title={nameOf(latest.championId)}>{editionLabel(latest.edition)}: {teamAbbreviation(nameOf(latest.championId))}</em></>}</>}</div>
                <div className={`chg tchg${changingTop ? ' open' : ''}`}>
                  <button type="button" className="mini" onClick={() => setChangingTop(true)}>Change tournament</button>
                  {changingTop && <TournamentSearchBox autoFocus onDone={() => setChangingTop(false)} onPick={switchTournament} />}
                </div>
              </div>
              <TournamentFilterBar ms={all} filters={filters} onChange={change} />
            </>
          )}
          <div className="trt">
            <span className="sw" id="vsw">
              {(['ov', 'ply', 'tm'] as const).map((m) => <button key={m} type="button" className={mode === m ? 'on' : undefined} onClick={() => show(m)}>{VIEW_NAME[m]}</button>)}
            </span>
            <button type="button" className="mini" onClick={() => show('sum')}>Summary</button>
          </div>
        </div>
        {(['ov', 'ply', 'tm'] as const).map((m) => {
          if (!kept.includes(m)) return null;
          if (mode === m) frozen.current[m] = viewOf(m);
          return <section key={m} className={`pane${mode === m ? '' : ' held'}`} id={`p-${m}`}>{frozen.current[m] ?? viewOf(m)}</section>;
        })}
        {phone && (
          <div className={`fsheet${sheet ? ' open' : ''}`} role="dialog" aria-label="Filters" aria-hidden={!sheet}>
            <div className="fsh">
              <b>Filters</b>
              {setCount > 0 && <button type="button" className="mini" onClick={clearAll}>Clear</button>}
            </div>
            <TournamentFilterBar ms={all} filters={filters} onChange={change} />
            <div className="fslot"><TournamentScopeBar ms={all.filter((x) => x.format === filters.format)} filters={filters} count={scope.length} onChange={change} /></div>
            <button type="button" className="fsd" onClick={() => setSheet(false)}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
