'use client';

import { ChartTip } from '../ChartTip';
import { useCallback, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { usePlayOnView } from './usePlayOnView';
import { useBox } from './useBox';
import { EmptyPlot } from './EmptyPlot';
import { niceAxis } from '@/domain/seasons';

// The bar chart of the player page mockup. It draws into the size of its tile like the line chart (600 by 160 until measured): a faint grid with four y values, bars with round tops, a label under every other bar.
// The bars grow up from their baseline when they appear and again when the data changes. A tooltip names the bar under the pointer, and the arrow keys move it.

const LEFT = 52, TOP = 12;
const GRID = 'rgba(255,255,255,.12)', MUTED = '#A8A8A8';

interface Props {
  values: readonly number[];
  labels: readonly string[];
  colour: string;
  axisLabel: string;
  /** Names the chart for screen readers. */
  label: string;
  tip: (index: number) => ReactNode;
  /** A title under the labels. */
  xTitle?: string;
  /** A colour for each bar, instead of the one colour. */
  barColours?: readonly string[];
  /** A dashed line across the chart at a value, such as an average. */
  reference?: { value: number; label: string };
  /** Said over the plot when every value is 0 (a bowler with no wicket in these years), so the empty plot is not mistaken for missing data. */
  zero?: string;
}

export function BarChart({ values, labels, colour, axisLabel, label, tip, xTitle, barColours, reference, zero }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [at, setAt] = useState({ x: 0, y: 0 });
  const n = values.length;
  const { ref: boxRef, w: W, h: H } = useBox<SVGSVGElement>();
  const RIGHT = W - 16, BASE = H - 40;
  const axis = useMemo(() => niceAxis(Math.max(0, reference?.value ?? 0, ...values)), [values, reference]);
  const slot = (RIGHT - LEFT) / Math.max(1, n);
  const y = (v: number): number => BASE - (v / axis.top) * (BASE - TOP);
  const signature = `${n}:${values.reduce((a, v) => a + v, 0)}`;
  const { ref: playRef, played } = usePlayOnView<SVGSVGElement>(signature);
  const ref = useCallback((node: SVGSVGElement | null) => { playRef(node); boxRef(node); }, [playRef, boxRef]);

  function locate(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.floor((vx - LEFT) / slot))));
    setAt({ x: e.clientX, y: e.clientY });
  }
  function keys(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((h) => Math.max(0, (h ?? n) - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => Math.min(n - 1, (h ?? -1) + 1)); }
    else if (e.key === 'Escape') setHover(null);
    const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    setAt({ x: box.left + box.width / 2, y: box.top });
  }

  if (n > 0 && values.every((v) => v === 0)) {
    const say = zero ?? 'Every value here is 0 for these filters.';
    return (
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${say}`}>
        <EmptyPlot left={LEFT} right={RIGHT} top={TOP} bottom={BASE} h={H} axisLabel={axisLabel} message={say} xLabels={labels.flatMap((l, i) => (n <= 4 || i % 2 === 0 ? [{ x: LEFT + i * slot + slot / 2, text: l }] : []))} xTitle={xTitle} />
      </svg>
    );
  }

  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} tabIndex={0} onKeyDown={keys} onBlur={() => setHover(null)} onPointerLeave={() => setHover(null)}>
        {[0, 1, 2, 3].map((k) => {
          const v = k * axis.step;
          return (
            <g key={k}>
              <line x1={LEFT} x2={RIGHT} y1={y(v)} y2={y(v)} stroke={GRID} />
              <text x={LEFT - 8} y={y(v) + 4} fill={MUTED} fontSize="11" textAnchor="end">{Math.round(v * 10) / 10}</text>
            </g>
          );
        })}
        <text x={12} y={(TOP + BASE) / 2} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 12 ${(TOP + BASE) / 2})`}>{axisLabel}</text>
        <g key={signature}>
          {values.map((v, i) => (
            <rect key={i} x={LEFT + i * slot + 4} y={y(v)} width={Math.max(2, slot - 8)} height={Math.max(0, BASE - y(v))} rx="3" fill={barColours?.[i] ?? colour} opacity={hover === null || hover === i ? 1 : 0.55} className="bar-grow" style={{ transformOrigin: `0 ${BASE}px`, transformBox: 'view-box' }} />
          ))}
        </g>
        {reference && <g pointerEvents="none"><line x1={LEFT} x2={RIGHT} y1={y(reference.value)} y2={y(reference.value)} stroke="#fff" strokeDasharray="5 4" /><text x={RIGHT} y={y(reference.value) - 6} fill="#fff" fontSize="12" textAnchor="end">{reference.label}</text></g>}
        {labels.map((l, i) => (n <= 4 || i % 2 === 0) && <text key={i} x={LEFT + i * slot + slot / 2} y={H - 18} fill={MUTED} fontSize="11" textAnchor="middle">{l}</text>)}
        {xTitle && <text x={(LEFT + RIGHT) / 2} y={H - 3} fill={MUTED} fontSize="11" textAnchor="middle">{xTitle}</text>}
        <rect x={LEFT} y={0} width={RIGHT - LEFT} height={H} fill="transparent" onPointerMove={locate} />
      </svg>
      {hover !== null && <ChartTip x={at.x} y={at.y}>{tip(hover)}</ChartTip>}
    </>
  );
}
