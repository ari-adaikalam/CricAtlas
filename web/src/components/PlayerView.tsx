'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { listenAddress } from './addressEvents';
import { type Player } from '@/data/player';
import { fetchProfile, PLAYER_KINDS } from '@/data/profileData';
import { prefetchPlayer, setPlayer } from '@/data/store';
import { runBatView, runBowlView, runRecordsView } from '@/data/views';
import { CountText } from './charts/CountUp';
import { warmEngine } from '@/data/engine';
import { fetchViewCache, isViewCacheSettled, prefetchViewCaches } from '@/data/queryCache';
import type { CareerDetail } from '@/data/career';
import { battingLines, bowlingLines } from '@/domain/career';
import { applyFilters, competitionOptions, defaultFilters, FORMAT_NAME, filtersFromParams, filtersToParams, forAnalysis, normaliseFilters, type PlayerFilters } from '@/domain/filters';
import { type SummaryRow } from '@/domain/batting';
import { anySet, ballFiltersFromParams, ballFiltersToParams, DEFAULT_BALL_FILTERS, resetForFormat, type BallFilters } from '@/domain/ballFilters';
import { bowlingTotals, roleKind } from '@/domain/bowling';
import { bowlFigures, bowlFormClass, formClass, teamAbbreviation, type BowlFormInnings, type FormInnings } from '@/domain/profile';
import { ChartColoursProvider } from './ChartColours';
import { BattingAnalysis } from './BattingAnalysis';
import { BowlingAnalysis } from './BowlingAnalysis';
import { StatsView } from './StatsView';
import { handOf } from '@/domain/shots';
import { RecordsView } from './RecordsView';
import { TILE_PARAM } from './TileCarousel';
import { FilterBar } from './FilterBar';
import { usePhone } from './usePhone';
import { BallSlot } from './ballSlot';
import { formatLabel } from '@/domain/labels';
import { NavBar, StripBrand } from './Nav';
import { TeamGender, TeamRef } from './TeamLinks';
import Link from 'next/link';
import { EntityLink } from './EntityLink';
import { ProfileTable } from './ProfileTable';
import { MorphText } from './MorphText';
import { ErrorState, NotFoundState, PageLoader } from './states/PageStates';
import { EmptySlice } from './states/TileStates';
import '@/styles/player.css';
import { SearchBox } from './SearchBox';
import { activePane, clearRemembered, leaveAsLayer, playKept } from './viewMorph';
import { photoBackdrop } from '@/domain/colours';
import { playerIdFromSlug, playerSlug } from '@/domain/slug';
import { SiteCredit } from '@/components/SiteCredit';

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string } | { status: 'ready'; player: Player; rows: SummaryRow[]; form: FormInnings[]; bowlForm: BowlFormInnings[]; awards: number; detail: CareerDetail };
type Mode = 'sum' | 'bat' | 'bowl' | 'rec' | 'stats';
/** How long the old row of a view takes to fade out when the player is changed (globals.css). The profile morphs and does not wait. */
const VIEW_PARAM: Record<Mode, string | null> = { sum: null, bat: 'batting', bowl: 'bowling', rec: 'records', stats: 'stats' };
type ViewMode = 'bat' | 'bowl' | 'rec' | 'stats';
const VIEW_ORDER: Record<Mode, number> = { sum: 0, bat: 1, bowl: 2, rec: 3, stats: 4 };

const int = new Intl.NumberFormat('en');

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/** "Right-hand batter, right-arm medium. Top-order batter, India. 2008 to 2026." Parts the data does not have are left out. */
function description(player: Player): string {
  const sentence = (parts: Array<string | null | undefined>): string | null => {
    const kept = parts.filter((p): p is string => Boolean(p));
    return kept.length ? `${kept.join(', ')}.` : null;
  };
  const upper = (text: string | null): string | null => (text ? text.charAt(0).toUpperCase() + text.slice(1) : null);
  const first = player['first international year'], last = player['last international year'];
  const years = first === null ? null : last !== null && last !== first ? `${first} to ${last}.` : `${first}.`;
  const batting = player['batting style'], bowling = player['bowling style'];
  return [
    sentence([upper(batting ? batting.replace(/ bat$/, ' batter') : null), bowling]),
    sentence([upper(player['playing role']), player.country]),
    years,
  ].filter(Boolean).join(' ');
}

