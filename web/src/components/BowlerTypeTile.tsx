import { useMemo, useState, type PointerEvent, type ReactNode } from 'react';
import { ChartTip } from './ChartTip';
import { barHalfRange, typeRows } from '@/domain/bowlerType';
import type { TypeCounts } from '@/domain/bowlerType';
import { usePlayOnView } from './charts/usePlayOnView';
import { TipBody } from './TipBody';

const int = new Intl.NumberFormat('en');

/**
 * The Bowler type tile body (Ari, 2026-10-26: the dot plot on a 60 to 260 scale could not be read, so a bar for each bowler type replaces it at every size). The line down the middle is the batter's strike rate
 * against all bowlers. A bar goes right (white) when the batter scores faster against that type and left (orange) when slower, with the rate and the gap printed, the biggest gap first. One type with a few balls
 * and a huge gap would flatten the rest, so the bars reach only as far as barHalfRange says and a longer one is drawn to the edge, faded, with its number still printed.
 * The bars grow out from the line when the tile comes into view.
 */
export function BowlerTypeBody({ counts, note }: { counts: readonly TypeCounts[]; note?: string }) {
  const { rows, overall } = useMemo(() => typeRows(counts), [counts]);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.difference - a.difference), [rows]);
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const { ref, played } = usePlayOnView<HTMLDivElement>(rows.map((r) => `${r.style}:${r.balls}`).join('|'));
  if (overall === null || rows.length === 0) return <div className="thin">No balls against a bowler with a recorded type in this slice.</div>;
  const half = barHalfRange(sorted.map((r) => r.difference));
  const showTip = (e: PointerEvent, r: (typeof sorted)[number]): void => {
    setTip({ x: e.clientX, y: e.clientY, body: <TipBody title={r.label} rows={[{ label: 'Strike rate', value: r.strikeRate.toFixed(0) }, { label: 'Against all bowlers', value: `${overall.toFixed(0)} (${r.difference >= 0 ? '+' : '\u2212'}${Math.abs(Math.round(r.difference))})` }, { label: 'Runs', value: int.format(r.runs) }, { label: 'Balls', value: int.format(r.balls) }, { label: 'Dismissals', value: int.format(r.outs) }]} /> });
  };
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className={`tb${played ? ' play' : ''}`} ref={ref} onPointerLeave={() => setTip(null)}>
        <div className="tbh">Strike rate against each type. The line is all bowlers, <b>{Math.round(overall)}</b>.</div>
        <div className="tbrows">
          {sorted.map((r) => {
            const gap = Math.round(r.difference), cut = Math.abs(r.difference) > half, width = Math.min(1, Math.abs(r.difference) / half) * 50;
            return (
              <div className="tbrow" key={r.style} onPointerMove={(e) => showTip(e, r)}>
                <div className="tbname"><b>{r.label}</b><span>{int.format(r.balls)} balls</span></div>
                <div className="tbtrack">
                  <i className="tbmid" />
                  <i className={`tbbar ${r.difference >= 0 ? 'up' : 'dn'}${cut ? ' cut' : ''}`} style={{ left: r.difference >= 0 ? '50%' : `${50 - width}%`, width: `${width}%` }} />
                </div>
                <div className="tbval"><b>{Math.round(r.strikeRate)}</b><span>{gap >= 0 ? '+' : '\u2212'}{Math.abs(gap)}</span></div>
              </div>
            );
          })}
        </div>
      </div>
      {tip && <ChartTip x={tip.x} y={tip.y}>{tip.body}</ChartTip>}
    </>
  );
}
