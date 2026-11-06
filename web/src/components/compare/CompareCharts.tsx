'use client';

import { useCallback, useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { niceAxis } from '@/domain/seasons';
import { ChartTip } from '../ChartTip';
import { EmptyPlot } from '../charts/EmptyPlot';
import { useBox } from '../charts/useBox';
import { usePlayOnView } from '../charts/usePlayOnView';

// The two-player charts of Compare: two lines, and grouped bars. They draw into the size of their tile like the player page's charts, animate when they appear and again when the data
// changes (the line draws left to right, bars grow up from the base), and a tooltip names what is under the pointer; the arrow keys move it.

const LEFT = 52, TOP = 16;
const GRID = 'rgba(255,255,255,.12)', MUTED = '#A8A8A8';

export interface Series { name: string; colour: string; values: ReadonlyArray<number | null> }

interface Props {
  series: readonly Series[];
  /** The label under each point or group. */
  labels: readonly string[];
  /** Label every nth point. */
  labelStep?: number;
  axisLabel: string;
  xTitle?: string;
  decimals?: number;
  label: string;
  /** What the tooltip shows for the point or group at this index. */
  tip: (index: number) => ReactNode;
  /** Said in the chart's place when no series has a value. */
  empty?: string;
  /** The top of the axis, when it is not found from the values (a share out of 100). */
  fixedMax?: number;
}

const ticksOf = (max: number): number[] => { const a = niceAxis(max); return [0, 1, 2, 3].map((k) => k * a.step); };

function usePointer(n: number, slotted: boolean, W: number, RIGHT: number) {
  const [hover, setHover] = useState<number | null>(null);
  const [at, setAt] = useState({ x: 0, y: 0 });
  const locate = (e: PointerEvent<SVGRectElement>): void => {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    const i = slotted ? Math.floor(((vx - LEFT) / (RIGHT - LEFT)) * n) : n <= 1 ? 0 : Math.round(((vx - LEFT) / (RIGHT - LEFT)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
    setAt({ x: e.clientX, y: e.clientY });
  };
  const keys = (e: KeyboardEvent<SVGSVGElement>): void => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((h) => Math.max(0, (h ?? n) - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => Math.min(n - 1, (h ?? -1) + 1)); }
    else if (e.key === 'Escape') setHover(null);
    const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    setAt({ x: box.left + box.width / 2, y: box.top });
  };
  return { hover, setHover, at, locate, keys };
}

/** Two lines over the same points, for By year and Runs by innings. */
export function CompareLines({ series, labels, labelStep = 1, axisLabel, xTitle, decimals = 0, label, tip, empty, fixedMax }: Props & { /** The points sit in the middle of equal slots and each carries a dot (years). */ slots?: boolean }) {
  const slots = labelStep >= 1 && labels.length > 0 && labels.length <= 60;
  const id = useId();
  const n = labels.length;
  const { ref: boxRef, w: W, h: H } = useBox<SVGSVGElement>();
  const signature = `${n}:${series.map((s) => s.values.reduce<number>((a, v) => a + (v ?? 0), 0).toFixed(1)).join(':')}`;
  const { ref: playRef, played } = usePlayOnView<SVGSVGElement>(signature);
  const ref = useCallback((node: SVGSVGElement | null) => { playRef(node); boxRef(node); }, [playRef, boxRef]);
  const RIGHT = W - 16, BOTTOM = H - 32;
  const { hover, setHover, at, locate, keys } = usePointer(n, slots, W, RIGHT);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const geo = useMemo(() => {
    if (all.length === 0) return null;
    const top = fixedMax ?? niceAxis(Math.max(...all) * 1.05).top;
    const x = (i: number): number => (slots ? LEFT + ((i + 0.5) * (RIGHT - LEFT)) / n : LEFT + (n <= 1 ? (RIGHT - LEFT) / 2 : (i * (RIGHT - LEFT)) / (n - 1)));
    const y = (v: number): number => BOTTOM - (v / top) * (BOTTOM - TOP);
    const paths = series.map((s) => { let d = '', pen = false; s.values.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `; pen = true; }); return d.trim(); });
    return { x, y, top, paths, ticks: fixedMax === 100 ? [0, 25, 50, 75, 100] : ticksOf(top / 3 * 3) };
  }, [all, n, series, slots, RIGHT, BOTTOM, fixedMax]);

  if (!geo) {
    return <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${empty ?? 'Nothing to show for these filters.'}`}><EmptyPlot left={LEFT} right={RIGHT} top={TOP} bottom={BOTTOM} h={H} axisLabel={axisLabel} message={empty ?? 'Nothing to show for these filters.'} xLabels={[]} xTitle={xTitle} /></svg>;
  }
  const { x, y, paths, ticks } = geo;
  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} tabIndex={0} onKeyDown={keys} onBlur={() => setHover(null)} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => <g key={t}><line x1={LEFT} x2={RIGHT} y1={y(t)} y2={y(t)} stroke={GRID} /><text x={LEFT - 8} y={y(t) + 4} fill={MUTED} fontSize="11" textAnchor="end">{decimals ? t.toFixed(decimals) : Math.round(t).toLocaleString('en')}</text></g>)}
        {labels.map((l, i) => i % labelStep === 0 && <text key={i} x={x(i)} y={H - 18} fill={MUTED} fontSize="11" textAnchor="middle">{l}</text>)}
        {xTitle && <text x={(LEFT + RIGHT) / 2} y={H - 3} fill={MUTED} fontSize="11" textAnchor="middle">{xTitle}</text>}
        <text x={12} y={(TOP + BOTTOM) / 2} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 12 ${(TOP + BOTTOM) / 2})`}>{axisLabel}</text>
        {series.map((s, k) => paths[k] ? <path key={`${id}${k}${signature}`} d={paths[k]} fill="none" stroke={s.colour} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="line-draw" /> : null)}
        {slots && series.map((s, k) => s.values.map((v, i) => v !== null && <circle key={`${k}-${i}`} cx={x(i)} cy={y(v)} r="3.5" fill={s.colour} className="line-draw-dot" />))}
        {hover !== null && <g pointerEvents="none"><line x1={x(hover)} x2={x(hover)} y1={TOP} y2={BOTTOM} stroke="rgba(255,255,255,.35)" />{series.map((s) => { const v = s.values[hover]; return v !== null && v !== undefined ? <circle key={s.name} cx={x(hover)} cy={y(v)} r="5" fill={s.colour} stroke="#1B1B1B" strokeWidth="2" /> : null; })}</g>}
        <rect x={LEFT} y={0} width={RIGHT - LEFT} height={H} fill="transparent" onPointerMove={locate} />
      </svg>
      {hover !== null && <ChartTip x={at.x} y={at.y}>{tip(hover)}</ChartTip>}
    </>
  );
}

/** Grouped bars: one group for each label, one bar of each player in it, growing up from the base. */
export function CompareBars({ series, labels, axisLabel, decimals = 0, label, tip, empty }: Props) {
  const n = labels.length;
  const { ref: boxRef, w: W, h: H } = useBox<SVGSVGElement>();
  const signature = `${n}:${series.map((s) => s.values.reduce<number>((a, v) => a + (v ?? 0), 0).toFixed(1)).join(':')}`;
  const { ref: playRef, played } = usePlayOnView<SVGSVGElement>(signature);
  const ref = useCallback((node: SVGSVGElement | null) => { playRef(node); boxRef(node); }, [playRef, boxRef]);
  const RIGHT = W - 16, BASE = H - 36;
  const { hover, setHover, at, locate, keys } = usePointer(n, true, W, RIGHT);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (all.length === 0) return <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${empty ?? 'Nothing to show for these filters.'}`}><EmptyPlot left={LEFT} right={RIGHT} top={TOP} bottom={BASE} h={H} axisLabel={axisLabel} message={empty ?? 'Nothing to show for these filters.'} xLabels={[]} /></svg>;
  const axis = niceAxis(Math.max(...all) * 1.05);
  const y = (v: number): number => BASE - (v / axis.top) * (BASE - TOP);
  const slot = (RIGHT - LEFT) / n, gap = slot * 0.18, bw = (slot - gap * 2) / series.length;
  // Too many bars for the width (a phone): the figures over the bars are left to the tooltip and the labels under them are thinned, so nothing prints over anything else.
  const crowded = slot < 20, every = crowded ? Math.ceil(30 / slot) : 1;
  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} tabIndex={0} onKeyDown={keys} onBlur={() => setHover(null)} onPointerLeave={() => setHover(null)}>
        {[0, 1, 2, 3].map((k) => { const v = k * axis.step; return <g key={k}><line x1={LEFT} x2={RIGHT} y1={y(v)} y2={y(v)} stroke={GRID} /><text x={LEFT - 8} y={y(v) + 4} fill={MUTED} fontSize="11" textAnchor="end">{decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('en')}</text></g>; })}
        <text x={12} y={(TOP + BASE) / 2} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 12 ${(TOP + BASE) / 2})`}>{axisLabel}</text>
        <g key={signature}>
          {labels.map((_, i) => series.map((s, k) => { const v = s.values[i]; return v === null || v === undefined ? null : <rect key={`${i}-${k}`} x={LEFT + i * slot + gap + k * bw + 1.5} y={y(v)} width={Math.max(2, bw - 3)} height={Math.max(0, BASE - y(v))} rx="3" fill={s.colour} opacity={hover === null || hover === i ? 1 : 0.55} className="bar-grow" style={{ transformOrigin: `center ${BASE}px` }} />; }))}
        </g>
        {labels.map((l, i) => (i % every === 0 ? <text key={i} x={LEFT + i * slot + slot / 2} y={H - 16} fill={MUTED} fontSize="11" textAnchor="middle">{l}</text> : null))}
        {!crowded && series.map((s, k) => labels.map((_, i) => { const v = s.values[i]; return v === null || v === undefined ? null : <text key={`v${i}-${k}`} x={LEFT + i * slot + gap + k * bw + bw / 2} y={y(v) - 5} className="bar-val" fill="#fff" fontSize="11" fontWeight="700" textAnchor="middle">{decimals ? v.toFixed(decimals) : Math.round(v)}</text>; }))}
        <rect x={LEFT} y={0} width={RIGHT - LEFT} height={H} fill="transparent" onPointerMove={locate} />
      </svg>
      {hover !== null && <ChartTip x={at.x} y={at.y}>{tip(hover)}</ChartTip>}
    </>
  );
}
