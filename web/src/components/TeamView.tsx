'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Watermark } from './BrandArt';
import { listenAddress } from './addressEvents';
import { fetchPhaseAverages, fetchPhases, fetchPlayers, fetchReviews, fetchStyles, fetchTeam, fetchWickets, isTeamSlug, prefetchTeamLater, type TeamBundle } from '@/data/teamData';
import { FORMAT_NAME } from '@/domain/filters';
import {
  applyFilters, counts, filtersFromParams, filtersToParams, forBatBowl, formatOptions, indexInnings, inFormat, marginText, normaliseFilters, sortByDate, competitionOptions,
  type PhaseAverage, type TeamFilters, type TeamInfo, type TeamMatch, type TeamPhaseRow, type TeamPlayerRow, type TeamReviewRow, type TeamStyleRow, type TeamWicketRow,
} from '@/domain/team';
import { teamSlug } from '@/domain/slug';
import { teamAbbreviation } from '@/domain/profile';
import type { TeamHit } from '@/domain/teamSearch';
import { MorphText } from './MorphText';
import { NavBar, StripBrand } from './Nav';
import { TeamEmblem } from './TeamEmblem';
import { TileCarousel, TILE_PARAM, type TileDef } from './TileCarousel';
import { ErrorState, NotFoundState, PageLoader } from './states/PageStates';
import { activePane, clearRemembered, leaveAsLayer, playKept } from './viewMorph';
import { TeamFilterBar, TeamScopeBar } from './team/TeamFilterBar';
import { TeamSearchBox } from './team/TeamSearchBox';
import { BatChaseBody, FormBody, KeyBody, MatchesBody, OpponentsBody, SeasonBody, TossBody, TrophiesKnockoutsBody, type Ctx } from './team/ResultsTiles';
import { SquadBody, TopBody, UsedBody } from './team/PlayersTiles';
import { ExtrasBody, FieldingBody, HowBody, PhasesBody, ReviewsBody } from './team/BatBowlTiles';
import { PrefetchLink as Link } from '@/components/PrefetchLink';
import { usePhone } from './usePhone';
import { dateText, Loaded, MatchLink, pct } from './team/teamUi';
import '@/styles/player.css';
import '@/styles/team.css';
import { SiteCredit } from '@/components/SiteCredit';
import { useSmoothHeight } from './ProfileTable';

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; bundle: TeamBundle };
type Mode = 'sum' | 'res' | 'ply' | 'bbf';
type ViewMode = Exclude<Mode, 'sum'>;
const VIEW_PARAM: Record<Mode, string | null> = { sum: null, res: 'results', ply: 'players', bbf: 'batbowl' };
const FROM_PARAM: Record<string, Mode> = { results: 'res', players: 'ply', batbowl: 'bbf' };
const VIEW_ORDER: Record<Mode, number> = { sum: 0, res: 1, ply: 2, bbf: 3 };
const VIEW_NAME: Record<ViewMode, string> = { res: 'Results', ply: 'Players', bbf: 'Bat, bowl, field' };

