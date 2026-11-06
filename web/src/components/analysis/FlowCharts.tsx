'use client';

import { usePhone } from '../usePhone';
import { useCallback, useMemo, useState, type PointerEvent, type ReactNode } from 'react';
import { ChartTip } from '../ChartTip';
import { useBox } from '../charts/useBox';
import { usePlayOnView } from '../charts/usePlayOnView';
import { blockStats, cumulative, overStats, type OverStat } from '@/domain/analysis';
import type { BallFile } from '@/domain/ballByBall';
import { scoreText, type InningsCard, type MatchBundle } from '@/domain/match';
import { inningsName, phaseName, phasesOf } from '@/domain/matchDetails';
import { niceAxis } from '@/domain/seasons';
import { TipBody } from '../TipBody';

// The innings-flow charts of the Match page Analysis (mockup charts 1, 2, 46, 47 and 48): the scoring worm, Manhattan, and for a Test the worm of four innings, runs by block of 20 overs
// and runs per over. Each draws into the size of its tile (useBox), animates when the tile is on screen and has a tooltip. Every number comes from the ball file of the innings.

const GRID = 'rgba(255,255,255,.12)', MUTED = '#A8A8A8', INK = '#ECECEC';
const LEFT = 46, TOP = 26;

/** One side's innings with its ball file worked out. */
export interface FlowInnings { inn: InningsCard; stats: OverStat[]; cum: number[]; colour: string; name: string }

export function flowInnings(b: MatchBundle, inn: InningsCard, file: BallFile, colour: string): FlowInnings {
  const stats = overStats(file);
  return { inn, stats, cum: cumulative(stats), colour, name: b.match.kind === 'test' ? `${inningsName(b, inn)}, ${inn.team}` : inn.team };
}

const unitOf = (b: MatchBundle): number => (b.match.kind === 'hundred' ? 5 : 1);
const oversAxis = (b: MatchBundle, n: number): string => (b.match.kind === 'hundred' ? 'Balls' : n > 0 ? 'Overs' : 'Overs');
/** Overs (or sets of five balls) the x axis covers: the scheduled length, or the longest innings when that was longer. */
function span(b: MatchBundle, lines: readonly FlowInnings[]): number {
  const longest = Math.max(1, ...lines.map((l) => l.stats.length));
  const scheduled = b.match.kind === 'hundred' ? 20 : b.match.kind === 'test' ? 0 : b.match.scheduledOvers ?? 0;
  return Math.max(longest, scheduled);
}
function xTicks(b: MatchBundle, n: number): number[] {
  const step = b.match.kind === 'test' ? (n > 120 ? 40 : 20) : b.match.kind === 'hundred' ? 4 : n <= 20 ? 5 : 10;
  const ticks: number[] = [];
  for (let k = 0; k <= n; k += step) ticks.push(k);
  return ticks;
}

function Wicket({ x, y, r = 7 }: { x: number; y: number; r?: number }) {
  // A disc fades in once the bars or the line have drawn.
  return (
    <g className="line-draw-dot" pointerEvents="none">
      <circle cx={x} cy={y} r={r} fill="#fff" stroke="#1B1B1B" strokeWidth="1.5" />
      <text x={x} y={y + r * 0.38} textAnchor="middle" fontSize={r * 1.15} fontWeight="800" fill="#1B1B1B">W</text>
    </g>
  );
}

function Legend({ items, x, y }: { items: ReadonlyArray<{ colour: string; label: string; line?: boolean; dash?: boolean }>; x: number; y: number }) {
  let at = x;
  return (
    <g pointerEvents="none">
      {items.map((it) => {
        const out = (
          <g key={it.label}>
            {it.line ? <line x1={at} x2={at + 16} y1={y} y2={y} stroke={it.colour} strokeWidth="3" strokeDasharray={it.dash ? '5 3' : undefined} /> : <rect x={at} y={y - 5} width="10" height="10" rx="2" fill={it.colour} />}
            <text x={at + (it.line ? 22 : 15)} y={y + 4} fill={INK} fontSize="12">{it.label}</text>
          </g>
        );
        at += (it.line ? 28 : 21) + it.label.length * 6.6 + 10;
        return out;
      })}
    </g>
  );
}

function useFlow(signature: string) {
  const { ref: boxRef, w: W, h: H } = useBox<SVGSVGElement>();
  const { ref: playRef, played } = usePlayOnView<SVGSVGElement>(signature);
  const ref = useCallback((node: SVGSVGElement | null) => { playRef(node); boxRef(node); }, [playRef, boxRef]);
  return { ref, W, H, played };
}

