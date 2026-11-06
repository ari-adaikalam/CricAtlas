'use client';

import { ChartTip } from '../ChartTip';
import { usePlayOnView } from './usePlayOnView';
import { useBox } from './useBox';
import { EmptyPlot } from './EmptyPlot';
import { useCallback, useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

// The line chart of the player page mockup. It draws into the size of its tile (a viewBox of the measured pixels, so it fills the tile and the text keeps its size), 600 by 160 until measured: a faint grid with four y values, a thick line, and a label under every fifth point.
// The line draws from left to right when it appears and again when the data changes. A tooltip shows the point under the pointer, and the arrow keys
// move it for keyboard use (every chart is animated and has a tooltip).

const LEFT = 52, TOP = 12;
const GRID = 'rgba(255,255,255,.12)', MUTED = '#A8A8A8';

interface Props {
  /** One value per point, oldest first. null leaves a gap. */
  values: ReadonlyArray<number | null>;
  colour: string;
  /** The label at the left, such as Avg. */
  axisLabel: string;
  /** Decimals on the y values. */
  decimals: number;
  /** Names the chart for screen readers. */
  label: string;
  /** What the tooltip shows for a point. */
  tip: (index: number) => ReactNode;
  /** Labels under the points. Without them the points are innings and the label is #5, #10 and so on. */
  labels?: readonly string[];
  /** Label every nth point (the last one too when the labels are innings). */
  labelStep?: number;
  /** Put each point at the middle of an equal slot, as bars do, and mark every point with a dot. */
  slots?: boolean;
  /** A shaded band behind the line, one entry per point (null leaves a gap). Its edges count when the axis is worked out. */
  band?: ReadonlyArray<{ low: number; high: number } | null>;
  /** A title under the labels, such as 'Balls bowled in the innings'. */
  xTitle?: string;
  /** Said in the chart's place when there is no value to draw at all (an average with no wicket). */
  empty?: string;
  /** A fixed axis, such as 0 to 100 for a percentage, instead of one fitted to the values. */
  domain?: readonly [number, number];
}

const nice = (n: number, decimals: number): string => n.toFixed(decimals);

export function LineChart({ values, colour, axisLabel, decimals, label, tip, labels, labelStep, slots, band, xTitle, empty, domain }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [at, setAt] = useState({ x: 0, y: 0 });
  const id = useId();
  const signatureKey = `${values.length}:${values.reduce<number>((a, v) => a + (v ?? 0), 0).toFixed(2)}`;
  const { ref: playRef, played } = usePlayOnView<SVGSVGElement>(signatureKey);
  const { ref: boxRef, w: W, h: H } = useBox<SVGSVGElement>();
  const ref = useCallback((node: SVGSVGElement | null) => { playRef(node); boxRef(node); }, [playRef, boxRef]);
  const RIGHT = W - 16, BOTTOM = H - 32;
  const n = values.length;
  const present = values.filter((v): v is number => v !== null);

  const geometry = useMemo(() => {
    if (present.length === 0) return null;
    // Room above and below the line, as in the mockup: the top is 15 percent over the highest value and the bottom 20 percent under the lowest.
    const edges = [...present, ...(band ?? []).flatMap((b) => (b ? [b.low, b.high] : []))];
    // Every value 0 (no runs in any innings) would give four ticks at 0 and a flat axis, so the axis runs from 0 to 1.
    const high = domain ? domain[1] : Math.max(...edges) * 1.15, min = domain ? domain[0] : Math.min(...edges) * 0.8, max = high > min ? high : min + 1;
    const x = (i: number): number => (slots ? LEFT + ((i + 0.5) * (RIGHT - LEFT)) / n : LEFT + (n <= 1 ? (RIGHT - LEFT) / 2 : (i * (RIGHT - LEFT)) / (n - 1)));
    const y = (v: number): number => BOTTOM + ((v - min) * (TOP - BOTTOM)) / (max - min || 1);
    const ticks = [min, (min * 2 + max) / 3, (min + max * 2) / 3, max];
    let d = '', pen = false;
    values.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `; pen = true; });
    // The band is one closed shape: along the top edge, then back along the bottom edge. A gap in the band ends the shape.
    let area = '';
    if (band) {
      let run: number[] = [];
      const close = () => { if (run.length > 0) { area += `M${run.map((i) => `${x(i).toFixed(1)} ${y(band[i]!.high).toFixed(1)}`).join(' L')} L${[...run].reverse().map((i) => `${x(i).toFixed(1)} ${y(band[i]!.low).toFixed(1)}`).join(' L')} Z `; run = []; } };
      band.forEach((b, i) => { if (b) run.push(i); else close(); });
      close();
    }
    return { x, y, ticks, d: d.trim(), area: area.trim() };
  }, [values, n, present, slots, band, RIGHT, BOTTOM, domain]);

  if (!geometry) {
    const say = empty ?? 'Nothing to show for these filters.';
    const at = (i: number): number => (slots ? LEFT + ((i + 0.5) * (RIGHT - LEFT)) / n : LEFT + (n <= 1 ? (RIGHT - LEFT) / 2 : (i * (RIGHT - LEFT)) / (n - 1)));
    const xLabels = values.flatMap((_, i) => ((labels ? i % (labelStep ?? 1) === 0 : (i + 1) % 5 === 0 || i === n - 1) ? [{ x: at(i), text: labels ? labels[i] ?? '' : `#${i + 1}` }] : []));
    return (
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${say}`}>
        <EmptyPlot left={LEFT} right={RIGHT} top={TOP} bottom={BOTTOM} h={H} axisLabel={axisLabel} message={say} xLabels={xLabels} xTitle={xTitle} />
      </svg>
    );
  }
  const { x, y, ticks, d, area } = geometry;
  // A new key restarts the draw whenever the data changes.
  const signature = `${n}:${present.length}:${present[0]?.toFixed(2)}:${present[present.length - 1]?.toFixed(2)}`;

  function locate(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    const i = slots ? Math.floor(((vx - LEFT) / (RIGHT - LEFT)) * n) : n <= 1 ? 0 : Math.round(((vx - LEFT) / (RIGHT - LEFT)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
    setAt({ x: e.clientX, y: e.clientY });
  }
  function keys(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((h) => Math.max(0, (h ?? n) - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => Math.min(n - 1, (h ?? -1) + 1)); }
    else if (e.key === 'Escape') setHover(null);
    const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    setAt({ x: box.left + box.width / 2, y: box.top });
  }
  const hv = hover !== null ? values[hover] ?? null : null;

  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} tabIndex={0} onKeyDown={keys} onBlur={() => setHover(null)} onPointerLeave={() => setHover(null)}>
        {ticks.map((t, k) => (
          <g key={k}>
            <line x1={LEFT} x2={RIGHT} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={LEFT - 8} y={y(t) + 4} fill={MUTED} fontSize="11" textAnchor="end">{nice(t, decimals)}</text>
          </g>
        ))}
        {values.map((_, i) => (labels ? i % (labelStep ?? 1) === 0 : (i + 1) % 5 === 0 || i === n - 1) && <text key={i} x={x(i)} y={H - 18} fill={MUTED} fontSize="11" textAnchor="middle">{labels ? labels[i] : `#${i + 1}`}</text>)}
        {xTitle && <text x={(LEFT + RIGHT) / 2} y={H - 3} fill={MUTED} fontSize="11" textAnchor="middle">{xTitle}</text>}
        <text x={12} y={(TOP + BOTTOM) / 2} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 12 ${(TOP + BOTTOM) / 2})`}>{axisLabel}</text>
        {area && <path d={area} fill={colour} fillOpacity=".22" className="band-fade" />}
        <path key={`${id}${signature}`} d={d} fill="none" stroke={colour} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="line-draw" />
        {slots && values.map((v, i) => v !== null && <circle key={`d${i}`} cx={x(i)} cy={y(v)} r="3.5" fill={colour} className="line-draw-dot" />)}
        {hover !== null && hv !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={BOTTOM} stroke="rgba(255,255,255,.35)" />
            <circle cx={x(hover)} cy={y(hv)} r="5" fill={colour} stroke="#1B1B1B" strokeWidth="2" />
          </g>
        )}
        <rect x={LEFT} y={0} width={RIGHT - LEFT} height={H} fill="transparent" onPointerMove={locate} />
      </svg>
      {hover !== null && hv !== null && <ChartTip x={at.x} y={at.y}>{tip(hover)}</ChartTip>}
    </>
  );
}