/**
 * The photo that was showing stays fully opaque until the new one is 30% in (0.13 s of its 0.5 s fade), then fades out over the rest, slowly at first. Fading both from the start leaves the
 * picture only about 75% opaque halfway, which shows as a blink. This way it stays above about 90%.
 */
const FADE_OUT = 'opacity 0.37s ease-in 0.13s';
/** How long the old photo is kept for a new one that is on its way. After this the circle changes to the new player's initials and the photo fades in over them when it arrives. */
const PHOTO_WAIT_MS = 160;

/**
 * The photo is hotlinked from its host. A missing or broken image falls back to initials on the player's country colour, with ink
 * chosen to read on it. A country the colour table does not have keeps the brand gradient. In a morph the photos change like this: the next one loads in the slot that is not showing and,
 * when it has loaded and been decoded, the two cross-fade (below). If it has not arrived after PHOTO_WAIT_MS, the old photo fades out to the new player's initials, which are under the photos,
 * and the new photo fades in over them when it comes, so the page never shows the new name with the old photo for the second a hosted photo can take.
 */
function Photo({ player, small = false, morph = false }: { player: Player; small?: boolean; morph?: boolean }) {
  const url = player['image url'];
  // Two permanent slots that take turns: the next photo is put in the slot that is not showing, and no picture is ever removed or given a new address while it shows, because that is what
  // made the photo blink (a new picture element needs a moment to draw even when it is cached).
  const [slots, setSlots] = useState<[string | null, string | null]>([url, null]);
  const [active, setActive] = useState<0 | 1>(0);
  // Whether the active slot's photo is on show. It goes false when the next photo is late, so the initials show until it arrives.
  const [on, setOn] = useState(true);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const wait = useRef(0);
  useLayoutEffect(() => {
    const free = (active === 0 ? 1 : 0) as 0 | 1;
    // Already showing, or already placed in the other slot and on its way: nothing to do (setting it again would loop).
    if (slots[active] === url || slots[free] === url) return;
    if (!morph || !slots[active] || !url) { setSlots(active === 0 ? [url, null] : [null, url]); setOn(true); return; }
    setSlots(free === 0 ? [url, slots[1]] : [slots[0], url]);
    window.clearTimeout(wait.current);
    wait.current = window.setTimeout(() => setOn(false), PHOTO_WAIT_MS);
  }, [url, morph, slots, active]);
  useEffect(() => () => window.clearTimeout(wait.current), []);
  const show = (slot: 0 | 1, element: HTMLImageElement): void => {
    // Fade to the new photo once it is decoded (or after the decode fails, which only means it is drawn when it is ready).
    const done = (): void => {
      if (slots[slot] !== url || slot === active) return;
      window.clearTimeout(wait.current);
      setActive(slot);
      setOn(true);
    };
    if (typeof element.decode === 'function') element.decode().then(done, done); else done();
  };
  const className = small ? 'photo sm' : 'photo';
  const current = slots[active];
  // The country's colour is behind the photo as well as under the initials: the photos are cut out, so it shows around the player.
  const base = photoBackdrop(player.country);
  if (!current || failed.has(current)) return <div className={className} aria-hidden="true" style={base}>{initials(player.name)}</div>;
  return (
    <div className={className} style={{ ...base, position: 'relative' }}>
      {initials(player.name)}
      {([0, 1] as const).map((slot) => slots[slot] && (
        <img key={slot} src={slots[slot]!} alt={slot === active && !small ? player.name : ''} referrerPolicy="no-referrer"
          ref={(el) => { if (el && slot !== active && el.complete && el.naturalWidth > 0) show(slot, el); }}
          onLoad={(e) => { if (slot !== active) show(slot, e.currentTarget); }} onError={() => setFailed((was) => new Set(was).add(slots[slot]!))}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', opacity: slot === active && on ? 1 : 0, zIndex: slot === active ? 2 : 1,
            transition: !morph ? 'none' : slot === active ? (on ? 'opacity 0.5s ease' : 'opacity 0.25s ease') : FADE_OUT }} />
      ))}
    </div>
  );
}

