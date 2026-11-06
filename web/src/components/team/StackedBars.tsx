'use client';

import { useCallback, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ChartTip } from '../ChartTip';
import { useBox } from '../charts/useBox';
import { usePlayOnView } from '../charts/usePlayOnView';
import { niceAxis } from '@/domain/seasons';

const LEFT = 52, TOP = 14;
const GRID = 'rgba(255,255,255,.12)', MUTED = '#A8A8A8';

export interface Stack { values: number[]; colour: string; ink: string }

/** Stacked bars in the style of the player page's bar chart: faint grid, round tops, a label under every bar that fits, a tooltip and arrow keys. Each bar is a pile of segments from the base up. */
export function StackedBars({ stacks, labels, axisLabel, label, tip }: { stacks: readonly Stack[]; labels: readonly string[]; axisLabel: string; label: string; tip: (index: number) => ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const [at, setAt] = useState({ x: 0, y: 0 });
  const n = labels.length;
  const { ref: boxRef, w: W, h: H } = useBox<SVGSVGElement>();
  const RIGHT = W - 16, BASE = H - 34;
  const totals = useMemo(() => labels.map((_, i) => stacks.reduce((a, s) => a + (s.values[i] ?? 0), 0)), [labels, stacks]);
  const axis = useMemo(() => niceAxis(Math.max(0, ...totals)), [totals]);
  const slot = (RIGHT - LEFT) / Math.max(1, n);
  const y = (v: number): number => BASE - (v / axis.top) * (BASE - TOP);
  const signature = `${n}:${totals.reduce((a, v) => a + v, 0)}`;
  const { ref: playRef, played } = usePlayOnView<SVGSVGElement>(signature);
  const ref = useCallback((node: SVGSVGElement | null) => { playRef(node); boxRef(node); }, [playRef, boxRef]);
  const step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((RIGHT - LEFT) / 34))));

  function locate(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box) return;
    setHover(Math.max(0, Math.min(n - 1, Math.floor(((((e.clientX - box.left) / box.width) * W) - LEFT) / slot))));
    setAt({ x: e.clientX, y: e.clientY });
  }
  function keys(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((h) => Math.max(0, (h ?? n) - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => Math.min(n - 1, (h ?? -1) + 1)); }
    else if (e.key === 'Escape') setHover(null);
    const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    setAt({ x: box.left + box.width / 2, y: box.top });
  }

  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} tabIndex={0} onKeyDown={keys} onBlur={() => setHover(null)} onPointerLeave={() => setHover(null)}>
        {[0, 1, 2, 3].map((k) => (
          <g key={k}><line x1={LEFT} x2={RIGHT} y1={y(k * axis.step)} y2={y(k * axis.step)} stroke={GRID} /><text x={LEFT - 8} y={y(k * axis.step) + 4} fill={MUTED} fontSize="11" textAnchor="end">{Math.round(k * axis.step * 10) / 10}</text></g>
        ))}
        <text x={12} y={(TOP + BASE) / 2} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 12 ${(TOP + BASE) / 2})`}>{axisLabel}</text>
        <g key={signature}>
          {labels.map((_, i) => {
            let top = BASE;
            const x = LEFT + i * slot + Math.min(6, slot * 0.12), w = Math.max(2, slot - Math.min(12, slot * 0.24));
            return (
              <g key={i} opacity={hover === null || hover === i ? 1 : 0.55} className="bar-grow" style={{ transformOrigin: `0 ${BASE}px`, transformBox: 'view-box' }}>
                {stacks.map((s, k) => {
                  const v = s.values[i] ?? 0;
                  if (!v) return null;
                  const h = BASE - y(v);
                  top -= h;
                  return (
                    <g key={k}>
                      <rect x={x} y={top + 1} width={w} height={Math.max(1, h - 2)} rx="3" fill={s.colour} />
                      {h > 16 && w > 14 && <text x={x + w / 2} y={top + h / 2 + 4.5} fill={s.ink} fontSize="11" fontWeight="700" textAnchor="middle">{v}</text>}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
        {labels.map((l, i) => i % step === 0 && <text key={i} x={LEFT + i * slot + slot / 2} y={H - 14} fill={MUTED} fontSize="11" textAnchor="middle">{l}</text>)}
        <rect x={LEFT} y={0} width={RIGHT - LEFT} height={H} fill="transparent" onPointerMove={locate} />
      </svg>
      {hover !== null && <ChartTip x={at.x} y={at.y}>{tip(hover)}</ChartTip>}
    </>
  );
}