const whereOf = (b: MatchBundle, k: number): string => (b.match.kind === 'hundred' ? `Balls ${(k - 1) * 5 + 1} to ${k * 5}` : `Over ${k}`);

/** Cumulative wickets after each over. */
const wicketsTo = (stats: readonly OverStat[]): number[] => { const out = [0]; for (const s of stats) out.push(out[out.length - 1]! + s.wickets); return out; };

/** The phase bands of a limited-overs innings behind the lines: Powerplay, Middle, Death. */
export function Bands({ b, inn, x, top, bottom }: { b: MatchBundle; inn: InningsCard; x: (over: number) => number; top: number; bottom: number }) {
  const phases = phasesOf(inn).filter((p) => !p.key.startsWith('band'));
  if (phases.length < 2) return null;
  return (
    <g pointerEvents="none" className="band-fade">
      {phases.map((p, k) => (
        <g key={p.key}>
          <rect x={x(p.firstOver)} y={top} width={Math.max(0, x(p.lastOver + 1) - x(p.firstOver))} height={bottom - top} fill="#fff" fillOpacity={k % 2 === 0 ? 0.05 : 0} />
          <text x={(x(p.firstOver) + x(p.lastOver + 1)) / 2} y={top + 11} textAnchor="middle" fill={MUTED} fontSize="10">{phaseName(b, p)}</text>
        </g>
      ))}
    </g>
  );
}

/** The scoring worm of a limited-overs match: the score after each over of both innings, the gap between them shaded for whoever leads, and a white disc where a wicket fell. */
export function WormChart({ b, lines }: { b: MatchBundle; lines: readonly FlowInnings[] }) {
  const n = span(b, lines);
  const peak = Math.max(...lines.map((l) => l.cum[l.cum.length - 1] ?? 0));
  const axis = useMemo(() => niceAxis(peak + 4), [peak]);
  const { ref, W, H, played } = useFlow(`worm:${b.match.id}:${lines.map((l) => `${l.inn.n}:${l.cum.length}:${l.cum[l.cum.length - 1]}`).join('|')}`);
  const [at, setAt] = useState<{ over: number; x: number; y: number } | null>(null);
  const R = W - 14, BASE = H - 40;
  const x = (o: number): number => LEFT + (o / n) * (R - LEFT);
  const y = (v: number): number => BASE - (v / axis.top) * (BASE - TOP);
  const wk = useMemo(() => lines.map((l) => wicketsTo(l.stats)), [lines]);
  const shared = Math.min(...lines.map((l) => l.cum.length - 1));
  const lead = (k: number): number => (lines[0]!.cum[k]! + lines[0]!.cum[k - 1]! >= lines[1]!.cum[k]! + lines[1]!.cum[k - 1]! ? 0 : 1);
  const unit = unitOf(b);
  function move(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const o = Math.round((((e.clientX - box.left) / box.width) * W - LEFT) / (R - LEFT) * n);
    setAt({ over: Math.max(1, Math.min(n, o)), x: e.clientX, y: e.clientY });
  }
  const tipRows = at ? lines.map((l, i) => ({ label: l.inn.team, value: at.over < l.cum.length ? `${l.cum[at.over]}/${wk[i]![at.over]}` : `${scoreText(l.inn)}, innings over`, colour: l.colour })) : [];
  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Scoring worm: ${lines.map((l) => `${l.inn.team} ${scoreText(l.inn)}`).join(', ')}`} onPointerLeave={() => setAt(null)}>
        {[0, 1, 2, 3].map((k) => { const v = k * axis.step; return <g key={k}><line x1={LEFT} x2={R} y1={y(v)} y2={y(v)} stroke={GRID} /><text x={LEFT - 8} y={y(v) + 4} fill={MUTED} fontSize="11" textAnchor="end">{v}</text></g>; })}
        {xTicks(b, n).map((k) => <text key={k} x={x(k)} y={BASE + 16} fill={MUTED} fontSize="11" textAnchor="middle">{k * unit}</text>)}
        <text x={(LEFT + R) / 2} y={H - 4} fill={MUTED} fontSize="11" textAnchor="middle">{oversAxis(b, n)}</text>
        <text x={12} y={(TOP + BASE) / 2} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 12 ${(TOP + BASE) / 2})`}>Runs</text>
        <Bands b={b} inn={lines[0]!.inn} x={x} top={TOP} bottom={BASE} />
        <g className="band-fade" pointerEvents="none">
          {Array.from({ length: shared }, (_, k) => k + 1).map((k) => {
            const a = lines[0]!.cum, c = lines[1]!.cum;
            return <path key={k} d={`M${x(k - 1)} ${y(a[k - 1]!)}L${x(k)} ${y(a[k]!)}L${x(k)} ${y(c[k]!)}L${x(k - 1)} ${y(c[k - 1]!)}Z`} fill={lines[lead(k)]!.colour} fillOpacity=".3" />;
          })}
        </g>
        {lines.map((l) => <path key={l.inn.n} className="line-draw" pathLength={1} d={l.cum.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join('')} fill="none" stroke={l.colour} strokeWidth="3" strokeLinejoin="round" />)}
        {lines.map((l) => l.stats.map((s, k) => (s.wickets > 0 ? <Wicket key={`${l.inn.n}:${k}`} x={x(k + 1)} y={y(l.cum[k + 1]!)} /> : null)))}
        <Legend items={lines.map((l) => ({ colour: l.colour, label: l.inn.team, line: true }))} x={LEFT + 8} y={TOP - 14} />
        <text x={R - 2} y={TOP - 10} textAnchor="end" fill={MUTED} fontSize="11">W = wicket</text>
        {at && <line x1={x(at.over)} x2={x(at.over)} y1={TOP} y2={BASE} stroke="#fff" strokeOpacity=".35" pointerEvents="none" />}
        <rect x={LEFT} y={0} width={R - LEFT} height={BASE} fill="transparent" onPointerMove={move} />
      </svg>
      {at && <ChartTip x={at.x} y={at.y}><TipBody title={whereOf(b, at.over)} rows={tipRows} /></ChartTip>}
    </>
  );
}