export function PlayerView({ playerId: firstId }: { playerId: string }) {
  // The player can change inside a view without leaving the page (Change player in Batting, Bowling or Records), so the id is state.
  const [playerId, setPlayerId] = useState(firstId);
  const [pending, setPending] = useState<string | null>(null);
  const switchedAt = useRef(0);

  // Another way of changing player in a view can be tried against the default with ?switch=tiles in the address: the view keeps its tile frames and only their contents fade. The default is
  // a fade of the whole row.
  const [style, setStyle] = useState<{ views: 'row' | 'tiles' }>({ views: 'row' });
  useEffect(() => {
    setStyle({ views: new URLSearchParams(window.location.search).get('switch') === 'tiles' ? 'tiles' : 'row' });
  }, []);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [filters, setFilters] = useState<PlayerFilters | null>(null);
  const [mode, setMode] = useState<Mode>('sum');
  // The views of this player that have been opened and are kept in the page, hidden when not shown (Ari, 2026-10-19). Going to the profile, or another player, ends it. A view that is not shown
  // keeps the element it last rendered (the same reference), so React leaves it alone while filters change, and it catches up when it is shown again.
  const [kept, setKept] = useState<readonly ViewMode[]>([]);
  const frozen = useRef<Partial<Record<ViewMode, ReactNode>>>({});
  const enterKept = useRef<1 | -1 | null>(null);
  useLayoutEffect(() => {
    const dir = enterKept.current;
    enterKept.current = null;
    if (dir === null || mode === 'sum') return;
    const pane = activePane();
    playKept(pane, dir);
    // The address names the tile the view is on (writeUrl dropped it when the view changed).
    const car = pane?.querySelector<HTMLElement>('.car');
    const tile = car?.getAttribute('data-first');
    const url = new URL(window.location.href);
    if (tile && car && car.scrollLeft > 8) url.searchParams.set(TILE_PARAM, tile); else url.searchParams.delete(TILE_PARAM);
    window.history.replaceState(null, '', url);
  }, [mode]);
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [changingTop, setChangingTop] = useState(false);
  // The phone's strip: the Filters sheet (which also holds the ball filters of the view on screen, drawn into `slotEl`) and the three-dot menu.
  const phone = usePhone();
  const [sheet, setSheet] = useState(false);
  const [menu, setMenu] = useState(false);
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!sheet && !menu) return;
    const away = (e: PointerEvent): void => {
      const t = e.target as Element;
      if (sheet && !t.closest('.fsheet, .pfilt')) setSheet(false);
      if (menu && !t.closest('.pmore')) setMenu(false);
    };
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') { setSheet(false); setMenu(false); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [sheet, menu]);
  // Which career table the profile shows: the role decides the start (a batter and an allrounder see batting, a bowler bowling).
  const [shown, setShown] = useState<'bat' | 'bowl'>('bat');
  const [ball, setBall] = useState<BallFilters>(DEFAULT_BALL_FILTERS);

  useEffect(() => {
    let cancelled = false;
    // The queries read this player's files, which are fetched whole in one request each. They start once the profile has said which exist (below).
    setPlayer(playerId);
    // The engine starts with the page and not when the profile arrives, so its download runs alongside the profile instead of after it (about 0.8 s earlier). A light device skips it.
    warmEngine();
    fetchProfile(playerId)
      .then(async (profile) => {
        if (cancelled) return;
        if (!profile) { setPending(null); setLoad({ status: 'missing' }); return; }
        const { player, rows, form, bowlForm, awards, detail } = profile;
        // The profile is on its way to the screen; the player's files load behind it, for the views.
        prefetchViewCaches(playerId);
        prefetchPlayer(playerId, PLAYER_KINDS);
        const params = new URLSearchParams(window.location.search);
        // A format in the address is used as it is, with the competition and season it names. Without one the player opens on their own default.
        const asked = filtersFromParams(params);
        const start = asked.format ? { format: asked.format, competition: asked.competition ?? null, season: asked.season ?? null } : { ...defaultFilters(rows), ...asked };
        const startMode: Mode = params.get('view') === 'batting' ? 'bat' : params.get('view') === 'bowling' ? 'bowl' : params.get('view') === 'records' ? 'rec' : params.get('view') === 'stats' ? 'stats' : 'sum';
        const normalised = start.format ? normaliseFilters(rows, start as PlayerFilters) : null;
        // Changing player: the old page fades out first and the new one comes in after it has gone, even when its data was already here. In a view, the new player's data for that view
        // is loaded during the fade (at most 1.5 s), so the view opens with its content and not with loaders.
        if (switchedAt.current) {
          if (startMode !== 'sum' && normalised) {
            const scope = startMode === 'rec' || startMode === 'stats' ? normalised : forAnalysis(rows, normalised).filters;
            const defaults = ballFiltersFromParams(params, startMode === 'bowl' ? 'bowl' : 'bat', scope.format === 'TEST');
            const fetchAll = async (): Promise<void> => {
              if (startMode === 'stats') return;
              await fetchViewCache(playerId, startMode);
              await (startMode === 'rec' ? runRecordsView(playerId, scope) : startMode === 'bat' ? runBatView(playerId, scope, defaults) : runBowlView(playerId, scope, defaults));
            };
            await Promise.race([fetchAll().catch(() => undefined), new Promise((resolve) => window.setTimeout(resolve, 1500))]);
          }
          // The profile morphs. A view stays as it is until the new player's view is ready, then the old one is kept as a layer that dissolves into the new one (viewMorph.ts).
          if (startMode !== 'sum' && style.views !== 'tiles') leaveAsLayer(activePane(), undefined, false, true);
        }
        setPending(null);
        setLoad({ status: 'ready', player, rows, form, bowlForm, awards, detail });
        setShown(roleKind(player['playing role']) === 'bowl' ? 'bowl' : 'bat');
        setFilters(start.format ? normaliseFilters(rows, start as PlayerFilters) : null);
        // The page carries Format, Competition and Season to the next player. One the new player has no matches in goes back to their own default, and a note says so.
        if (asked.format && normalised && (normalised.format !== asked.format || (asked.competition && !normalised.competition))) {
          const lost = normalised.format !== asked.format ? `no matches in ${FORMAT_NAME[asked.format]}. Showing ${FORMAT_NAME[normalised.format]}.` : 'no matches in that competition. Showing all competitions.';
          setNote(`${player.name} has ${lost}`);
        }
        if ((startMode === 'bat' || startMode === 'bowl') && normalised) {
          const out = forAnalysis(rows, normalised);
          setFilters(out.filters);
          if (out.note) setNote(out.note);
          setBall(ballFiltersFromParams(params, startMode === 'bowl' ? 'bowl' : 'bat', out.filters.format === 'TEST'));
        }
        // The address follows the filters the page ended up with, so a link made after a fallback opens the same view.
        const final = (startMode === 'bat' || startMode === 'bowl') && normalised ? forAnalysis(rows, normalised).filters : normalised;
        if (asked.format && final && (final.format !== asked.format || final.competition !== (asked.competition ?? null) || final.season !== (asked.season ?? null))) {
          const next = new URLSearchParams(window.location.search);
          for (const key of ['format', 'competition', 'season']) next.delete(key);
          filtersToParams(final).forEach((value, key) => next.set(key, value));
          window.history.replaceState(null, '', `${window.location.pathname}?${next}`);
        }
        setMode(startMode);
        setKept(startMode === 'sum' ? [] : [startMode]);
      })
      .catch((error: unknown) => {
        console.error('Player data failed to load', playerId, error);
        if (!cancelled) setLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [playerId, attempt]);

  // Re-render when the recorded answers for the open view arrive, so the view starts then.
  const [, setSettledTick] = useState(0);
  const openKind = mode === 'bat' ? 'bat' : mode === 'bowl' ? 'bowl' : mode === 'rec' ? 'rec' : null;
  useEffect(() => {
    if (!openKind) return;
    let alive = true;
    void fetchViewCache(playerId, openKind).then(() => { if (alive) setSettledTick((t) => t + 1); });
    return () => { alive = false; };
  }, [playerId, openKind]);

  // The browser's Back and Forward return to the player in the address, in place.
  useEffect(() => {
    const onPop = () => {
      const id = playerIdFromSlug(window.location.pathname.split('/').filter(Boolean).pop() ?? '');
      if (id && id !== playerId) { setPending(null); setPlayerId(id); }
    };
    return listenAddress(onPop);
  }, [playerId]);

  // The page draws its own bar inside its frame, so the site bar and footer step aside.
  useEffect(() => {
    if (load.status !== 'ready') return;
    document.body.classList.add('has-app');
    return () => document.body.classList.remove('has-app');
  }, [load.status]);

  // The tab title follows the player, also when the player is changed inside the page.
  useEffect(() => { if (load.status === 'ready') document.title = `${load.player.name} | CricAtlas`; }, [load]);

  // The filters and the view live in the URL so a view can be shared. History is replaced in place: no navigation, no reload.
  function writeUrl(nextFilters: PlayerFilters | null, nextMode: Mode, nextBall: BallFilters = ball) {
    const params = nextFilters ? filtersToParams(nextFilters) : new URLSearchParams();
    // The tile in view stays in the URL while the view stays the same, so a reload comes back to it.
    const tile = nextMode === mode ? new URLSearchParams(window.location.search).get(TILE_PARAM) : null;
    if (tile && nextMode !== 'sum') params.set(TILE_PARAM, tile);
    if (nextMode === 'bat' || nextMode === 'bowl') ballFiltersToParams(nextBall, params);
    if (VIEW_PARAM[nextMode]) params.set('view', VIEW_PARAM[nextMode]);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  }
  function change(next: PlayerFilters) {
    // Tests count overs bands where the other formats count phases, so a change between them restarts the ball filters.
    const nextBall = filters && (next.format === 'TEST') !== (filters.format === 'TEST') ? resetForFormat(ball) : ball;
    if (nextBall !== ball) setBall(nextBall);
    setFilters(next); setNote(null); writeUrl(next, mode, nextBall);
  }
  function changeBall(next: BallFilters) { setBall(next); writeUrl(filters, mode, next); }
  // One step that clears the scope and the ball filters together, so the URL is written once with both cleared.
  function clearAll() {
    if (!filters) return;
    const next: PlayerFilters = { format: filters.format, competition: null, season: null };
    setBall(DEFAULT_BALL_FILTERS); setFilters(next); setNote(null);
    writeUrl(next, mode, DEFAULT_BALL_FILTERS);
  }
  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 4500);
    return () => window.clearTimeout(timer);
  }, [note]);
  // The data of every view is loaded in the background while the profile is on screen, for the filters it has now, so that Batting, Bowling and Records open with their content at
  // once (the engine's answers are kept, queryCache.ts). The view the player is most likely to open goes first. A filter change loads them again for the new filters.
  const filterKey = filters ? JSON.stringify(filters) : '';
  useEffect(() => {
    // While another player is being switched to, the data here is still the old player's: nothing is loaded for the new one from it.
    if (load.status !== 'ready' || !filters || load.player.player_id !== playerId) return;
    const { rows: scopeRows, player: who } = load;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const order = roleKind(who['playing role']) === 'bowl' ? (['bowl', 'bat', 'rec'] as const) : (['bat', 'rec', 'bowl'] as const);
      for (const view of order) {
        if (cancelled) return;
        try {
          if (view === 'rec') { await runRecordsView(playerId, filters); continue; }
          const scope = forAnalysis(scopeRows, filters).filters;
          const ballDefaults = ballFiltersFromParams(new URLSearchParams(), view, scope.format === 'TEST');
          await (view === 'bat' ? runBatView : runBowlView)(playerId, scope, ballDefaults);
        } catch (error) {
          console.error('Background load of a view failed', view, error);
        }
      }
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // The filters are read through filterKey, and the rows and the player come with the loaded profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, load.status, filterKey]);

  // International mixes formats whose rates share no scale, so opening an analysis view from it switches to one format and says so.
  function show(next: Mode) {
    let nextFilters = filters;
    let nextNote: string | null = null;
    if ((next === 'bat' || next === 'bowl') && filters && load.status === 'ready') {
      const out = forAnalysis(load.rows, filters);
      nextFilters = out.filters;
      nextNote = out.note ?? null;
    }
    if (next === mode) return;
    // The view being left becomes a layer that fades out as the next one starts.
    const dir = mode !== 'sum' && next !== 'sum' ? (VIEW_ORDER[next] > VIEW_ORDER[mode] ? 1 : -1) : undefined;
    leaveAsLayer(activePane(), dir, next === 'sum');
    // A view that is already in the page plays its entrance in place. One that is not, or any view opened from the profile, is built fresh.
    if (dir !== undefined && next !== 'sum' && kept.includes(next)) enterKept.current = dir;
    const apply = (): void => {
      if (next === 'sum') { setKept([]); clearRemembered(); } else setKept((was) => (mode === 'sum' ? [next] : was.includes(next) ? was : [...was, next]));
      if (nextNote) setNote(nextNote);
      if (nextFilters !== filters) setFilters(nextFilters);
      setMode(next);
      writeUrl(nextFilters, next);
    };
    apply();
  }

  // Change player inside a view or on the profile: the address changes without a navigation and the page stays. A view fades out and the new one is revealed. The profile stays and morphs: its table's numbers
  // count from the old player's values to the new ones, its name, description and form text cross-dissolve (MorphText), and the photo fades in over the old one.
  // The new player opens at the same view, the same tile and the same Format, Competition and Season. A choice the new player has no matches in falls back to their own default (with a note).
  function switchPlayer(hit: { playerId: string; name: string }) {
    const view = VIEW_PARAM[mode];
    if (hit.playerId === playerId) return;
    switchedAt.current = performance.now();
    setKept((was) => was.filter((m) => m === mode));
    clearRemembered();
    const params = filters ? filtersToParams(filters) : new URLSearchParams();
    if (view) params.set('view', view);
    const trying = new URLSearchParams(window.location.search).get('switch');
    if (trying) params.set('switch', trying);
    const tile = new URLSearchParams(window.location.search).get(TILE_PARAM);
    if (tile) params.set(TILE_PARAM, tile);
    window.history.pushState(null, '', `/players/${playerSlug(hit.name, hit.playerId)}?${params}`);
    setPending(hit.name);
    setPlayerId(hit.playerId);
    setChangingTop(false);
  }
  const slice = useMemo(() => (load.status === 'ready' && filters ? applyFilters(load.rows, filters) : []), [load, filters]);
  const bowling = useMemo(() => bowlingTotals(slice), [slice]);

  if (load.status === 'loading') return <PageLoader />;
  if (load.status === 'missing') return <NotFoundState what="player" />;
  if (load.status === 'error') return <ErrorState onRetry={() => { setLoad({ status: 'loading' }); setAttempt((n) => n + 1); }} />;
  if (!filters) return <main className="page"><EmptySlice filters={[]} /></main>;

  const { player, rows, form, bowlForm, awards, detail } = load;
  const batLines = battingLines(rows, detail.bat, detail.field);
  const bowlLines = bowlingLines(rows, detail.bowl);
  const role = roleKind(player['playing role']);
  // Between choosing another player and that player's data arriving, the old data is still here. The bar shows the chosen name and the view shows tile loaders.
  const stale = player.player_id !== playerId;
  // The views keep the player whose data they hold until the next player's data arrives, then move to the new one together.
  const shownId = stale ? player.player_id : playerId;
  // A view waits for the file of recorded answers for its default state (a fraction of a second, and usually fetched already), so it neither races the engine nor repeats work.
  const viewKind = mode === 'bat' ? 'bat' : mode === 'bowl' ? 'bowl' : mode === 'rec' ? 'rec' : null;
  const waiting = viewKind !== null && !stale && !isViewCacheSettled(playerId, viewKind);
  const setCount = (filters.competition !== null ? 1 : 0) + (filters.season !== null ? 1 : 0) + (Object.keys(DEFAULT_BALL_FILTERS) as (keyof BallFilters)[]).filter((k) => ball[k] !== DEFAULT_BALL_FILTERS[k]).length;
  const who: Player = stale ? { ...player, name: pending ?? player.name, 'image url': null, country: null } : player;
  const views: Record<ViewMode, ReactNode> = {
    bat: (
            <ChartColoursProvider playerId={shownId} filters={filters} view="bat" country={player.country}>
            <BattingAnalysis key={shownId} instant={style.views === 'tiles' && switchedAt.current > 0} playerId={shownId} player={player} rows={rows} filters={filters} ball={ball} onBall={changeBall} onClear={clearAll} idle={waiting} />
            </ChartColoursProvider>
    ),
    stats: (
            <ChartColoursProvider playerId={shownId} filters={filters} view={role === 'bowl' ? 'bowl' : 'bat'} country={player.country}>
            <StatsView key={shownId} instant={style.views === 'tiles' && switchedAt.current > 0} playerId={shownId} rows={rows} filters={filters} role={role} hand={handOf(player['batting style'])} idle={waiting} />
            </ChartColoursProvider>
    ),
    rec: (
            <ChartColoursProvider playerId={shownId} filters={filters} view={role === 'bowl' ? 'bowl' : 'bat'} country={player.country}>
            <RecordsView key={shownId} instant={style.views === 'tiles' && switchedAt.current > 0} playerId={shownId} rows={rows} filters={filters} role={role} name={player.name} firstYear={player['first international year']} idle={waiting} />
            </ChartColoursProvider>
    ),
    bowl: (
            <ChartColoursProvider playerId={shownId} filters={filters} view="bowl" country={player.country}>
              <BowlingAnalysis key={shownId} instant={style.views === 'tiles' && switchedAt.current > 0} playerId={shownId} rows={rows} filters={filters} totals={bowling} partTime={role === 'bat'} ball={ball} onBall={changeBall} onClear={clearAll} idle={waiting} />
            </ChartColoursProvider>
    ),
  };
  return (
    <TeamGender value={player.gender}>
    <div className="pgx plx">
      <div className={`app ${mode === 'sum' ? 'state-sum' : `state-ana view-${mode}`}`} data-up="2">
        <NavBar />
        <section className="sum">
          <img className="wm" src="/brand/icons/icon-C-leather-on-dark.svg" alt="" />
          <div className="sumin">
            <div className="phead">
              <Photo player={player} morph />
              <div className="pid">
                <div className="nrow">
                  <MorphText as="h1" text={player.name} nowrap />
                  <div className="chg">
                    {changing
                      ? <SearchBox placeholder="Find another player" autoFocus onDone={() => setChanging(false)} onPick={switchPlayer} />
                      : <><button type="button" className="mini" onClick={() => setChanging(true)}>Change<span className="cpx"> player</span></button><Link className="mini" href={`/compare/players?a=${encodeURIComponent(playerId)}`}>Compare</Link></>}
                  </div>
                </div>
                <MorphText as="div" className="g" text={description(player)} />
                <div className="pawd"><b><CountText value={awards} format={(v) => int.format(Math.round(v))} morph /></b> player of the match awards</div>
              </div>
              {(shown === 'bat' ? form.length : bowlForm.length) > 0 && (
                <div className="fwrap">
                  <div className="ih"><h2>Form</h2><MorphText className="ov" nowrap text={`last 10 innings ${shown === 'bat' ? 'batting' : 'bowling'}`} /></div>
                  <div className="form">
                    {shown === 'bat'
                      ? form.map((f, i) => <div className="fb swap" key={i}><EntityLink entity={{ kind: 'match', id: f.matchId ?? null, name: `v ${f.opponent}` }}><i className={formClass(f)} title={`v ${f.opponent}`}><MorphText nowrap text={`${f.runs}${f.notOut ? '*' : ''}`} /></i></EntityLink><TeamRef name={f.opponent} id={f.opponentId}><MorphText as="span" nowrap text={`vs ${teamAbbreviation(f.opponent)}`} /></TeamRef></div>)
                      : bowlForm.map((f, i) => <div className="fb swap" key={i}><EntityLink entity={{ kind: 'match', id: f.matchId ?? null, name: `v ${f.opponent}` }}><i className={bowlFormClass(f)} title={`${f.wickets} for ${f.runs}, v ${f.opponent}`}><MorphText nowrap text={bowlFigures(f)} /></i></EntityLink><TeamRef name={f.opponent} id={f.opponentId}><MorphText as="span" nowrap text={`vs ${teamAbbreviation(f.opponent)}`} /></TeamRef></div>)}
                  </div>
                </div>
              )}
            </div>
            <div id="proleb">
              <div className="pbar"><span className="g rl">Show</span>
                <span className="sw">
                  {([['bat', 'Batting'], ['bowl', 'Bowling']] as const).map(([value, label]) => <button key={value} type="button" className={shown === value ? 'on' : undefined} onClick={() => setShown(value)}>{label}</button>)}
                </span>
              </div>
            </div>
            <div id="ptabs"><ProfileTable kind={shown} bat={batLines} bowl={bowlLines} /></div>
            <div className="btns">
              <button type="button" className={`btn ${role === 'bowl' ? 's' : 'p'}`} onClick={() => show('bat')}>Batting analysis</button>
              <button type="button" className={`btn ${role === 'bat' ? 's' : 'p'}`} onClick={() => show('bowl')}>Bowling analysis</button>
              <button type="button" className="btn s" onClick={() => show('rec')}>Records</button>
              <button type="button" className="btn s" onClick={() => show('stats')}>Full stats</button>
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
                <Photo player={who} small />
                <span className="pwt"><b>{who.name}</b><span className="pscope">{[formatLabel(filters.format), competitionOptions(rows, filters.format).find((o) => o.key === filters.competition)?.name ?? 'All competitions', filters.season ?? 'Career'].join(', ')}</span></span>
              </div>
              <button type="button" className="pfilt" aria-expanded={sheet} onClick={() => setSheet(true)}>Filters{setCount > 0 ? <b>{setCount}</b> : null}</button>
              <div className="pmore">
                <button type="button" className="pmb" aria-label="More" aria-expanded={menu} onClick={() => setMenu((o) => !o)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg></button>
                {menu && (
                  <div className="pmenu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); setChangingTop(true); }}>Change player</button>
                    <Link role="menuitem" href={`/compare/players?a=${encodeURIComponent(playerId)}`}>Compare</Link>
                    <Link role="menuitem" href="/">Home</Link>
                  </div>
                )}
              </div>
              {changingTop && <div className="chg tchg open"><SearchBox placeholder="Find another player" autoFocus onDone={() => setChangingTop(false)} onPick={switchPlayer} /></div>}
            </>
          ) : (
            <div className="who">
              <div className="one"><Photo player={who} small /><b>{who.name}</b></div>
              <div className={`chg tchg${changingTop ? ' open' : ''}`}>
                <button type="button" className="mini" onClick={() => setChangingTop(true)}>Change<span className="cpx"> player</span></button>
                <Link className="mini" href={`/compare/players?a=${encodeURIComponent(playerId)}`}>Compare</Link>
                {changingTop && <SearchBox placeholder="Find another player" autoFocus onDone={() => setChangingTop(false)} onPick={switchPlayer} />}
              </div>
            </div>
          )}
          {!phone && <FilterBar rows={rows} filters={filters} analysis={mode === 'bat' || mode === 'bowl'} onChange={change} disabled={stale} />}
          {note && <span className="fnote" role="status">{note}</span>}
          <div className="trt">
            <span className="sw" id="vsw">
              <button type="button" className={mode === 'bat' ? 'on' : undefined} onClick={() => show('bat')}>Batting<span className="lg"> analysis</span></button>
              <button type="button" className={mode === 'bowl' ? 'on' : undefined} onClick={() => show('bowl')}>Bowling<span className="lg"> analysis</span></button>
              <button type="button" className={mode === 'rec' ? 'on' : undefined} onClick={() => show('rec')}>Records</button>
              <button type="button" className={mode === 'stats' ? 'on' : undefined} onClick={() => show('stats')}>Full stats</button>
            </span>
            <button type="button" className="mini" onClick={() => show('sum')}>Profile</button>
          </div>
        </div>
        {([['bat', 'p-bat'], ['rec', 'p-rec'], ['bowl', 'p-bowl'], ['stats', 'p-stats']] as const).map(([m, id]) => {
          if (!kept.includes(m)) return null;
          // The view on screen is rendered from the current state. A kept view that is not shown keeps the element it last rendered.
          if (mode === m) frozen.current[m] = views[m];
          return (
            <section key={m} className={`pane${mode === m ? '' : ' held'}${stale && mode === m ? ' switching' : ''}${style.views === 'tiles' ? ' sw-tiles' : ''}`} id={id}>
              <BallSlot.Provider value={phone && mode === m ? slotEl : null}>{frozen.current[m] ?? views[m]}</BallSlot.Provider>
            </section>
          );
        })}
        {phone && (
          <div className={`fsheet${sheet ? ' open' : ''}`} role="dialog" aria-label="Filters" aria-hidden={!sheet}>
            <div className="fsh">
              <b>Filters</b>
              {(filters.competition !== null || filters.season !== null || anySet(ball)) && <button type="button" className="mini" onClick={clearAll}>Clear</button>}
            </div>
            <FilterBar rows={rows} filters={filters} analysis={mode === 'bat' || mode === 'bowl'} onChange={change} disabled={stale} />
            <div className="fslot" ref={setSlotEl} />
            <button type="button" className="fsd" onClick={() => setSheet(false)}>Done</button>
          </div>
        )}
      </div>
    </div>
    </TeamGender>
  );
}
