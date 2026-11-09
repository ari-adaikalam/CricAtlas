'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadFielding, loadPlayedMatches, loadStatBat, loadStatBowl, type FieldingRow, type PlayedMatch } from '@/data/fullStats';
import { loadBatBalls, loadBowlBalls, loadReviewsByFormat, loadSuperBat, loadSuperBowl, type BallBat, type BallBowl, type FormatReviews, type SuperBat, type SuperBowl } from '@/data/fullStatsBalls';
import { loadLocatedBalls } from '@/data/shots';
import { DEFAULT_BALL_FILTERS } from '@/domain/ballFilters';
import type { SummaryRow } from '@/domain/batting';
import { applyFilters, type PlayerFilters } from '@/domain/filters';
import { battingLine, bowlingLine, groupBy, namerFor, spanOf, type BatLine, type BowlLine, type Group, type Kind, type SortKey, type SplitKey, type StatBat, type StatBowl } from '@/domain/fullStats';
import { awardCards, awardCharts, customCards, dismissedBars, fieldingCharts, placementTables, reviewBars, reviewSummary, superOverTables, type CustomTable } from '@/domain/fullStatsExtra';
import { formatLabel } from '@/domain/labels';
import { describePhase, phaseOrder, type PhaseFormat } from '@/domain/phases';
import type { Shot } from '@/domain/shots';
import { TYPE_LABELS } from '@/domain/bowlerType';
import type { Hand } from '@/domain/wagon';
import { TileCarousel, type TileDef } from './TileCarousel';
import { CountUp } from './charts/CountUp';
import { MorphText } from './MorphText';
import { buildLines, cardsOf, StatCards, StatsTable, type SortState } from './StatsTable';
import { CustomStats } from './StatsCustom';
import { ChartGroup, Columns, Donut, ReviewStack, Stack, StatBars } from './StatsCharts';
import { TileLoader } from './states/TileStates';
import { useFitRows } from './useFitRows';
import { useTableMotion } from './useTableMotion';

// Full stats: seven topic tiles of splits, a Batting or Bowling switch above them, and the Format, Competition and Season of the strip behind every table.

type Custom = 'ph' | 'typ' | 'order' | 'plc' | 'dsf' | 'sov' | 'fld' | 'drs' | 'awd';
interface Option { label: string; tables?: SplitKey[]; custom?: Custom; /** Only for one side: the other side shows a note. */ only?: Kind }
interface TileSpec { id: string; title: string; group: string; tip: string; options: Option[]; /** The options that have many rows get a search box. */ search: string[] }

const TILES: TileSpec[] = [
  { id: 'opp', title: 'Opposition and place', group: 'Where and when', tip: 'Numbers against each team and at each ground, with country, continent and home or away.', search: ['Team', 'Country', 'Ground'],
    options: [{ label: 'Team', tables: ['team'] }, { label: 'Country', tables: ['ctry'] }, { label: 'Continent', tables: ['cont'] }, { label: 'Home or away', tables: ['ha'] }, { label: 'Ground', tables: ['grd'] }] },
  { id: 'time', title: 'Time', group: 'Where and when', tip: 'Numbers by calendar year and by season.', search: ['Year', 'Season'], options: [{ label: 'Year', tables: ['yr'] }, { label: 'Season', tables: ['sea'] }] },
  { id: 'sit', title: 'Match situation', group: 'Match', tip: 'Numbers by toss, innings of the match and result.', search: [],
    options: [{ label: 'Toss', tables: ['toss', 'tosq', 'bfs'] }, { label: 'Innings', tables: ['tin', 'min'] }, { label: 'Result', tables: ['res', 'rsq'] }] },
  { id: 'comp', title: 'Competitions and finals', group: 'Match', tip: 'Numbers by tournament type, match number in the series, and finals and knockouts.', search: [],
    options: [{ label: 'Tournament type', tables: ['trn'] }, { label: 'Match number', tables: ['mno'] }, { label: 'Finals', tables: ['fin'] }] },
  { id: 'spl', title: 'Player splits', group: 'Player', tip: 'Numbers by phase, bowler faced (or batter bowled to), batting order and where the shots went.', search: [],
    options: [{ label: 'Phases', custom: 'ph' }, { label: 'Bowler types', custom: 'typ' }, { label: 'Batting position', tables: ['pos'] }, { label: 'Shot placement', custom: 'plc', only: 'bat' }] },
  { id: 'dis', title: 'Dismissals, Super Overs', group: 'Player', tip: 'Score and balls faced when out, as bars, and the only table that counts Super Overs.', search: [],
    options: [{ label: 'Dismissed for', custom: 'dsf', only: 'bat' }, { label: 'Super Overs', custom: 'sov' }] },
  { id: 'fra', title: 'Fielding, reviews and awards', group: 'Extras', tip: 'Catches, stumpings, run outs, reviews and Player of the match awards.', search: [],
    options: [{ label: 'Fielding', custom: 'fld' }, { label: 'Reviews', custom: 'drs' }, { label: 'Player of the match', custom: 'awd' }] },
];

