'use client';

import { Fragment, useMemo, type ReactNode } from 'react';
import { loadBatBalls, loadBowlBalls } from '@/data/fullStatsBalls';
import type { BallBat, BallBowl } from '@/data/fullStatsBalls';
import { loadBatDismissals } from '@/data/batDismissals';
import { withPlayer } from '@/data/withPlayer';
import { DEFAULT_BALL_FILTERS } from '@/domain/ballFilters';
import {
  battingRows, bestPerformances, bowlingRows, cell, cumulativeRuns, inningsToReach, scoreboard, sideOf, situationLines, SITUATIONS, YEAR_MEASURES, yearsOf, yearValue,
  type CompareRow, type Side, type YearMeasure,
} from '@/domain/compareStats';
import { batterHowOut } from '@/domain/dismissals';
import type { PlayerFilters } from '@/domain/filters';
import { battingLine, bowlingLine, type StatBat, type StatBowl } from '@/domain/fullStats';
import { groupOfStyle } from '@/domain/bowlerType';
import { describePhase, phaseOrder, type PhaseFormat } from '@/domain/phases';
import { CompareBars, CompareLines } from './CompareCharts';
import { CompareRows, DISMISSAL_COLOURS, Fig, GOLD, Kn, Mo, SKY, Thin, Who, whole } from './compareUi';
import type { PlayerScope } from './useScopes';
import { useAsync } from './useAsync';
import type { TileDef } from '../TileCarousel';
import { TipBody } from '../TipBody';
import { pickSide, useSides } from '../analysis/useSides';

/** What every tile of the Overall view reads: the two players, their numbers under the filters, and the few choices the tiles share. */
export interface OverallCtx {
  nameA: string; nameB: string; idA: string; idB: string;
  a: PlayerScope; b: PlayerScope;
  filters: PlayerFilters;
  /** Every spell is The Hundred's, so economy is per 5 balls. */
  perFive: boolean;
  tests: boolean;
  /** The measure of the By year tile, which sits in the tile's title row. */
  measure: YearMeasure;
  /** Whether a competition or season is chosen, so clearing them would change the slice. */
  canClear: boolean;
  onClear: () => void;
}

const sideOfScope = (s: PlayerScope, perFive: boolean): Side => sideOf(s.bat, s.bowl, s.played, { catches: s.catches, stumpings: s.stumpings }, s.potm, perFive);
const nothing = (s: PlayerScope): boolean => s.played === 0 && s.bat.length === 0 && s.bowl.length === 0;

function Empty({ c, message }: { c: OverallCtx; message?: string }) {
  return <Thin>{message ?? 'Neither player has matches in this slice.'}{c.canClear && <> <button type="button" className="clr" onClick={c.onClear}>Clear filters</button></>}</Thin>;
}

// ---- Scoreboard, Batting, Bowling ---------------------------------------------------------------------

function ScoreboardBody({ c }: { c: OverallCtx }) {
  const A = sideOfScope(c.a, c.perFive), B = sideOfScope(c.b, c.perFive);
  if (nothing(c.a) && nothing(c.b)) return <Empty c={c} />;
  const s = scoreboard(A, B);
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <Kn side="a" value={s.a} label={`categories led by ${c.nameA}`} /><Kn value={s.level} label="level or not decided" /><Kn side="b" value={s.b} label={`categories led by ${c.nameB}`} />
      </div>
      <Mo k={s.rows.map((r) => `${r.label}${r.a.s}${r.b.s}`).join('|')} className="cgrid">{s.rows.map((r) => <div key={r.label} className={`cc ${r.lead || 'n'}`} title={`${r.label}: ${r.a.s} to ${r.b.s}`}><span>{r.label}</span><b><Fig text={r.a.s} /></b><em><Fig text={r.b.s} /></em></div>)}</Mo>
      <Who a={c.nameA} b={c.nameB} />
    </>
  );
}

function BattingBody({ c }: { c: OverallCtx }) {
  if (c.a.bat.length === 0 && c.b.bat.length === 0) return <Empty c={c} message="Neither player batted in this slice." />;
  return <><CompareRows rows={battingRows(battingLine(c.a.bat), battingLine(c.b.bat))} /><Who a={c.nameA} b={c.nameB} /></>;
}

