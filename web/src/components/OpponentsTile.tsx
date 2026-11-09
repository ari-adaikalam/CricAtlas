import { NameLink } from './NameLink';
import type { View } from '@/domain/ballFilters';
import { withAlpha } from '@/domain/colours';
import { opponentPhases, opponentRows, smallSample, sortOpponents, type OpponentCell, type OpponentSort } from '@/domain/opponents';
import type { PhaseFormat } from '@/domain/phases';
import { useChartColours } from './ChartColours';
import { CountText } from './charts/CountUp';
import { useFitRows } from './useFitRows';
import { REVEALED, useTableMotion } from './useTableMotion';
import { useWindowedRows } from './useWindowedRows';
import { usePhone } from './usePhone';

/** Short forms of the long headings for a phone, where a column is about 40 px wide (the full word is still the tooltip). */
const SHORT: Record<string, string> = { Average: 'Avg', Economy: 'Econ', 'Economy (5)': 'Econ (5)', Wickets: 'Wkts' };
const int = new Intl.NumberFormat('en');

/** Stands for the rows of a long table that are not drawn (useWindowedRows). */
function Spacer({ height, columns }: { height: number; columns: number }) {
  return height > 0 ? <tr data-spacer="" aria-hidden="true"><td colSpan={columns} style={{ height, padding: 0, border: 0 }} /></tr> : null;
}

interface Common {
  cells: readonly OpponentCell[];
  view: View;
  test: boolean;
  hundred: boolean;
  /** The opponent chosen in the filter bar, as a player id, or empty. */
  chosen: string;
  onPick: (id: string) => void;
  onShowAll: () => void;
}

function Note({ view, chosen, name, onShowAll }: { view: View; chosen: string; name: string | null; onShowAll: () => void }) {
  if (!chosen) return null;
  return <p className="onote">Showing only {name ?? 'one opponent'}, because the {view === 'bowl' ? 'Batter' : 'Bowler'} filter is set. <button type="button" className="clr" onClick={onShowAll}>Show all {view === 'bowl' ? 'batters' : 'bowlers'}</button></p>;
}

/**
 * The Bowlers (batting view) and Batters faced (bowling view) tile body: every opponent with balls, runs, outs, average, strike rate or economy, dot balls and
 * control. Pairings under the small sample line (30 balls in Tests, 12 elsewhere) are marked, not left out. Clicking a row sets the opponent filter.
 */
export function OpponentsBody({ cells, view, test, hundred, chosen, onPick, onShowAll, sort }: Common & { sort: OpponentSort }) {
  const bowl = view === 'bowl';
  const rows = sortOpponents(opponentRows(cells, view, test, hundred), sort);
  const line = smallSample(test);
  const fitRef = useFitRows<HTMLDivElement>(`${rows.length}:${sort}:${chosen}`);
  // The rows play in when the opponents change, and slide to their new places when only the sort changes.
  const win = useWindowedRows<HTMLDivElement>(rows.length, `${chosen}:${rows.length}`);
  const { ref, motion, played } = useTableMotion<HTMLDivElement>(`${rows.length}:${chosen}:${rows.reduce((a, r) => a + r.balls, 0)}`, rows.map((r) => r.id).join('|'), fitRef, win.ref);
  const phone = usePhone();
  const head: ReadonlyArray<readonly [string, string]> = [
    [bowl ? 'Batter' : 'Bowler', bowl ? 'The batter, with the batting hand' : 'The bowler, with the bowling style'],
    ['Balls', bowl ? 'Legal balls bowled to the batter' : 'Balls faced, wides not counted'],
    ['Runs', bowl ? 'Runs charged to the bowler, wides and no-balls included' : 'Runs off the bat'],
    [bowl ? 'Wickets' : 'Outs', 'Dismissals credited to the bowler. Run outs are not'],
    ['Average', bowl ? 'Runs conceded per wicket' : 'Runs per dismissal'],
    [bowl ? (hundred ? 'Economy (5)' : 'Economy') : 'Strike rate', bowl ? (hundred ? 'Runs per 5-ball over' : 'Runs per over') : 'Runs per 100 balls'],
    ['Dot balls', 'Share of balls with no run off the bat'],
    ['In control', 'Share of tracked balls where the shot was in control'],
  ];
  return (
    <div className="tsc" ref={ref} data-rows={motion}>
      <table className="cmp2 opt" style={{ tableLayout: 'fixed' }}>
        {/* Fixed widths: the same column stays the same under every sort. */}
        <colgroup>{head.map(([h], i) => <col key={h} style={{ width: i ? `${72 / (head.length - 1)}%` : '28%' }} />)}</colgroup>
        <thead><tr>{head.map(([h, hint], i) => <th key={h} title={hint} style={i ? undefined : { textAlign: 'left' }}>{phone ? (SHORT[h] ?? h) : h}</th>)}</tr></thead>
        <tbody>
          <Spacer height={win.before} columns={head.length} />
          {rows.slice(win.from, win.to).map((r, k) => (
            <tr key={r.id} data-rk={r.id} data-late={win.windowed && win.from + k >= REVEALED ? '' : undefined} className={`oprow${chosen === r.id ? ' on' : ''}`} tabIndex={0} title={`Click to show only ${r.name} in every tile`} onClick={() => onPick(r.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(r.id); } }}>
              <td style={{ textAlign: 'left' }}><b><NameLink entity={{ kind: 'player', id: r.id, name: r.name }}>{r.name}</NameLink></b><em>{[r.style, r.small ? `small sample, under ${line} balls` : null].filter(Boolean).join(', ')}</em></td>
              <td>{int.format(r.balls)}</td><td>{int.format(r.runs)}</td><td><b><CountText value={r.outs} format={(n) => int.format(Math.round(n))} play={played} /></b></td>
              <td>{r.average === null ? '-' : r.average.toFixed(1)}</td>
              <td>{r.rate === null ? '-' : bowl ? r.rate.toFixed(2) : r.rate.toFixed(0)}</td>
              <td>{r.dotShare === null ? '-' : `${r.dotShare}%`}</td>
              <td>{r.controlShare === null ? '-' : `${r.controlShare}%`}</td>
            </tr>
          ))}
          <Spacer height={win.after} columns={head.length} />
        </tbody>
      </table>
      <Note view={view} chosen={chosen} name={rows.find((r) => r.id === chosen)?.name ?? null} onShowAll={onShowAll} />
    </div>
  );
}