/** The worm of a Test: the score after each over of up to four innings on one axis, the first innings of a side solid and its second dashed, a diamond where an innings was declared. */
export function TestWormChart({ b, lines, order }: { b: MatchBundle; lines: readonly FlowInnings[]; order: readonly string[] }) {
  const phone = usePhone();
  const n = span(b, lines);
  const peak = Math.max(...lines.map((l) => l.cum[l.cum.length - 1] ?? 0));
  const axis = useMemo(() => niceAxis(peak * 1.06), [peak]);
  const { ref, W, H, played } = useFlow(`tworm:${b.match.id}:${lines.map((l) => `${l.inn.n}:${l.cum.length}:${l.cum[l.cum.length - 1]}`).join('|')}`);
  const [at, setAt] = useState<{ over: number; x: number; y: number } | null>(null);
  const R = W - 70, BASE = H - 40;
  const x = (o: number): number => LEFT + (o / n) * (R - LEFT);
  const y = (v: number): number => BASE - (v / axis.top) * (BASE - TOP);
  const second = (l: FlowInnings): boolean => lines.some((o) => o.inn.team === l.inn.team && o.inn.n < l.inn.n);
  function move(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const o = Math.round((((e.clientX - box.left) / box.width) * W - LEFT) / (R - LEFT) * n);
    setAt({ over: Math.max(1, Math.min(n, o)), x: e.clientX, y: e.clientY });
  }
  const teams = [...new Set(lines.map((l) => l.inn.team))];
  const colourOf = (team: string): string => lines.find((l) => l.inn.team === team)!.colour;
  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Scoring worm of ${lines.length} innings: ${lines.map((l) => `${l.inn.team} ${scoreText(l.inn)}`).join(', ')}`} onPointerLeave={() => setAt(null)}>
        {[0, 1, 2, 3].map((k) => { const v = k * axis.step; return <g key={k}><line x1={LEFT} x2={R} y1={y(v)} y2={y(v)} stroke={GRID} /><text x={LEFT - 8} y={y(v) + 4} fill={MUTED} fontSize="11" textAnchor="end">{v}</text></g>; })}
        {xTicks(b, n).map((k) => <text key={k} x={x(k)} y={BASE + 16} fill={MUTED} fontSize="11" textAnchor="middle">{k}</text>)}
        <text x={(LEFT + R) / 2} y={H - 4} fill={MUTED} fontSize="11" textAnchor="middle">Overs</text>
        <text x={12} y={(TOP + BASE) / 2} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 12 ${(TOP + BASE) / 2})`}>Runs</text>
        {lines.map((l) => <path key={l.inn.n} className="line-draw" pathLength={1} d={l.cum.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join('')} fill="none" stroke={l.colour} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={second(l) ? '7 5' : undefined} />)}
        {lines.map((l) => {
          const o = l.cum.length - 1, px = x(o), py = y(l.cum[o]!);
          const label = scoreText(l.inn);
          return (
            <g key={`end${l.inn.n}`} className="line-draw-dot" pointerEvents="none">
              {l.inn.declared && <path d={`M${px} ${py - 8}l7 8l-7 8l-7 -8z`} fill="#fff" />}
              <text x={px + 11} y={py + 4} fill={INK} fontSize="12" fontWeight="600">{label}</text>
            </g>
          );
        })}
        <Legend items={[...teams.map((t) => ({ colour: colourOf(t), label: t, line: true })), { colour: MUTED, label: 'second innings', line: true, dash: true }]} x={LEFT + 8} y={TOP - 14} />
        <text x={W - 6} y={phone ? H - 4 : TOP - 10} textAnchor="end" fill={MUTED} fontSize="11">Diamond: declared</text>
        {at && <line x1={x(at.over)} x2={x(at.over)} y1={TOP} y2={BASE} stroke="#fff" strokeOpacity=".35" pointerEvents="none" />}
        <rect x={LEFT} y={0} width={R - LEFT} height={BASE} fill="transparent" onPointerMove={move} />
      </svg>
      {at && (
        <ChartTip x={at.x} y={at.y}>
          <TipBody title={`Over ${at.over}`} rows={order.flatMap((id) => { const l = lines.find((o) => String(o.inn.n) === id); return l ? [{ label: l.name, value: at.over < l.cum.length ? `${l.cum[at.over]}/${wicketsTo(l.stats)[at.over]}` : 'Innings over', colour: l.colour }] : []; })} />
        </ChartTip>
      )}
    </>
  );
}