function BowlingBody({ c }: { c: OverallCtx }) {
  if (c.a.bowl.length === 0 && c.b.bowl.length === 0) return <Empty c={c} message="Neither player bowled in this slice." />;
  return <><CompareRows rows={bowlingRows(sideOfScope(c.a, c.perFive), sideOfScope(c.b, c.perFive), c.perFive)} /><Who a={c.nameA} b={c.nameB} /></>;
}

// ---- Best performances, How they get out, Innings and results ---------------------------------------------

const FORMAT_WORD: Record<string, string> = { TEST: 'Test', ODI: 'ODI', T20: 'T20' };

/** One player's figure in a milestone chip: the dot is the colour of the player's line, "Not yet" when the career has not got there. */
function Reached({ who, side, inns }: { who: string; side: 'a' | 'b'; inns: number | null }) {
  return <span className={inns === null ? 'no' : undefined} title={inns === null ? `${who} has not reached it` : `${who}, ${inns} innings`}><i className="cmd" style={{ background: `var(--s${side})` }} />{inns === null ? 'Not yet' : `${inns} inns`}</span>;
}

function BestBody({ c }: { c: OverallCtx }) {
  const { bar, side } = useSides([c.nameA, c.nameB]);
  const A = bestPerformances(c.a.bat, c.a.bowl), B = bestPerformances(c.b.bat, c.b.bowl);
  if (!A.bat.length && !B.bat.length && !A.bowl.length && !B.bowl.length) return <Empty c={c} />;
  const where = (x: StatBat | StatBowl): string => `v ${x.opponent}, ${x.date.slice(0, 4)}, ${FORMAT_WORD[x.format] ?? x.format}`;
  const column = (name: string, colour: string, o: typeof A): ReactNode => (
    <div className="tpc">
      <h5 className="sub">{name}</h5>
      {o.bat.map((x, k) => <div className="tpr" key={`${x.match_id}-${x.innings}`}><span className="tpn">{k + 1}</span><span className="tpp"><b>{x.runs}{x.is_out ? '' : '*'} <i>({x.balls})</i></b><em>{where(x)}</em></span><span className="tpv" /></div>)}
      {o.bat.length === 0 && <Thin>No innings.</Thin>}
      {o.bowl.map((x) => <div className="tpr bw" key={`${x.match_id}-${x.innings}`}><span className="tpn">w</span><span className="tpp"><b>{x.wickets}/{x.runs}</b><em>{where(x)}</em></span><span className="tpv" /></div>)}
    </div>
  );
  return <>{bar}<Mo k={`${c.nameA}|${c.nameB}|${c.filters.format}|${c.filters.competition}|${c.filters.season}|${A.bat.length}|${B.bat.length}|${side}`} className="tpg two">{pickSide([<Fragment key="a">{column(c.nameA, GOLD, A)}</Fragment>, <Fragment key="b">{column(c.nameB, SKY, B)}</Fragment>], side)}</Mo></>;
}


function HowOutBody({ c }: { c: OverallCtx }) {
  const key = `${c.idA}|${c.idB}|${c.filters.format}|${c.filters.competition}|${c.filters.season}`;
  const data = useAsync(`out|${key}`, () => Promise.all([withPlayer(c.idA, () => loadBatDismissals(c.idA, c.filters, DEFAULT_BALL_FILTERS)), withPlayer(c.idB, () => loadBatDismissals(c.idB, c.filters, DEFAULT_BALL_FILTERS))]));
  if (!data) return <Thin>Loading</Thin>;
  const mk = (types: typeof data[0]['types'], inns: number) => { const shares = batterHowOut(types); const n = shares.reduce((a, s) => a + s.wickets, 0); return { shares, n, inns }; };
  const A = mk(data[0].types, c.a.bat.length), B = mk(data[1].types, c.b.bat.length);
  if (A.n === 0 && B.n === 0) return <Empty c={c} message="Nobody was dismissed in this slice." />;
  const top = (o: typeof A): string => { if (!o.n) return '-'; const m = [...o.shares].sort((x, y) => y.wickets - x.wickets)[0]!; return `${m.label} (${Math.round(m.share * 100)}%)`; };
  const every = (o: typeof A): string => (o.n ? (o.inns / o.n).toFixed(1) : '-');
  const bars = (name: string, colour: string, o: typeof A): ReactNode => (
    <div className="dsr"><b>{name}</b>
      <div className="stk big dsb">{o.shares.map((s, k) => (s.wickets ? <i key={s.label} style={{ width: `${s.share * 100}%`, background: DISMISSAL_COLOURS[k], color: '#0b0b0b' }} title={`${s.label}: ${s.wickets} of ${o.n}`}>{s.share > 0.06 ? `${Math.round(s.share * 100)}%` : ''}</i> : null))}</div>
    </div>
  );
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Kn side="a" value={every(A)} label={`${c.nameA}, innings per dismissal`} /><Kn side="b" value={every(B)} label={`${c.nameB}, innings per dismissal`} />
        <Kn side="a" value={<span style={{ fontSize: 20 }}>{top(A)}</span>} label={`${c.nameA}, most common`} /><Kn side="b" value={<span style={{ fontSize: 20 }}>{top(B)}</span>} label={`${c.nameB}, most common`} />
      </div>
      <div className="dsw">{A.n ? bars(c.nameA, GOLD, A) : null}{B.n ? bars(c.nameB, SKY, B) : null}</div>
      <div className="fleg dsl">{A.shares.map((s, k) => <span key={s.label}><u style={{ background: DISMISSAL_COLOURS[k] }} />{s.label}</span>)}</div>
    </>
  );
}