/**
 * The Opponents by phase tile body: every opponent with balls, most balls first, and the strike rate (economy for a bowler) and outs against each in every phase. A brighter
 * cell is a higher rate, on a scale taken from the cells that are not small samples. A cell under the small sample line is dimmed. A cell with no balls is empty.
 */
export function OpponentPhasesBody({ cells, view, test, hundred, chosen, onPick, onShowAll, format }: Common & { format: PhaseFormat }) {
  const { main } = useChartColours();
  const bowl = view === 'bowl';
  const line = smallSample(test);
  const heat = opponentPhases(cells, view, format, hundred, line);
  const fitRef = useFitRows<HTMLDivElement>(`${heat.rows.length}:${heat.columns.length}:${chosen}`);
  const win = useWindowedRows<HTMLDivElement>(heat.rows.length, `${chosen}:${heat.rows.length}:${heat.columns.length}`);
  const { ref, motion } = useTableMotion<HTMLDivElement>(`${heat.rows.length}:${heat.columns.length}:${chosen}`, heat.rows.map((r) => r.id).join('|'), fitRef, win.ref);
  const rate = bowl ? (hundred ? 'Econ (5)' : 'Econ') : 'SR';
  const outs = bowl ? 'Wkts' : 'Outs';
  return (
    <div className="tsc" ref={ref} data-rows={motion}>
      <table className="cmp2 hm hm3" style={{ tableLayout: 'fixed' }}>
        {/* Fixed column widths: with automatic widths the columns resized as the rows in view changed while scrolling. */}
        <colgroup><col style={{ width: '20%' }} />{heat.columns.flatMap((c) => [0, 1, 2].map((i) => <col key={`${c.key}${i}`} style={{ width: `${80 / (heat.columns.length * 3)}%` }} />))}</colgroup>
        <thead>
          <tr className="ph1"><th rowSpan={2} style={{ textAlign: 'left' }}>{bowl ? 'Batter' : 'Bowler'}</th>{heat.columns.map((c) => <th key={c.key} colSpan={3} className="grp">{c.name}</th>)}</tr>
          <tr className="ph2">{heat.columns.map((c) => [rate, outs, 'Balls'].map((h) => <th key={`${c.key}${h}`}>{h}</th>))}</tr>
        </thead>
        <tbody>
          <Spacer height={win.before} columns={1 + heat.columns.length * 3} />
          {heat.rows.slice(win.from, win.to).map((r, k) => (
            <tr key={r.id} data-rk={r.id} data-late={win.windowed && win.from + k >= REVEALED ? '' : undefined} className={`oprow${chosen === r.id ? ' on' : ''}`} tabIndex={0} title={`Click to show only ${r.name} in every tile`} onClick={() => onPick(r.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(r.id); } }}>
              <td style={{ textAlign: 'left' }}><b><NameLink entity={{ kind: 'player', id: r.id, name: r.name }}>{r.name}</NameLink></b></td>
              {heat.columns.map((c) => {
                const cell = r.cells[c.key];
                if (!cell || cell.rate === null) return [0, 1, 2].map((i) => <td key={`${c.key}${i}`} className={i === 0 ? 'grpstart' : undefined}>-</td>);
                const alpha = Math.min(0.8, Math.max(0.1, 0.1 + 0.7 * ((cell.rate - heat.min) / (heat.max - heat.min || 1))));
                const few = cell.balls < line;
                const note = few ? `${int.format(cell.balls)} ${cell.balls === 1 ? 'ball' : 'balls'}, a small sample (under ${line})` : undefined;
                return [
                  <td key={`${c.key}r`} className="grpstart" style={{ background: withAlpha(main, alpha), opacity: few ? 0.55 : undefined }} title={note}><b>{bowl ? cell.rate.toFixed(2) : cell.rate.toFixed(0)}</b></td>,
                  <td key={`${c.key}o`} style={{ opacity: few ? 0.55 : undefined }}><b>{cell.outs}</b></td>,
                  <td key={`${c.key}b`} className="mut" style={{ opacity: few ? 0.55 : undefined }}>{int.format(cell.balls)}</td>,
                ];
              })}
            </tr>
          ))}
          <Spacer height={win.after} columns={1 + heat.columns.length * 3} />
        </tbody>
      </table>
      <Note view={view} chosen={chosen} name={heat.rows.find((r) => r.id === chosen)?.name ?? null} onShowAll={onShowAll} />
    </div>
  );
}