/** "Men's national team. Test, ODI and T20I matches since 2001 in the data." Built from the matches, so a team's line says what it has. */
function description(info: TeamInfo, ms: readonly TeamMatch[]): string {
  const who = `${info.gender === 'female' ? "Women's" : "Men's"} ${info.national ? 'national team' : 'franchise team'}.`;
  const names = info.national
    ? (['TEST', 'ODI', 'T20I'] as const).filter((f) => ms.some((m) => inFormat(m, f))).map((f) => ({ TEST: 'Test', ODI: 'ODI', T20I: 'T20I' })[f])
    : competitionOptions(ms, 'LEAGUE').filter((o) => o.league).map((o) => o.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
  const span = info.firstYear === info.lastYear ? `in ${info.firstYear}` : `from ${info.firstYear} to ${info.lastYear}`;
  return `${who} ${list ? `${list} matches ${span} in the data.` : `Matches ${span} in the data.`}`;
}

/** The average of the team's innings (or of the other side's) in the matches given, Super Overs left out. */
function averageInnings(ms: readonly TeamMatch[], innings: ReadonlyMap<number, ReadonlyArray<{ side: 'for' | 'against'; runs: number; superOver: boolean }>>, side: 'for' | 'against'): number | null {
  let runs = 0, n = 0;
  for (const m of ms) for (const i of innings.get(m.id) ?? []) if (i.side === side && !i.superOver) { runs += i.runs; n += 1; }
  return n ? runs / n : null;
}

interface FormatRow { label: string; bold: boolean; ms: TeamMatch[] }
/** The rows of the profile's Results by format: International and T20s when they hold two or more formats, each format, and for a league team each league. */
function formatRows(ms: readonly TeamMatch[]): FormatRow[] {
  const options = formatOptions(ms, 'TEST').filter((o) => !o.disabled);
  const rows: FormatRow[] = options.map((o) => ({ label: FORMAT_NAME[o.format], bold: o.format === 'INTERNATIONAL' || o.format === 'T20S', ms: ms.filter((m) => inFormat(m, o.format)) }));
  for (const c of competitionOptions(ms, 'LEAGUE').filter((o) => o.league)) rows.push({ label: c.name, bold: false, ms: ms.filter((m) => m.tk === c.key) });
  return rows;
}

// The profile chips use the player page's three tones: hi is gold, mid is blue, lo is grey.
const FORM_CLASS: Record<string, string> = { won: 'hi', lost: 'mid', nr: 'no', draw: 'lo', tie: 'lo' };
const FORM_TEXT: Record<string, string> = { won: 'W', lost: 'L', nr: 'NR', draw: 'D', tie: 'T' };

export function TeamView({ slug: firstSlug }: { slug: string }) {
  const [slug, setSlug] = useState(firstSlug);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [filters, setFilters] = useState<TeamFilters | null>(null);
  const [mode, setMode] = useState<Mode>('sum');
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const phone = usePhone();
  const [changing, setChanging] = useState(false);
  const [changingTop, setChangingTop] = useState(false);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (!sheet) return;
    const away = (e: PointerEvent): void => { if (!(e.target as Element).closest('.fsheet, .pfilt')) setSheet(false); };
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') setSheet(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [sheet]);
  const [query, setQuery] = useState('');
  const [top, setTop] = useState<'bat' | 'bowl' | 'field'>('bat');
  const first = useRef(true);
  const switching = useRef(false);
  const [kept, setKept] = useState<readonly ViewMode[]>([]);
  const frozen = useRef<Partial<Record<ViewMode, ReactNode>>>({});
  const enterKept = useRef<1 | -1 | null>(null);

  // The files behind the first paint, fetched in the background once the bundle is on screen.
  const [players, setPlayers] = useState<Loaded<TeamPlayerRow[]>>({ status: 'loading' });
  const [phases, setPhases] = useState<Loaded<TeamPhaseRow[]>>({ status: 'loading' });
  const [wickets, setWickets] = useState<Loaded<TeamWicketRow[]>>({ status: 'loading' });
  const [reviews, setReviews] = useState<Loaded<TeamReviewRow[]>>({ status: 'loading' });
  const [styles, setStyles] = useState<Loaded<TeamStyleRow[]>>({ status: 'loading' });
  const [avgs, setAvgs] = useState<Loaded<PhaseAverage[]>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchTeam(slug)
      .then((bundle) => {
        if (cancelled) return;
        if (!bundle) { setLoad({ status: 'missing' }); return; }
        if (switching.current && !first.current) { switching.current = false; if (mode !== 'sum') leaveAsLayer(activePane(), undefined, false, true); }
        const info = { ...bundle.info };
        const params = new URLSearchParams(window.location.search);
        const asked = filtersFromParams(params);
        const start = { format: asked.format ?? 'TEST', competition: asked.competition ?? null, season: asked.season ?? null, opponent: asked.opponent ?? null, venue: asked.venue ?? null } as TeamFilters;
        const normalised = normaliseFilters(bundle.matches, start, info.national);
        setLoad({ status: 'ready', bundle });
        setFilters(normalised);
        if (first.current) {
          first.current = false;
          const startMode = FROM_PARAM[params.get('view') ?? ''] ?? 'sum';
          setMode(startMode);
          setKept(startMode === 'sum' ? [] : [startMode]);
          if (startMode === 'bbf' && normalised) { const out = forBatBowl(bundle.matches, normalised); setFilters(out.filters); if (out.note) setNote(out.note); }
        }
        prefetchTeamLater(slug);
      })
      .catch((error: unknown) => { console.error('Team data failed to load', slug, error); if (!cancelled) setLoad({ status: 'error' }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, attempt]);

  useEffect(() => {
    if (load.status !== 'ready') return;
    let live = true;
    const run = <T,>(get: () => Promise<T>, set: (v: Loaded<T>) => void): void => {
      set({ status: 'loading' });
      get().then((data) => { if (live) set({ status: 'ready', data }); }).catch((error: unknown) => { console.error('Team file failed to load', slug, error); if (live) set({ status: 'error' }); });
    };
    run(() => fetchPlayers(slug), setPlayers);
    run(() => fetchPhases(slug), setPhases);
    run(() => fetchWickets(slug), setWickets);
    run(() => fetchReviews(slug), setReviews);
    run(() => fetchStyles(slug), setStyles);
    run(fetchPhaseAverages, setAvgs);
    return () => { live = false; };
  }, [load.status === 'ready' ? slug : null]); // eslint-disable-line react-hooks/exhaustive-deps

  // The browser's Back and Forward return to the team in the address, in place.
  useEffect(() => {
    const onPop = () => {
      const s = window.location.pathname.split('/').filter(Boolean).pop() ?? '';
      if (isTeamSlug(s) && s !== slug) setSlug(s);
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

  useEffect(() => { if (load.status === 'ready') document.title = `${load.bundle.info.name} | CricAtlas`; }, [load]);
  useEffect(() => { if (!note) return; const t = window.setTimeout(() => setNote(null), 4500); return () => window.clearTimeout(t); }, [note]);

  const ready = load.status === 'ready' ? load.bundle : null;
  const info = ready?.info ?? null;
  // Another team's table has more or fewer rows: the card eases to its new height, and what is under it moves with it, as the player page's does (ProfileTable).
  const tableCard = useSmoothHeight();
  const all = useMemo(() => ready?.matches ?? [], [ready]);
  const innings = useMemo(() => indexInnings(ready?.innings ?? []), [ready]);
  const scope = useMemo(() => (ready && filters ? applyFilters(all, filters, ready.info.national) : []), [ready, all, filters]);
  const noOpp = useMemo(() => (ready && filters ? applyFilters(all, { ...filters, opponent: null }, ready.info.national) : []), [ready, all, filters]);

  function writeUrl(next: TeamFilters | null, nextMode: Mode): void {
    const params = next ? filtersToParams(next) : new URLSearchParams();
    const tile = nextMode === mode ? new URLSearchParams(window.location.search).get(TILE_PARAM) : null;
    if (tile && nextMode !== 'sum') params.set(TILE_PARAM, tile);
    if (VIEW_PARAM[nextMode]) params.set('view', VIEW_PARAM[nextMode]!);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  }
  function change(next: TeamFilters): void {
    if (!ready) return;
    const clean = normaliseFilters(all, next, ready.info.national) ?? next;
    setFilters(clean); setNote(null); writeUrl(clean, mode);
  }

  function show(next: Mode): void {
    if (next === mode || !ready || !filters) return;
    let nextFilters = filters;
    // International mixes formats whose rates share no scale, so the Bat, bowl and field view switches to one format and says so.
    if (next === 'bbf') { const out = forBatBowl(all, filters); nextFilters = out.filters; if (out.note) setNote(out.note); }
    const dir = mode !== 'sum' && next !== 'sum' ? (VIEW_ORDER[next] > VIEW_ORDER[mode] ? 1 : -1) : undefined;
    leaveAsLayer(activePane(), dir, next === 'sum');
    if (dir !== undefined && next !== 'sum' && kept.includes(next)) enterKept.current = dir;
    // Going to the profile drops the views that were kept, so they open fresh next time: the tile choices made inside them (the leaders group, the player search) start again.
    if (next === 'sum') { setKept([]); clearRemembered(); setTop('bat'); setQuery(''); } else setKept((was) => (mode === 'sum' ? [next] : was.includes(next) ? was : [...was, next]));
    if (nextFilters !== filters) setFilters(nextFilters);
    setMode(next);
    const params = nextFilters ? filtersToParams(nextFilters) : new URLSearchParams();
    if (VIEW_PARAM[next]) params.set('view', VIEW_PARAM[next]!);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  }

  // Change team: the address changes without a navigation and the page stays on its view. The old team stays until the new one's file has arrived.
  function switchTeam(hit: TeamHit): void {
    const next = teamSlug(hit.id);
    if (next === slug) return;
    const params = new URLSearchParams();
    const view = VIEW_PARAM[mode];
    if (view) params.set('view', view);
    const tile = new URLSearchParams(window.location.search).get(TILE_PARAM);
    if (tile && mode !== 'sum') params.set(TILE_PARAM, tile);
    const q = params.toString();
    window.history.pushState(null, '', `/teams/${next}${q ? `?${q}` : ''}`);
    switching.current = true;
    setKept((was) => was.filter((m) => m === mode));
    clearRemembered();
    setQuery('');
    setTop('bat');
    setSlug(next);
    setChangingTop(false);
  }

  if (load.status === 'loading') return <PageLoader />;
  if (load.status === 'missing') return <NotFoundState what="team" />;
  if (load.status === 'error') return <ErrorState onRetry={() => { setLoad({ status: 'loading' }); setAttempt((n) => n + 1); }} />;
  if (!info || !filters) return <NotFoundState what="team" />;

  const { team: name, id: teamId, national } = { team: info.name, id: info.id, national: info.national };
  const clearAll = (): void => change({ ...filters, competition: filters.format === 'LEAGUE' ? filters.competition : null, season: null, opponent: null, venue: null });
  const ctx: Ctx = { team: name, teamId, national, ms: scope, noOpp, all, innings, onClear: clearAll };
  const last10 = sortByDate(all).slice(-10);
  const sum = counts(all);

  const tile = (id: string, label: string, group: string, title: string, tip: string, body: ReactNode, wide = false, control?: ReactNode): TileDef => ({ id, label, group, title, tip, tag: 'Cricsheet', ...(wide ? { wide: true } : {}), ...(control ? { control } : {}), body });
  const noBatBowl = mode === 'bbf';
  // A league team's competition is always its league, so it is not a filter the visitor set.
  const setCount = [national ? filters.competition : null, filters.season, filters.opponent, filters.venue].filter((v) => v !== null).length;

  const resTiles: TileDef[] = [
    tile('key', 'Key numbers', 'Results', 'Key numbers', 'Totals for the matches that match the filters.', <KeyBody c={ctx} />),
    tile('form', 'Form', 'Results', 'Form', 'The last ten matches that match the filters, newest on the right.', <FormBody c={ctx} />),
    tile('matches', 'Matches', 'Matches', 'Matches', national ? 'Every match in the filters, by season and series.' : 'Every match in the filters, by season.', <MatchesBody c={ctx} />, true),
    tile('trophies', 'Trophies and knockouts', 'Trophies and knockouts', 'Trophies and knockouts', 'Titles and finals in every tournament the team played, from the matches tagged as a Final.', <TrophiesKnockoutsBody c={ctx} />, true),
    tile('season', 'By season', 'Over time', 'By season', 'Matches won, drawn or tied, and lost in each season as stacked bars, over the win rate of the season.', <SeasonBody c={ctx} />, true),
    tile('bc', 'Bat first or chase', 'Situations', 'Bat first or chase', 'Results when the team batted first and when it chased, with the average score in each case.', <BatChaseBody c={ctx} />),
    tile('toss', 'Toss', 'Situations', 'Toss', 'How often the team won the toss, what it chose, and how the four cases ended: won and batted, won and fielded, lost and batted first, lost and chased.', <TossBody c={ctx} />),
    tile('opp', 'Opponents', 'Opponents', 'Opponents', 'Results against every opponent in the matches that match the other filters.', <OpponentsBody c={ctx} chosen={filters.opponent} onPick={(id) => change({ ...filters, opponent: id })} />, true),
  ];

  const topControl = (
    <span className="sw msw" role="group" aria-label="Leaders">
      {([['bat', 'Batting'], ['bowl', 'Bowling'], ['field', 'Fielding and awards']] as const).map(([k, l]) => <button key={k} type="button" className={top === k ? 'on' : undefined} onClick={() => setTop(k)}>{l}</button>)}
    </span>
  );
  const plyTiles: TileDef[] = [
    tile('squad', 'Players used', 'Players', 'Players used', 'Every player used in the filters, with batting, bowling and fielding totals.',
      <SquadBody c={ctx} players={players} query={query} />, true,
      <input className="bpq" type="search" placeholder="Search player" aria-label="Search players" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />),
    tile('top', 'Top performers', 'Leaders', 'Top performers', 'The leaders among the players used, in batting, bowling and fielding.',
      <TopBody c={ctx} players={players} group={top} />, true, topControl),
    tile('used', 'Players used by season', 'Over time', 'Players used by season', 'Matches each player was used in, by season.',
      <UsedBody c={ctx} players={players} />, true),
  ];

  const bbfTiles: TileDef[] = [
    tile('batp', 'Batting', 'Phases', 'Batting', 'The team\'s batting in each phase of the innings, against what an average side does off the same balls.', <PhasesBody c={ctx} side="for" phases={phases} styles={styles} avgs={avgs} gender={info.gender} />, true),
    tile('bowlp', 'Bowling', 'Phases', 'Bowling', 'The team\'s bowling in each phase of the innings, against what an average side concedes off the same balls.', <PhasesBody c={ctx} side="against" phases={phases} styles={styles} avgs={avgs} gender={info.gender} />, true),
    tile('fkey', 'Fielding', 'Catching', 'Fielding', 'Catches, stumpings and run outs for the matches that match the filters.', <FieldingBody c={ctx} players={players} wickets={wickets} />),
    tile('fhow', 'How wickets were taken', 'Catching', 'How wickets were taken', 'The wickets the team took and the wickets it lost, by the way they fell.', <HowBody c={ctx} wickets={wickets} />),
    tile('frev', 'Reviews', 'Discipline', 'Reviews', 'The team\'s own reviews as the fielding and the batting side, and how many succeeded.', <ReviewsBody c={ctx} reviews={reviews} has={true} />),
    tile('fext', 'Extras conceded', 'Discipline', 'Extras conceded', 'Extras the team gave away while fielding, in total, per innings and per season.', <ExtrasBody c={ctx} />),
  ];

  const views: Record<ViewMode, ReactNode> = {
    res: <TileCarousel key={slug} name="Results" note="" summary="The filters above apply to every tile. Click a stop to jump to it." tiles={resTiles} resetKey={slug} instant={false} />,
    ply: <TileCarousel key={slug} name="Players" note="" summary="The filters above apply to every tile. Click a stop to jump to it." tiles={plyTiles} resetKey={slug} instant={false} />,
    bbf: <TileCarousel key={slug} name="Batting, bowling and fielding" note="" summary="The filters above apply to every tile. Click a stop to jump to it." tiles={bbfTiles} resetKey={slug} instant={false} />,
  };
  const viewOf = (m: ViewMode): ReactNode => (
    <>
      {!phone && <TeamScopeBar ms={all} filters={filters} national={national} count={scope.length} onChange={change} />}
      {views[m]}
    </>
  );

  return (
    <div className="pgx tgx tmx">
      <div className={`app ${mode === 'sum' ? 'state-sum' : `state-ana view-${mode}`}`} data-up="2">
        <NavBar />
        <section className="sum">
          <Watermark />
          <div className="sumin">
            <div className="phead">
              <div className="photo tph" aria-hidden="true"><TeamEmblem team={name} size={92} /></div>
              <div className="pid">
                <div className="nrow">
                  <MorphText as="h1" text={name} nowrap />
                  <div className="chg">
                    {changing
                      ? <TeamSearchBox autoFocus onDone={() => setChanging(false)} onPick={switchTeam} />
                      : phone
                        ? <button type="button" className="pmb chgb" aria-label="Change team" title="Change team" onClick={() => setChanging(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4" /></svg></button>
                        : <><button type="button" className="mini" onClick={() => setChanging(true)}>Change team</button><Link className="mini" href={`/compare/teams?a=${encodeURIComponent(teamId)}`}>Compare</Link></>}
                  </div>
                </div>
                <MorphText as="div" className="g" text={description(info, all)} />
                <div className="pawd"><b>{all.length.toLocaleString('en')}</b> matches in the data, {sum.won.toLocaleString('en')} won ({pct(sum.rate)})</div>
              </div>
              <div className="fwrap">
                <div className="ih"><h2>Form</h2><span className="ov">last {last10.length} matches</span></div>
                <div className="form">
                  {last10.map((m) => (
                    <div className="fb" key={m.id}>
                      <MatchLink m={m} team={name}><span className={`tfb ${FORM_CLASS[m.result]}`} title={`${marginText(m)}, ${dateText(m.date)}`}>{FORM_TEXT[m.result]}</span></MatchLink>
                      <span title={m.opp}>vs {teamAbbreviation(m.opp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div id="ptabs">
              <div className="in tt" ref={tableCard}>
                <h5 className="sh0">Results by format</h5>
                <div className="tsc">
                  <table className="cmp2 ct">
                    <thead><tr>{['Format', 'Mat', 'Won', 'Lost', 'Draw, tie', 'NR', 'Win rate', 'Avg score', 'Avg against'].map((h, i) => <th key={h} style={i ? undefined : { textAlign: 'left' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {formatRows(all).map((r) => {
                        const c = counts(r.ms), f = averageInnings(r.ms, innings, 'for'), a = averageInnings(r.ms, innings, 'against');
                        return <tr key={r.label}><td>{r.bold ? <b>{r.label}</b> : r.label}</td><td>{c.played}</td><td>{c.won}</td><td>{c.lost}</td><td>{c.draw + c.tie}</td><td>{c.nr}</td><td>{pct(c.rate)}</td><td>{f === null ? '-' : Math.round(f)}</td><td>{a === null ? '-' : Math.round(a)}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="btns">
              <button type="button" className="btn p" onClick={() => show('res')}>Results</button>
              <button type="button" className="btn s" onClick={() => show('ply')}>Players</button>
              <button type="button" className="btn s" onClick={() => show('bbf')}>Batting, bowling and fielding</button>
              <Link className="btn s" href={`/compare/teams?a=${encodeURIComponent(teamId)}`}>Compare with another team</Link>
            </div>
          </div>
          <p className="credit"><SiteCredit /></p>
        </section>
        <p className="vcredit"><SiteCredit /></p>
        <div className="top">
          {!phone && <StripBrand />}
          {phone ? (
            <>
              <button type="button" className="pback" aria-label="Back to the profile" onClick={() => show('sum')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
              <div className="pwho">
                <TeamEmblem team={name} size={38} />
                <span className="pwt"><b>{name}</b><span className="pscope">{[FORMAT_NAME[filters.format], competitionOptions(all, filters.format).find((o) => o.key === filters.competition)?.name ?? 'All competitions', filters.season ?? 'All time'].join(', ')}</span></span>
              </div>
              <button type="button" className="pfilt" aria-expanded={sheet} onClick={() => setSheet(true)}>Filters{setCount > 0 ? <b>{setCount}</b> : null}</button>
              <div className="pmore"><button type="button" className="pmb chgb" aria-label="Change team" title="Change team" onClick={() => setChangingTop(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4" /></svg></button></div>
              {changingTop && <div className="chg tchg open"><TeamSearchBox autoFocus onDone={() => setChangingTop(false)} onPick={switchTeam} /></div>}
            </>
          ) : (
            <>
              <div className="who">
                <div className="one"><span className="tem"><TeamEmblem team={name} size={28} /></span><b>{name}</b></div>
                <div className={`chg tchg${changingTop ? ' open' : ''}`}>
                  <button type="button" className="mini" onClick={() => setChangingTop(true)}>Change team</button>
                  <Link className="mini" href={`/compare/teams?a=${encodeURIComponent(teamId)}`}>Compare</Link>
                  {changingTop && <TeamSearchBox autoFocus onDone={() => setChangingTop(false)} onPick={switchTeam} />}
                </div>
              </div>
              <TeamFilterBar ms={all} filters={filters} national={national} noIntl={noBatBowl} onChange={change} />
              {note && <span className="fnote" role="status">{note}</span>}
            </>
          )}
          <div className="trt">
            <span className="sw" id="vsw">
              {(['res', 'ply', 'bbf'] as const).map((m) => <button key={m} type="button" className={mode === m ? 'on' : undefined} onClick={() => show(m)}>{VIEW_NAME[m]}</button>)}
            </span>
            <button type="button" className="mini" onClick={() => show('sum')}>Profile</button>
          </div>
        </div>
        {(['res', 'ply', 'bbf'] as const).map((m) => {
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
            <TeamFilterBar ms={all} filters={filters} national={national} noIntl={noBatBowl} onChange={change} />
            <div className="fslot"><TeamScopeBar ms={all} filters={filters} national={national} count={scope.length} onChange={change} /></div>
            {note && <span className="fnote" role="status">{note}</span>}
            <button type="button" className="fsd" onClick={() => setSheet(false)}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