function SituationsBody({ c }: { c: OverallCtx }) {
  const { bar, side } = useSides(['Average', 'Strike rate']);
  if (nothing(c.a) && nothing(c.b)) return <Empty c={c} />;
  const la = situationLines(c.a.bat), lb = situationLines(c.b.bat);
  const series = (pick: (l: ReturnType<typeof battingLine>) => number | null) => [
    { name: c.nameA, colour: GOLD, values: la.map(pick) }, { name: c.nameB, colour: SKY, values: lb.map(pick) },
  ];
  const tip = (what: string, pick: (l: ReturnType<typeof battingLine>) => number | null) => (i: number): ReactNode => (
    <TipBody title={SITUATIONS[i]!} sub={what} rows={[{ label: c.nameA, value: cell(pick(la[i]!), 1).s, colour: GOLD }, { label: c.nameB, value: cell(pick(lb[i]!), 1).s, colour: SKY }]} />
  );
  return (
    <>
      {bar}
      <div className="fpg">
        {pickSide([
          <div className="art" key="avg"><CompareBars series={series((l) => l.avg)} labels={SITUATIONS} axisLabel="Average" decimals={1} label="Average in each situation" tip={tip('Batting average', (l) => l.avg)} /></div>,
          <div className="art" key="sr"><CompareBars series={series((l) => l.sr)} labels={SITUATIONS} axisLabel="Strike rate" decimals={1} label="Strike rate in each situation" tip={tip('Strike rate', (l) => l.sr)} /></div>,
        ], side)}
      </div>
    </>
  );
}

// ---- Pace, spin and hands --------------------------------------------------------------------------------

function StyleBody({ c }: { c: OverallCtx }) {
  const key = `${c.idA}|${c.idB}|${c.filters.format}|${c.filters.competition}|${c.filters.season}`;
  const data = useAsync(`style|${key}`, () => Promise.all([withPlayer(c.idA, () => loadBatBalls(c.idA, c.filters, 'style')), withPlayer(c.idB, () => loadBatBalls(c.idB, c.filters, 'style')), withPlayer(c.idA, () => loadBowlBalls(c.idA, c.filters, 'hand')), withPlayer(c.idB, () => loadBowlBalls(c.idB, c.filters, 'hand'))]));
  if (nothing(c.a) && nothing(c.b)) return <Empty c={c} />;
  if (!data) return <Thin>Loading</Thin>;
  const vs = (rows: typeof data[0], g: 'pace' | 'spin') => battingLine(rows.filter((r) => groupOfStyle(r.key) === g));
  const hand = (rows: typeof data[2], h: 'left' | 'right') => bowlingLine(rows.filter((r) => r.key === h), c.perFive);
  const [ba, bb, wa, wb] = data;
  const rows: CompareRow[] = [
    { label: 'Average against pace', a: cell(vs(ba, 'pace').avg, 1), b: cell(vs(bb, 'pace').avg, 1) }, { label: 'Strike rate against pace', a: cell(vs(ba, 'pace').sr, 1), b: cell(vs(bb, 'pace').sr, 1) },
    { label: 'Average against spin', a: cell(vs(ba, 'spin').avg, 1), b: cell(vs(bb, 'spin').avg, 1) }, { label: 'Strike rate against spin', a: cell(vs(ba, 'spin').sr, 1), b: cell(vs(bb, 'spin').sr, 1) },
    { label: 'Economy to left handers', a: cell(hand(wa, 'left').econ, 2), b: cell(hand(wb, 'left').econ, 2), low: true }, { label: 'Economy to right handers', a: cell(hand(wa, 'right').econ, 2), b: cell(hand(wb, 'right').econ, 2), low: true },
  ];
  return <><CompareRows rows={rows} /><Who a={c.nameA} b={c.nameB} /></>;
}