/** One innings' runs in each over as bars, a white disc over an over with a wicket, and the score and length of the innings at the top. */
function overBars(stats: readonly OverStat[], b: MatchBundle, W: number, H: number, colour: string, tick: (k: number) => boolean, extra: ReactNode, hover: { index: number | null; set: (i: number | null, e?: PointerEvent) => void }, played: boolean, fixedTop?: number) {
  const R = W - 14, BASE = H - 40;
  const slot = (R - LEFT) / Math.max(1, stats.length);
  // Room above the tallest bar for its wicket disc, so nothing is drawn past the top of the plot.
  const top = fixedTop ?? niceAxis(Math.max(...stats.map((s) => s.runs), 6) * 1.15).top;
  const step = top / 3;
  const y = (v: number): number => BASE - (v / top) * (BASE - TOP);
  return (
    <>
      {[0, 1, 2, 3].map((k) => { const v = k * step; return <g key={k}><line x1={LEFT} x2={R} y1={y(v)} y2={y(v)} stroke={GRID} /><text x={LEFT - 8} y={y(v) + 4} fill={MUTED} fontSize="11" textAnchor="end">{Math.round(v * 10) / 10}</text></g>; })}
      <text x={12} y={(TOP + BASE) / 2} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 12 ${(TOP + BASE) / 2})`}>{b.match.kind === 'hundred' ? 'Runs per 5 balls' : 'Runs per over'}</text>
      {stats.map((s, k) => {
        const cx = LEFT + k * slot + slot / 2, rise = BASE - y(s.runs), r = Math.max(4, Math.min(7, slot * 0.45));
        return (
          <g key={k} opacity={hover.index === null || hover.index === k ? 1 : 0.5}>
            <rect className="bar-grow" x={LEFT + k * slot + Math.min(1.5, slot * 0.12)} y={y(s.runs)} width={Math.max(1, slot - Math.min(3, slot * 0.25))} height={Math.max(0, rise)} rx={Math.min(2, slot / 4)} fill={colour} />
            {tick(k) && <text x={cx} y={BASE + 16} fill={MUTED} fontSize="11" textAnchor="middle">{(k + 1) * unitOf(b)}</text>}
            {s.wickets > 0 && <Wicket x={cx} y={y(s.runs) - r - 3} r={r} />}
          </g>
        );
      })}
      {extra}
      <rect x={LEFT} y={0} width={R - LEFT} height={BASE} fill="transparent" onPointerMove={(e) => { const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect(); hover.set(Math.max(0, Math.min(stats.length - 1, Math.floor(((((e.clientX - box.left) / box.width) * W) - LEFT) / slot))), e); }} />
    </>
  );
}

/** Manhattan: the runs of every over of one innings as bars (a set of five balls in The Hundred), the run count over each bar, a disc over an over that took a wicket, the phase bands behind. The chips pick the innings. */
export function ManhattanChart({ b, line, peak }: { b: MatchBundle; line: FlowInnings; peak: number }) {
  const n = span(b, [line]);
  const { ref, W, H, played } = useFlow(`manhattan:${b.match.id}:${line.inn.n}:${line.cum[line.cum.length - 1]}`);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const hv = { index: hover?.index ?? null, set: (i: number | null, e?: PointerEvent) => setHover(i === null || !e ? null : { index: i, x: e.clientX, y: e.clientY }) };
  const every = n > 20 ? 10 : 5;
  const R = W - 14, BASE = H - 40;
  // Both innings share the axis, so they compare when the chips switch between them.
  const stats = Array.from({ length: n }, (_, k) => line.stats[k] ?? { runs: 0, wickets: 0, balls: 0 });
  const slot = (R - LEFT) / n;
  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Manhattan: runs in each ${b.match.kind === 'hundred' ? 'set of five balls' : 'over'} of ${line.inn.team}`} onPointerLeave={() => hv.set(null)}>
        <Bands b={b} inn={line.inn} x={(o) => LEFT + o * slot} top={TOP} bottom={BASE} />
        {overBars(stats, b, W, H, line.colour, (k) => k === 0 || (k + 1) % every === 0, (
          <>
            <text x={(LEFT + R) / 2} y={H - 4} fill={MUTED} fontSize="11" textAnchor="middle">{oversAxis(b, n)}</text>
            <Legend items={[{ colour: line.colour, label: line.inn.team }, { colour: '#fff', label: 'Wicket' }]} x={LEFT + 8} y={TOP - 14} />
          </>
        ), hv, played, niceAxis(Math.max(6, peak) * 1.15).top)}
      </svg>
      {hover && <ChartTip x={hover.x} y={hover.y}>{(() => { const s = line.stats[hover.index]; return <TipBody title={whereOf(b, hover.index + 1)} sub={line.inn.team} rows={s ? [{ label: 'Runs', value: String(s.runs) }, ...(s.wickets ? [{ label: 'Wickets', value: String(s.wickets) }] : [])] : undefined} note={s ? undefined : 'No ball bowled'} />; })()}</ChartTip>}
    </>
  );
}