const TITLE: Record<SplitKey, (kind: Kind, tests: boolean) => string> = {
  team: () => 'Vs team', ctry: () => 'In host country', cont: () => 'In continent', ha: () => 'Home vs away', grd: () => 'By ground', yr: () => 'By year', sea: () => 'By season',
  toss: () => 'Toss', tosq: () => 'Toss and batting sequence', bfs: () => 'Batting first vs fielding first', tin: (k) => (k === 'bat' ? 'In team innings' : 'In fielding innings'), min: () => 'In match innings',
  res: () => 'Match result', rsq: () => 'Result and batting sequence', trn: () => 'Tournament type', mno: () => 'Match number in series', fin: () => 'Finals and knockouts',
  pos: (k) => (k === 'bat' ? 'Batting position' : 'Against batting position'),
};
const NAME_HEAD: Partial<Record<SplitKey, string>> = {};

/**
 * Pins the header of a table under the cards and the table's own title: the heights of those two are measured and written as --fcH and --fhH on the scroll area, which the table header's
 * `top` adds up (the same variables the mockup sets). It measures again when the content or the size changes.
 */
function usePinOffsets(key: string): (node: HTMLDivElement | null) => void {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const measure = (): void => {
      const cards = el.querySelector<HTMLElement>('.fcs'), sub = el.querySelector<HTMLElement>('.sub');
      el.style.setProperty('--fcH', `${cards?.offsetHeight ?? 0}px`);
      el.style.setProperty('--fhH', `${sub?.offsetHeight ?? 0}px`);
    };
    // The cards and the title come and go and change height without the scroll area itself changing size (a search that leaves no rows, another table), so they are watched too: a stale height leaves a gap above the pinned header where the rows show through.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    const watch = (): void => {
      observer?.disconnect();
      observer?.observe(el);
      el.querySelectorAll('.fcs, .sub').forEach((n) => observer?.observe(n));
    };
    measure();
    watch();
    const frame = requestAnimationFrame(measure);
    const changes = new MutationObserver(() => { measure(); watch(); });
    changes.observe(el, { childList: true, subtree: true });
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); changes.disconnect(); };
  }, [el, key]);
  return setEl;
}

/** A value that is loaded when `enabled`, kept while a new one loads (so a filter change dims the table and then changes it in place), and cleared when `reset` changes. */
function useLoaded<T>(reset: string, key: string, load: () => Promise<T>, enabled: boolean): { value: T | null; fresh: boolean } {
  const [state, setState] = useState<{ reset: string; key: string; value: T } | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadRef.current().then((value) => { if (!cancelled) setState({ reset, key, value }); }).catch((error: unknown) => console.error('Full stats failed to load', key, error));
    return () => { cancelled = true; };
  }, [reset, key, enabled]);
  const value = state && state.reset === reset ? state.value : null;
  return { value, fresh: state !== null && state.reset === reset && state.key === key };
}

interface Ctx {
  playerId: string;
  filters: PlayerFilters;
  scopeKey: string;
  kind: Kind;
  hand: Hand;
  tests: boolean;
  /** Matches played in the Format, Competition and Season chosen (the playing XI lists), the Mat of every career row. */
  played: number;
  bat: StatBat[] | null;
  bowl: StatBowl[] | null;
  fresh: boolean;
}