// ---- By year, Runs by innings --------------------------------------------------------------------------------

export function YearControl({ measure, onChange }: { measure: YearMeasure; onChange: (m: YearMeasure) => void }) {
  return <span className="sw msw">{YEAR_MEASURES.map((m) => <button type="button" key={m} className={measure === m ? 'on' : undefined} onClick={() => onChange(m)}>{m}</button>)}</span>;
}

function YearBody({ c }: { c: OverallCtx }) {
  const years = useMemo(() => yearsOf(c.a.bat, c.a.bowl, c.b.bat, c.b.bowl), [c.a, c.b]);
  if (years.length === 0) return <Empty c={c} />;
  const val = (s: PlayerScope, y: number): number | null => yearValue(s.bat, s.bowl, y, c.measure);
  const va = years.map((y) => val(c.a, y)), vb = years.map((y) => val(c.b, y));
  if (![...va, ...vb].some((v) => v !== null)) return <Thin>No {c.measure.toLowerCase()} in this slice.</Thin>;
  const best = (v: Array<number | null>): [number, number] | null => { let b: [number, number] | null = null; v.forEach((x, i) => { if (x !== null && (b === null || x > b[0])) b = [x, years[i]!]; }); return b; };
  const ba = best(va), bb = best(vb);
  const fm = (v: number): string => (c.measure === 'Runs' || c.measure === 'Wickets' ? whole(v) : v.toFixed(1));
  let la = 0, lb = 0;
  years.forEach((_, i) => { const x = va[i], y = vb[i]; if (x !== null && y !== null && x !== undefined && y !== undefined) { if (x > y) la += 1; else if (y > x) lb += 1; } });
  const dec = c.measure === 'Runs' || c.measure === 'Wickets' ? 0 : 1;
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <Kn side="a" value={ba ? fm(ba[0]) : '-'} label={`${c.nameA}, best year${ba ? ` (${ba[1]})` : ''}`} /><Kn side="b" value={bb ? fm(bb[0]) : '-'} label={`${c.nameB}, best year${bb ? ` (${bb[1]})` : ''}`} />
        <Kn value={`${la} to ${lb}`} label={`years ahead, ${c.nameA} to ${c.nameB}`} />
      </div>
      <div className="fcm"><div className="art">
        <CompareLines series={[{ name: c.nameA, colour: GOLD, values: va }, { name: c.nameB, colour: SKY, values: vb }]} labels={years.map((y) => `'${String(y).slice(2)}`)} labelStep={years.length > 16 ? 2 : 1}
          axisLabel={c.measure} xTitle="Year" decimals={dec} label={`${c.measure} in each year`}
          tip={(i) => <TipBody title={String(years[i])} sub={c.measure} rows={[{ label: c.nameA, value: va[i] === null || va[i] === undefined ? '-' : fm(va[i]!), colour: GOLD }, { label: c.nameB, value: vb[i] === null || vb[i] === undefined ? '-' : fm(vb[i]!), colour: SKY }]} />} />
      </div></div>
    </>
  );
}