/** Test: runs in each block of 20 overs, innings after innings in the colour of the side, each bar with a disc for every wicket. */
export function BlocksChart({ b, lines }: { b: MatchBundle; lines: readonly FlowInnings[] }) {
  const groups = useMemo(() => lines.map((l) => ({ l, blocks: blockStats(l.stats) })), [lines]);
  const all = groups.flatMap((g) => g.blocks);
  const peak = Math.max(40, ...all.map((x) => x.runs));
  const axis = useMemo(() => niceAxis(peak * 1.12), [peak]);
  const { ref, W, H, played } = useFlow(`blocks:${b.match.id}:${groups.map((g) => g.l.inn.n).join('')}:${all.map((x) => x.runs).join(',')}`);
  const [hover, setHover] = useState<{ g: number; k: number; x: number; y: number } | null>(null);
  const R = W - 14, BASE = H - 58;
  const GAP = 18;
  const slot = (R - LEFT - GAP * (groups.length - 1)) / Math.max(1, all.length);
  const y = (v: number): number => BASE - (v / axis.top) * (BASE - TOP);
  let index = 0;
  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Runs in each block of 20 overs: ${groups.map((g) => `${g.l.name} ${g.blocks.map((x) => x.runs).join(', ')}`).join('; ')}`} onPointerLeave={() => setHover(null)}>
        {[0, 1, 2, 3].map((k) => { const v = k * axis.step; return <g key={k}><line x1={LEFT} x2={R} y1={y(v)} y2={y(v)} stroke={GRID} /><text x={LEFT - 8} y={y(v) + 4} fill={MUTED} fontSize="11" textAnchor="end">{v}</text></g>; })}
        <text x={12} y={(TOP + BASE) / 2} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 12 ${(TOP + BASE) / 2})`}>Runs</text>
        {groups.map((g, gi) => {
          const x0 = LEFT + index * slot + gi * GAP;
          index += g.blocks.length;
          const mid = x0 + (g.blocks.length * slot) / 2;
          return (
            <g key={g.l.inn.n}>
              {g.blocks.map((x, k) => {
                const bx = x0 + k * slot, w = Math.max(6, Math.min(70, slot - 8)), cx = bx + slot / 2;
                const per = Math.max(1, Math.min(4, Math.floor(w / 12)));
                const rise = BASE - y(x.runs);
                return (
                  <g key={k} opacity={hover === null || (hover.g === gi && hover.k === k) ? 1 : 0.55}>
                    <rect className="bar-grow" x={cx - w / 2} y={y(x.runs)} width={w} height={Math.max(0, rise)} rx="3" fill={g.l.colour} />
                    <text x={cx} y={BASE + 14} textAnchor="middle" fill={MUTED} fontSize="10">{x.from}{'\u2013'}{x.to}</text>
                    {Array.from({ length: x.wickets }, (_, wk) => <Wicket key={wk} x={cx + ((wk % per) - (Math.min(per, x.wickets - Math.floor(wk / per) * per) - 1) / 2) * 12} y={BASE - 11 - Math.floor(wk / per) * 12} r={5} />)}
                  </g>
                );
              })}
              <rect x={mid - 5} y={BASE + 25} width="10" height="3" rx="1.5" fill={g.l.colour} />
              <text x={mid} y={BASE + 42} textAnchor="middle" fill={INK} fontSize="11" fontWeight="600">{g.l.inn.team}</text>
              <text x={mid} y={BASE + 54} textAnchor="middle" fill={MUTED} fontSize="10">{inningsName(b, g.l.inn)}</text>
              <rect x={x0} y={0} width={g.blocks.length * slot} height={BASE} fill="transparent" onPointerMove={(e) => { const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect(); const vx = ((e.clientX - box.left) / box.width) * W - x0; setHover({ g: gi, k: Math.max(0, Math.min(g.blocks.length - 1, Math.floor(vx / slot))), x: e.clientX, y: e.clientY }); }} />
            </g>
          );
        })}
      </svg>
      {hover && (() => { const g = groups[hover.g]!, x = g.blocks[hover.k]!; return <ChartTip x={hover.x} y={hover.y}><TipBody title={g.l.name} sub={`Overs ${x.from} to ${x.to}`} rows={[{ label: 'Runs', value: String(x.runs) }, ...(x.wickets ? [{ label: 'Wickets', value: String(x.wickets) }] : [])]} /></ChartTip>; })()}
    </>
  );
}