const whole = (n: number): string => Math.round(n).toLocaleString('en');
const two = (n: number): string => n.toFixed(2);
const one = (n: number): string => n.toFixed(1);

/** One figure of the career line above the tiles: an optional word before it, the number (or a pair, as in 5/32), an optional word after it. */
interface BarCell { prefix?: string; value: number | null; pair?: number; format: (n: number) => string; suffix?: string }

function careerCells(kind: Kind, rows: ReadonlyArray<StatBat | StatBowl>, played: number): BarCell[] {
  if (kind === 'bat') {
    const l = battingLine(rows as StatBat[]);
    return [{ value: played, format: whole, suffix: 'mat' }, { value: l.runs, format: whole, suffix: 'runs' }, { prefix: 'avg', value: l.avg, format: two }, { prefix: 'SR', value: l.sr, format: two },
      { value: l.hundreds, format: whole, suffix: 'hundreds' }, { value: l.fifties, format: whole, suffix: 'fifties' }];
  }
  const l = bowlingLine(rows as StatBowl[], rows.length > 0 && rows.every((r) => r.tournament_key === 'hnd'));
  return [{ value: played, format: whole, suffix: 'mat' }, { value: l.wkts, format: whole, suffix: 'wkts' }, { prefix: 'best', value: l.bbiW, pair: l.bbiR ?? undefined, format: whole },
    { prefix: 'econ', value: l.econ, format: two }, { prefix: 'SR', value: l.sr, format: one }];
}

function Note({ children }: { children: ReactNode }) { return <div className="thin">{children}</div>; }

/** The groups of the ball tables (phases, bowler types, batter hands, batting order) as innings rows, so the same columns work out. */
function ballGroups<R extends BallBat | BallBowl>(rows: readonly R[], order: (key: string) => number, label: (key: string) => string): Array<Group<R>> {
  return groupBy(rows, (r) => ({ key: r.key, label: label(r.key), order: order(r.key) }));
}

const HAND_LABEL: Record<string, string> = { right: 'Right-hand batters', left: 'Left-hand batters' };
const ORDER_LABEL: Record<string, string> = { top: 'Batters 1 to 3', middle: 'Batters 4 to 7', tail: 'Batters 8 to 11' };
const ORDER_RANK: Record<string, number> = { top: 0, middle: 1, tail: 2 };