function CumulativeBody({ c }: { c: OverallCtx }) {
  const A = useMemo(() => cumulativeRuns(c.a.bat), [c.a.bat]), B = useMemo(() => cumulativeRuns(c.b.bat), [c.b.bat]);
  if (!A.length && !B.length) return <Empty c={c} />;
  const nA = A.length, nB = B.length, m = Math.min(nA || Infinity, nB || Infinity), gap = nA && nB ? A[m - 1]! - B[m - 1]! : null;
  const longest = Math.max(nA, nB), step = longest > 600 ? 5 : longest > 200 ? 3 : 1;
  // Long careers are drawn from every nth innings, so the chart stays light; the milestones and the tooltip read the full series.
  const sample = (s: readonly number[]): Array<number | null> => Array.from({ length: Math.ceil(longest / step) }, (_, k) => { const i = Math.min(s.length - 1, k * step + step - 1); return k * step < s.length ? s[i]! : null; });
  const max = Math.max(A[nA - 1] ?? 0, B[nB - 1] ?? 0);
  const marks = [1000, 5000, 10000].filter((v) => v <= max);
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <Kn side="a" value={nA ? whole(A[nA - 1]!) : '-'} label={`${c.nameA}, runs in ${whole(nA)} innings`} /><Kn side="b" value={nB ? whole(B[nB - 1]!) : '-'} label={`${c.nameB}, runs in ${whole(nB)} innings`} />
        <Kn value={gap === null ? '-' : `${gap > 0 ? '+' : ''}${whole(gap)}`} label={`runs ahead for ${gap !== null && gap < 0 ? c.nameB : c.nameA} after ${m === Infinity ? 0 : m} innings each`} />
      </div>
      <div className="fcm"><div className="art">
        <CompareLines series={[{ name: c.nameA, colour: GOLD, values: sample(A) }, { name: c.nameB, colour: SKY, values: sample(B) }]} labels={Array.from({ length: Math.ceil(longest / step) }, (_, k) => String((k + 1) * step))} labelStep={Math.max(1, Math.round(Math.ceil(longest / step) / 8))}
          axisLabel="Runs" xTitle="Innings" label="Runs after each innings" tip={(k) => { const i = k * step + step - 1; return <TipBody title={`Innings ${Math.min(i + 1, longest)}`} sub="Runs so far" rows={[{ label: c.nameA, value: A[Math.min(i, nA - 1)] === undefined ? '-' : whole(A[Math.min(i, nA - 1)]!), colour: GOLD }, { label: c.nameB, value: B[Math.min(i, nB - 1)] === undefined ? '-' : whole(B[Math.min(i, nB - 1)]!), colour: SKY }]} />; }} />
      </div></div>
      {marks.length > 0 && <div className="cmk">{marks.map((v) => <div className="cmc" key={v}><b>{whole(v)} runs</b><Reached who={c.nameA} side="a" inns={inningsToReach(A, v)} /><Reached who={c.nameB} side="b" inns={inningsToReach(B, v)} /></div>)}</div>}
    </>
  );
}

// ---- Phases --------------------------------------------------------------------------------------------------

function PhasesBody({ c }: { c: OverallCtx }) {
  const mixed = (c.filters.format === 'INTERNATIONAL' || c.filters.format === 'T20S' || c.filters.format === 'LEAGUE') && c.filters.competition === null;
  const key = `${c.idA}|${c.idB}|${c.filters.format}|${c.filters.competition}|${c.filters.season}`;
  const data = useAsync(`phase|${key}`, () => Promise.all([withPlayer(c.idA, () => loadBatBalls(c.idA, c.filters, 'phase')), withPlayer(c.idB, () => loadBatBalls(c.idB, c.filters, 'phase')), withPlayer(c.idA, () => loadBowlBalls(c.idA, c.filters, 'phase')), withPlayer(c.idB, () => loadBowlBalls(c.idB, c.filters, 'phase'))]), !mixed);
  if (nothing(c.a) && nothing(c.b)) return <Empty c={c} />;
  if (mixed) return <Thin>Phases are defined per format. Pick Tests, ODIs, T20Is or one competition in the filters above.</Thin>;
  if (!data) return <Thin>Loading</Thin>;
  return <PhasesLoaded c={c} data={data} />;
}

