import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ChartTip } from './ChartTip';
import { shotsByType, type ShotTypeCounts } from '@/domain/bowlerType';
import { withAlpha } from '@/domain/colours';
import { smallSample } from '@/domain/opponents';
import { useChartColours } from './ChartColours';
import { usePlayOnView } from './charts/usePlayOnView';
import { useFitRows } from './useFitRows';
import { TipBody } from './TipBody';

const int = new Intl.NumberFormat('en');

export type ShotsByTypeMode = 'share' | 'rate';

/** The header switch of the tile: the share of balls each shot was played on, or its strike rate. */
export function ShotsByTypeSwitch({ value, onChange }: { value: ShotsByTypeMode; onChange: (next: ShotsByTypeMode) => void }) {
  return (
    <span className="sw msw">
      {([['share', 'Share'], ['rate', 'Strike rate']] as const).map(([key, label]) => <button key={key} type="button" className={value === key ? 'on' : undefined} onClick={() => onChange(key)}>{label}</button>)}
    </span>
  );
}

/**
 * The Shots by bowler type tile body, as in the player page mockup: the nine most common shots and Other shots against the five bowler types with most tracked balls.
 * A brighter cell is a larger share of the balls against that type, or a higher strike rate. A cell under the small sample line (30 balls in Tests, 12 elsewhere) is dimmed,
 * since a strike rate from a handful of balls says little.
 */
export function ShotsByTypeBody({ counts, mode, test, note }: { counts: readonly ShotTypeCounts[]; mode: ShotsByTypeMode; test: boolean; note?: string }) {
  const { main } = useChartColours();
  const table = useMemo(() => shotsByType(counts), [counts]);
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const { ref: playRef, played } = usePlayOnView<HTMLDivElement>(`${mode}:${counts.length}:${counts.reduce((a, r) => a + r.balls, 0)}`);
  const fitRef = useFitRows<HTMLDivElement>(`${mode}:${table.rows.length}`);
  const ref = useCallback((node: HTMLDivElement | null) => { playRef(node); fitRef(node); }, [playRef, fitRef]);
  if (table.rows.length === 0 || table.columns.length === 0) return <div className="thin">No tracked shots against a bowler with a recorded type in this slice.</div>;
  const value = (c: { share: number | null; strikeRate: number | null }): number | null => (mode === 'share' ? c.share : c.strikeRate);
  const all = table.rows.flatMap((r) => table.columns.map((c) => value(r.cells[c.style] ?? { share: null, strikeRate: null }))).filter((v): v is number => v !== null);
  const lo = Math.min(...all), hi = Math.max(...all);
  const line = smallSample(test);
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className={`tsc shtab${played ? ' play' : ''}`} ref={ref} onPointerLeave={() => setTip(null)}>
        <table className="cmp2 hm">
          <thead><tr><th style={{ textAlign: 'left' }}>Shot</th>{table.columns.map((c) => <th key={c.style} title={`${int.format(c.balls)} tracked balls`}>{c.label}</th>)}</tr></thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={r.key}>
                <td style={{ textAlign: 'left' }}>{r.label}</td>
                {table.columns.map((c) => {
                  const cell = r.cells[c.style];
                  const v = cell ? value(cell) : null;
                  if (!cell || v === null) return <td key={c.style}>-</td>;
                  const alpha = 0.1 + 0.7 * ((v - lo) / (hi - lo || 1));
                  const few = cell.balls < line;
                  return (
                    <td key={c.style} className="fade-in" style={{ background: withAlpha(main, alpha), ['--dim' as string]: few ? 0.55 : undefined, animationDelay: `${i * 40}ms` }}
                      onPointerMove={(e) => setTip({ x: e.clientX, y: e.clientY, body: <TipBody title={`${r.label} v ${c.label.toLowerCase()}`} rows={[{ label: 'Share of tracked balls', value: `${(cell.share ?? 0).toFixed(1)}%` }, { label: 'Strike rate', value: (cell.strikeRate ?? 0).toFixed(0) }, { label: 'Balls', value: int.format(cell.balls) }]} note={few ? `Under ${line} balls, a small sample` : undefined} /> })}>
                      {mode === 'share' ? `${v.toFixed(0)}%` : v.toFixed(0)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tip && <ChartTip x={tip.x} y={tip.y}>{tip.body}</ChartTip>}
    </>
  );
}