/** Test: the runs in every over of one innings, with a disc over an over that took a wicket, and the score and length of the innings at the top. */
export function PerOverChart({ b, line }: { b: MatchBundle; line: FlowInnings }) {
  const { ref, W, H, played } = useFlow(`perover:${b.match.id}:${line.inn.n}:${line.cum[line.cum.length - 1]}`);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const hv = { index: hover?.index ?? null, set: (i: number | null, e?: PointerEvent) => setHover(i === null || !e ? null : { index: i, x: e.clientX, y: e.clientY }) };
  const total = scoreText(line.inn);
  const n = line.stats.length;
  const every = n > 90 ? 20 : 10;
  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Runs in each over of the ${inningsName(b, line.inn)} innings of ${line.inn.team}, ${total}`} onPointerLeave={() => hv.set(null)}>
        {overBars(line.stats, b, W, H, line.colour, (k) => k === 0 || (k + 1) % every === 0, (
          <>
            <text x={(LEFT + W - 14) / 2} y={H - 4} fill={MUTED} fontSize="11" textAnchor="middle">Overs</text>
            <text x={W - 16} y={TOP - 8} textAnchor="end" fill={INK} fontSize="12" fontWeight="600">{line.inn.team}, {total}, {line.inn.overs} overs</text>
          </>
        ), hv, played)}
      </svg>
      {hover && <ChartTip x={hover.x} y={hover.y}><TipBody title={`Over ${hover.index + 1}`} rows={[{ label: 'Runs', value: String(line.stats[hover.index]!.runs) }, ...(line.stats[hover.index]!.wickets ? [{ label: 'Wickets', value: String(line.stats[hover.index]!.wickets) }] : [])]} /></ChartTip>}
    </>
  );
}