function StatsTileBody({ spec, index, ctx, search, sorts, onSort }: { spec: TileSpec; index: number; ctx: Ctx; search: string; sorts: Record<string, SortState | null>; onSort: (table: string, key: SortKey) => void }) {
  const option = spec.options[index] ?? spec.options[0]!;
  const { kind, filters, playerId, scopeKey, tests } = ctx;
  const reset = `${playerId}`;
  const phaseFormat: PhaseFormat = tests ? 'test' : filters.format === 'ODI' ? 'odi' : 't20';
  const mixed = filters.format === 'INTERNATIONAL';
  const want = (c: Custom): boolean => option.custom === c && (!option.only || option.only === kind);
  const ph = useLoaded<Array<BallBat | BallBowl>>(reset, `ph|${kind}|${scopeKey}`, () => (kind === 'bat' ? loadBatBalls(playerId, filters, 'phase') : loadBowlBalls(playerId, filters, 'phase')), want('ph') && !mixed);
  const typ = useLoaded<Array<BallBat | BallBowl>>(reset, `typ|${kind}|${scopeKey}`, () => (kind === 'bat' ? loadBatBalls(playerId, filters, 'style') : loadBowlBalls(playerId, filters, 'hand')), want('typ'));
  const order = useLoaded<BallBowl[]>(reset, `ord|${scopeKey}`, () => loadBowlBalls(playerId, filters, 'order'), option.tables?.[0] === 'pos' && kind === 'bowl');
  const placed = useLoaded<Shot[]>(reset, `plc|${scopeKey}`, () => loadLocatedBalls(playerId, filters, DEFAULT_BALL_FILTERS), want('plc') && kind === 'bat');
  const sBat = useLoaded<SuperBat[]>(reset, `sob|${scopeKey}`, () => loadSuperBat(playerId, filters), want('sov') && kind === 'bat');
  const sBowl = useLoaded<SuperBowl[]>(reset, `sow|${scopeKey}`, () => loadSuperBowl(playerId, filters), want('sov') && kind === 'bowl');
  const revs = useLoaded<FormatReviews[]>(reset, `drs|${kind}|${scopeKey}`, () => loadReviewsByFormat(playerId, filters, kind), want('drs'));
  const credits = useLoaded<FieldingRow[]>(reset, `fld|${scopeKey}`, () => loadFielding(playerId, filters), want('fld'));
  const played = useLoaded<PlayedMatch[]>(reset, `pm|${scopeKey}`, () => loadPlayedMatches(playerId, filters), want('fld') || want('awd'));

  const innings: ReadonlyArray<StatBat | StatBowl> | null = kind === 'bat' ? ctx.bat : ctx.bowl;
  let content: ReactNode = null;
  let tables = 0;
  let signature = '';

  const standard = (key: SplitKey, rows: ReadonlyArray<StatBat | StatBowl>, title?: string, nameHead?: string): ReactNode => {
    const groups = groupBy(rows, namerFor(key, { tests, kind }));
    const built = buildLines(groups, kind);
    const id = `${spec.id}:${key}`;
    tables += 1; signature += `${key}:${built.length}:${built.reduce((s, b) => s + (kind === 'bat' ? (b.line as BatLine).runs : (b.line as BowlLine).wkts), 0)};`;
    // The career row says matches played (the playing XI lists), as the profile does; a split row below stays a count of the matches that have an innings in it.
    const career = { ...(kind === 'bat' ? battingLine(rows as StatBat[]) : bowlingLine(rows as StatBowl[], rows.every((r) => r.tournament_key === 'hnd'))), mat: ctx.played };
    return (
      <div className="fsc" key={key}>
        {tables === 1 && <StatCards cards={cardsOf(built, kind)} />}
        <StatsTable id={id} title={title ?? TITLE[key](kind, tests)} kind={kind} built={built} career={career} careerSpan={spanOf(rows)} nameHead={nameHead ?? NAME_HEAD[key] ?? 'Name'} sort={sorts[id] ?? null} onSort={(k) => onSort(id, k)} search={search} played />
      </div>
    );
  };
  const custom = (items: CustomTable[]): ReactNode => (
    <>
      <StatCards cards={customCards(items[0])} />
      <div className="fsg" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(3, items.length))}, minmax(0, 1fr))` }}>
        {items.map((t, i) => { tables += 1; signature += `${t.title}:${t.rows.length};`; return <CustomStats key={t.title} id={`${spec.id}:${index}:${i}`} table={t} />; })}
      </div>
    </>
  );
  /** The charts of the Dismissals and Fielding tiles: cards (when there are any) and bars side by side. */
  const charts = (cards: Array<{ label: string; name: string; value: string }>, blocks: ReactNode[], key: string, template?: string): ReactNode => {
    signature += `${key};`; tables += blocks.length;
    return <><StatCards cards={cards} /><ChartGroup id={`${spec.id}:${index}`} signature={`${kind}:${scopeKey}:${key}`} columns={blocks.length} template={template}>{blocks}</ChartGroup></>;
  };

  if (innings === null) content = <TileLoader label={spec.title} />;
  else if (option.only && option.only !== kind) content = <Note>{option.only === 'bat' ? 'Batting only. Switch to Batting to see this.' : 'Bowling only. Switch to Bowling to see this.'}</Note>;
  else if (option.tables) {
    const keys = option.tables;
    const key0 = keys[0]!;
    if (key0 === 'pos' && kind === 'bowl') {
      const rows = order.value;
      if (rows === null) content = <TileLoader label={spec.title} />;
      else {
        const groups = ballGroups(rows, (k) => ORDER_RANK[k] ?? 9, (k) => ORDER_LABEL[k] ?? k);
        const built = buildLines(groups, 'bowl');
        const id = `${spec.id}:order`;
        tables += 1; signature += `order:${built.length};`;
        content = <div className="fsc"><StatCards cards={cardsOf(built, 'bowl')} /><StatsTable id={id} title="Against batting position" kind="bowl" built={built} career={bowlingLine(rows)} careerSpan={spanOf(rows)} nameHead="Batting position" sort={sorts[id] ?? null} onSort={(k) => onSort(id, k)} search="" played /></div>;
      }
    } else if (innings.length === 0) content = <Note>No {kind === 'bat' ? 'batting' : 'bowling'} in this format or competition. Pick another in the strip above.</Note>;
    else content = keys.map((k) => standard(k, innings));
  } else if (want('ph')) {
    if (mixed) content = <Note>Phases are defined per format. Pick Tests, ODIs or T20 above to see them.</Note>;
    else if (ph.value === null) content = <TileLoader label={spec.title} />;
    else {
      const groups = ballGroups(ph.value, phaseOrder, (k) => describePhase(k, phaseFormat, false).name);
      const built = buildLines(groups, kind);
      const id = `${spec.id}:ph`;
      tables += 1; signature += `ph:${built.length};`;
      content = <div className="fsc"><StatsTable id={id} title={tests ? 'By overs band' : 'By phase'} kind={kind} built={built} career={kind === 'bat' ? battingLine(ph.value as BallBat[]) : bowlingLine(ph.value as BallBowl[])} careerSpan={spanOf(ph.value)} nameHead={tests ? 'Overs' : 'Phase'} sort={sorts[id] ?? null} onSort={(k) => onSort(id, k)} search="" played /></div>;
    }
  } else if (want('typ')) {
    if (typ.value === null) content = <TileLoader label={spec.title} />;
    else {
      const order2 = (k: string): number => (kind === 'bat' ? Math.max(0, TYPE_LABELS.indexOf(k)) : k === 'right' ? 0 : 1);
      const groups = ballGroups(typ.value, order2, (k) => (kind === 'bat' ? k : HAND_LABEL[k] ?? k));
      const built = buildLines(groups, kind);
      const id = `${spec.id}:typ`;
      tables += 1; signature += `typ:${built.length};`;
      content = <div className="fsc"><StatCards cards={cardsOf(built, kind)} /><StatsTable id={id} title={kind === 'bat' ? 'Against bowler types' : 'Against batter hand'} kind={kind} built={built} career={kind === 'bat' ? battingLine(typ.value as BallBat[]) : bowlingLine(typ.value as BallBowl[])} careerSpan={spanOf(typ.value)} nameHead={kind === 'bat' ? 'Bowler type' : 'Batter hand'} sort={sorts[id] ?? null} onSort={(k) => onSort(id, k)} search="" played /></div>;
    }
  } else if (want('plc')) content = placed.value === null ? <TileLoader label={spec.title} /> : placed.value.length === 0 ? <Note>No tracked balls in these filters. Not every match has tracking.</Note> : custom(placementTables(placed.value, ctx.hand));
  else if (want('dsf')) content = ctx.bat === null ? <TileLoader label={spec.title} /> : charts([], dismissedBars(ctx.bat).map((set, i) => <StatBars key={set.title} id={`dsf:${i}`} set={set} />), `dsf:${ctx.bat.length}`);
  else if (want('sov')) {
    const rows = kind === 'bat' ? sBat.value : sBowl.value;
    content = tests ? <Note>There are no Super Overs in Tests.</Note> : rows === null ? <TileLoader label={spec.title} /> : rows.length === 0 ? <Note>No Super Overs in these filters.</Note> : <>{custom(superOverTables(sBat.value ?? [], sBowl.value ?? [], kind))}<div className="fsn">Super Over balls are left out of every other table and chart.</div></>;
  }
  else if (want('fld')) content = credits.value === null || played.value === null ? <TileLoader label={spec.title} /> : (() => { const f = fieldingCharts(credits.value, played.value); return charts(f.cards, [<Donut key="t" id="fld:types" title="By how the dismissal came" rows={f.types.rows} unit="dismissals" />, <Columns key="f" id="fld:formats" title="By format" rows={f.formats.rows} unit="dismissals" newestFirst={false} />, <Columns key="y" id="fld:years" title="By year" rows={f.years.rows} unit="dismissals" />], `fld:${f.years.rows.length}`, 'minmax(0, 5fr) minmax(0, 3fr) minmax(0, 6fr)'); })();
  else if (want('drs')) content = revs.value === null ? <TileLoader label={spec.title} /> : revs.value.length === 0 ? <Note>No reviews in these filters. Not every match has review records.</Note> : (() => { const r = reviewBars(revs.value, kind); const sum = reviewSummary(revs.value); return charts(sum.cards, [<Donut key="o" id="drs:outcome" title="How the reviews ended" rows={sum.outcome} unit="reviews" colours={['#C4313A', '#EBC862', '#56B4E9']} centre="reviews" />, <Stack key="s"><ReviewStack id="drs:sides" title={kind === 'bat' ? 'Reviews on the balls the batter faced' : 'Reviews on the bowler\'s deliveries'} rows={r.sides} /><ReviewStack id="drs:formats" title="By format" rows={r.formats} /></Stack>], `drs:${r.formats.length}`, 'minmax(0, 2fr) minmax(0, 3fr)'); })();
  else if (want('awd')) content = played.value === null ? <TileLoader label={spec.title} /> : (() => { const sets = awardCharts(played.value); return charts(awardCards(played.value), [<Donut key="l" id="awd:format" title="Awards by format" rows={sets[0]!.rows} unit="awards" centre="awards" />, <Stack key="r"><Columns id="awd:year" title="Awards by year" rows={sets[1]!.rows} unit="awards" /><Columns id="awd:opp" title="By opposition" rows={sets[2]!.rows} unit="awards" newestFirst={false} /></Stack>], `awd:${played.value.length}`, 'minmax(0, 2fr) minmax(0, 3fr)'); })();

  const dataKey = `${spec.id}:${index}:${kind}:${scopeKey}:${signature}`;
  const orderKey = `${search}|${Object.entries(sorts).map(([k, v]) => `${k}${v ? `${v.key}${v.dir}` : ''}`).join(',')}`;
  const fit = useFitRows<HTMLDivElement>(dataKey);
  const pin = usePinOffsets(dataKey);
  const { ref, motion } = useTableMotion<HTMLDivElement>(dataKey, orderKey, fit, pin);
  return <div className={`tw sc fsb${tables > 1 ? ' multi' : ''}${ctx.fresh ? '' : ' stale'}`} ref={ref} data-rows={motion} id={`fsb-${spec.id}`}>{content}</div>;
}

interface Props {
  playerId: string;
  rows: readonly SummaryRow[];
  filters: PlayerFilters;
  role: 'bat' | 'bowl' | 'all';
  /** The batter's hand, which names the zones of Shot placement. */
  hand: Hand;
  idle?: boolean;
  instant?: boolean;
}

export function StatsView({ playerId, rows, filters, role, hand, idle = false, instant = false }: Props) {
  const [kind, setKind] = useState<Kind>(role === 'bowl' ? 'bowl' : 'bat');
  const [options, setOptions] = useState<Record<string, number>>({});
  const [search, setSearch] = useState<Record<string, string>>({});
  const [sorts, setSorts] = useState<Record<string, SortState | null>>({});
  const scopeKey = `${filters.format}|${filters.competition ?? ''}|${filters.season ?? ''}`;
  const tests = filters.format === 'TEST';
  const bat = useLoaded<StatBat[]>(playerId, `bat|${scopeKey}`, () => loadStatBat(playerId, filters), !idle && kind === 'bat');
  const bowl = useLoaded<StatBowl[]>(playerId, `bowl|${scopeKey}`, () => loadStatBowl(playerId, filters), !idle && kind === 'bowl');
  const played = useMemo(() => applyFilters(rows, filters).reduce((a, r) => a + (r.appearances ?? 0), 0), [rows, filters]);
  const ctx: Ctx = { playerId, filters, scopeKey, kind, hand, tests, played, bat: bat.value, bowl: bowl.value, fresh: kind === 'bat' ? bat.fresh : bowl.fresh };
  const innings = kind === 'bat' ? bat.value : bowl.value;
  const sides = useMemo(() => ({ bat: rows.some((r) => (r.innings ?? 0) > 0), bowl: rows.some((r) => (r.balls_bowled ?? 0) > 0 || (r.wickets ?? 0) > 0) }), [rows]);

  const onSort = (table: string, key: SortKey): void => setSorts((was) => {
    const cur = was[table];
    const next: SortState = cur?.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: key === 'label' ? 1 : -1 };
    return { ...was, [table]: next };
  });
  const scope = [formatLabel(filters.format), filters.competition, filters.season].filter(Boolean).join(', ');
  const cells = useMemo(() => (innings ? careerCells(kind, innings, played) : null), [innings, kind, played]);
  // While new numbers load the bar keeps the last ones, and when they arrive each number counts to its new value and each word cross-dissolves, as on the profile.
  const lastCells = useRef<BarCell[] | null>(null);
  if (cells) lastCells.current = cells;
  const line = cells ?? lastCells.current;

  useEffect(() => { setSorts({}); setSearch({}); }, [playerId, scopeKey, kind]);

  const tiles: TileDef[] = TILES.map((spec) => {
    const index = (options[spec.id] ?? 0) % spec.options.length;
    const current = spec.options[index]!;
    const searchable = spec.search.includes(current.label);
    return {
      id: spec.id, label: spec.title, group: spec.group, title: spec.title, tip: spec.tip, tag: 'Cricsheet', wide: true,
      control: (
        <>
          <span className="fsw">
            {spec.options.length > 1 && (
              <span className="sw msw">
                {spec.options.map((o, i) => <button key={o.label} type="button" className={i === index ? 'on' : undefined} onClick={() => setOptions((was) => ({ ...was, [spec.id]: i }))}>{o.label}</button>)}
              </span>
            )}
          </span>
          <span className="fsr">
            {searchable && <input className="bpq fsq" type="search" placeholder="Search" aria-label="Search rows" autoComplete="off" value={search[spec.id] ?? ''} onChange={(e) => setSearch((was) => ({ ...was, [spec.id]: e.target.value }))} />}
          </span>
        </>
      ),
      body: <StatsTileBody spec={spec} index={index} ctx={ctx} search={searchable ? search[spec.id] ?? '' : ''} sorts={sorts} onSort={onSort} />,
    };
  });

  return (
    <>
      <div className="sbar">
        <span className="sw">
          {([['bat', 'Batting'], ['bowl', 'Bowling']] as const).map(([v, l]) => <button key={v} type="button" className={kind === v ? 'on' : undefined} disabled={!sides[v] && kind !== v} title={sides[v] ? undefined : `No ${l.toLowerCase()} in the data`} onClick={() => setKind(v)}>{l}</button>)}
        </span>
        <span className="sscope"><MorphText text={scope} nowrap fixed /></span>
        {line && (
          <div className="sline">
            <b>Career</b>
            {/* Six places that never move, so a number with another digit or a word of another length changes where it is and nothing else slides. Bowling has five figures. */}
            {Array.from({ length: 6 }, (_, i) => line[i]).map((c, i) => (
              <span key={i} className="scell">
                {c && c.prefix !== undefined && <><MorphText text={c.prefix} nowrap fixed />{' '}</>}
                {c && (c.value === null ? '-' : <CountUp value={c.value} format={c.format} play morph />)}
                {c && c.pair !== undefined && <>/<CountUp value={c.pair} format={c.format} play morph /></>}
                {c && c.suffix !== undefined && <>{' '}<MorphText text={c.suffix} nowrap fixed /></>}
              </span>
            ))}
          </div>
        )}
      </div>
      <TileCarousel resetKey={playerId} instant={instant} name="Full stats" note="Click a stop to jump to it." tiles={tiles} />
    </>
  );
}