function PhasesLoaded({ c, data }: { c: OverallCtx; data: [BallBat[], BallBat[], BallBowl[], BallBowl[]] }) {
  const [ba, bb, wa, wb] = data;
  const keys = [...new Set([...ba, ...bb, ...wa, ...wb].map((r) => r.key))].sort((x, y) => phaseOrder(x) - phaseOrder(y));
  const fmt: PhaseFormat = c.tests ? 'test' : c.filters.format === 'ODI' ? 'odi' : 't20';
  const { bar, side } = useSides(keys.map((k) => describePhase(k, fmt, c.perFive).name));
  const per = (bat: typeof ba, bowl: typeof wa, k: string) => {
    const b = bat.filter((r) => r.key === k), w = bowl.filter((r) => r.key === k);
    const runs = b.reduce((s, r) => s + r.runs, 0), balls = b.reduce((s, r) => s + r.balls, 0), totalRuns = bat.reduce((s, r) => s + r.runs, 0);
    const conceded = w.reduce((s, r) => s + r.runs, 0), bowled = w.reduce((s, r) => s + r.balls, 0), wk = w.reduce((s, r) => s + r.wickets, 0), totalWk = bowl.reduce((s, r) => s + r.wickets, 0);
    return {
      sr: balls ? (runs / balls) * 100 : null, balls: balls || null, rs: totalRuns ? (runs / totalRuns) * 100 : null,
      eco: bowled ? (conceded / bowled) * (c.perFive ? 5 : 6) : null, w: w.length ? wk : null, ws: totalWk ? (wk / totalWk) * 100 : null,
    };
  };
  const pc = (v: number | null): { v: number | null; s: string } => ({ v, s: v === null ? '-' : `${v.toFixed(0)}%` });
  return (
    <>
      {bar}
      <div className="phg" style={{ gridTemplateColumns: `repeat(${keys.length || 1},1fr)` }}>
        {pickSide(keys.map((k) => {
          const a = per(ba, wa, k), b = per(bb, wb, k), d = describePhase(k, fmt, c.perFive);
          const rows: CompareRow[] = [
            { label: 'Strike rate', a: cell(a.sr, 1), b: cell(b.sr, 1) }, { label: 'Balls faced', a: cell(a.balls), b: cell(b.balls) }, { label: 'Share of runs', a: pc(a.rs), b: pc(b.rs) },
            { label: c.perFive ? 'Economy per 5 balls' : 'Economy', a: cell(a.eco, 2), b: cell(b.eco, 2), low: true }, { label: 'Wickets', a: cell(a.w), b: cell(b.w) }, { label: 'Share of wickets', a: pc(a.ws), b: pc(b.ws) },
          ];
          return <div className="phc" key={k}><h5 className="sub">{d.name}{d.overs ? <em>{d.overs}</em> : null}</h5><CompareRows rows={rows} className="one" /></div>;
        }), side)}
      </div>
      <Who a={c.nameA} b={c.nameB} />
    </>
  );
}

/** The ten tiles of the Overall view, in the groups of the mockup: Summary, Batting, Bowling and Over time. */
export function overallTiles(c: OverallCtx, setMeasure: (m: YearMeasure) => void): TileDef[] {
  const tile = (id: string, label: string, group: string, title: string, tip: string, body: ReactNode, control?: ReactNode): TileDef => ({ id, label, group, title, tip, tag: 'Cricsheet', wide: true, ...(control ? { control } : {}), body });
  return [
    tile('board', 'Scoreboard', 'Summary', 'Scoreboard', 'Who leads in each of the main categories for the filters above.', <ScoreboardBody c={c} />),
    tile('bat', 'Batting', 'Batting', 'Batting', 'Career batting for the filters above, one number each side with the larger share drawn from the middle.', <BattingBody c={c} />),
    tile('best', 'Best performances', 'Batting', 'Best performances', 'The five highest scores and the best bowling figures for each player, in the filters above.', <BestBody c={c} />),
    tile('dis', 'How they get out', 'Batting', 'How they get out', 'The share of dismissals by type for each batter.', <HowOutBody c={c} />),
    tile('sit', 'Innings and results', 'Batting', 'Innings and results', 'Batting average and strike rate when batting first, when chasing, and in matches the team won and lost.', <SituationsBody c={c} />),
    tile('bowl', 'Bowling', 'Bowling', 'Bowling', 'Career bowling for the filters above.', <BowlingBody c={c} />),
    tile('style', 'Pace, spin and hands', 'Bowling', 'Pace, spin and hands', "How each batter does against pace and against spin bowlers, and how each bowler does against left and right handed batters.", <StyleBody c={c} />),
    tile('year', 'By year', 'Over time', 'By year', 'One number for each year, for both players.', <YearBody c={c} />, <YearControl measure={c.measure} onChange={setMeasure} />),
    tile('cum', 'Runs by innings', 'Over time', 'Runs by innings', 'Total runs after each innings, for both players.', <CumulativeBody c={c} />),
    tile('phase', 'Phases', 'Over time', 'Phases', c.tests ? 'Batting and bowling in each overs band.' : 'Batting and bowling in each phase of the innings. The Hundred counts balls 1 to 25 as the Powerplay and economy per 5 balls.', <PhasesBody c={c} />),
  ];
}
