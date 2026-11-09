import { useMemo } from 'react';
import { shotMixByPhase, shotMixRows, type ShotMixCell } from '@/domain/shotMix';
import type { PhaseFormat } from '@/domain/phases';
import { CountText } from './charts/CountUp';
import { useFitRows } from './useFitRows';
import { useTableMotion } from './useTableMotion';

const int = new Intl.NumberFormat('en');

export type ShotMixMode = 'career' | 'phase';

/** The header switch: all the balls together, or split by phase. It is left out when a Phase filter is set, since there is then one phase. */
export function ShotMixSwitch({ value, onChange }: { value: ShotMixMode; onChange: (next: ShotMixMode) => void }) {
  return (
    <span className="sw msw">
      {([['career', 'Career'], ['phase', 'By phase']] as const).map(([key, label]) => <button key={key} type="button" className={value === key ? 'on' : undefined} onClick={() => onChange(key)}>{label}</button>)}
    </span>
  );
}

/**
 * The Shot mix tile body, as in the player page mockup: a row for every shot the batter played, with balls, runs, strike rate, in control and out. By phase shows
 * the balls and strike rate of each shot in each phase instead. Shots use the tracking's labels, so only tracked balls are in it.
 */
export function ShotMixBody({ cells, mode, format, note }: { cells: readonly ShotMixCell[]; mode: ShotMixMode; format: PhaseFormat; note?: string }) {
  // The Hundred has a Powerplay and a Rest of innings and no Middle or Death.
  const hundred = cells.some((c) => c.key === 'rest') && !cells.some((c) => c.key === 'middle' || c.key === 'death');
  const rows = useMemo(() => shotMixRows(cells), [cells]);
  const phased = useMemo(() => shotMixByPhase(cells, format, hundred), [cells, format, hundred]);
  const fitRef = useFitRows<HTMLDivElement>(`${mode}:${rows.length}`);
  const { ref, motion, played } = useTableMotion<HTMLDivElement>(`${mode}:${rows.length}:${rows.reduce((a, r) => a + r.runs, 0)}`, `${mode}:${rows.map((r) => r.shot).join('|')}`, fitRef);
  if (rows.length === 0) return <div className="thin">No tracked shots in this slice.</div>;
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className="tsc tscx" ref={ref} data-rows={motion}>
        {mode === 'career' ? (
          <table className="cmp2 opt">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }} title="The label recorded for the shot">Shot</th>
                <th title="Balls faced with this shot played, wides not counted">Balls</th>
                <th title="Runs off the bat from this shot">Runs</th>
                <th title="Runs per 100 balls">Strike rate</th>
                <th title="Share of the balls with a control reading on which the shot was in control">In control</th>
                <th title="Times the batter was out on a ball with this shot">Out</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.shot} data-rk={r.shot}>
                  <td style={{ textAlign: 'left' }}>{r.label}</td>
                  <td>{int.format(r.balls)}</td><td><b><CountText value={r.runs} format={(n) => int.format(Math.round(n))} play={played} /></b></td>
                  <td>{r.strikeRate === null ? '-' : r.strikeRate.toFixed(0)}</td>
                  <td>{r.control === null ? '-' : `${r.control}%`}</td>
                  <td>{int.format(r.outs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="cmp2 hm3 sm2">
            <thead>
              <tr className="ph1"><th rowSpan={2} style={{ textAlign: 'left' }}>Shot</th>{phased.columns.map((c) => <th key={c.key} colSpan={5} className="grp">{c.name}</th>)}</tr>
              <tr className="ph2">{phased.columns.map((c) => ([['Balls', 'Balls faced with this shot in the phase'], ['Runs', 'Runs off the bat'], ['Strike rate', 'Runs per 100 balls'], ['In control', 'Share of balls with a control reading that were in control'], ['Out', 'Times the batter was out on a ball with this shot']] as const).map(([h, hint]) => <th key={`${c.key}${h}`} title={hint}>{h}</th>))}</tr>
            </thead>
            <tbody>
              {phased.rows.map((r) => (
                <tr key={r.shot} data-rk={r.shot}>
                  <td style={{ textAlign: 'left' }} title={r.label}>{r.label}</td>
                  {phased.columns.map((c) => {
                    const cell = r.cells[c.key];
                    const none = !cell || cell.balls === 0;
                    return [
                      <td key={`${c.key}b`} className="grpstart">{none ? '-' : int.format(cell.balls)}</td>,
                      <td key={`${c.key}r`}>{none ? '-' : <b>{int.format(cell.runs)}</b>}</td>,
                      <td key={`${c.key}s`}>{none || cell.strikeRate === null ? '-' : cell.strikeRate.toFixed(0)}</td>,
                      <td key={`${c.key}c`}>{none || cell.control === null ? '-' : `${cell.control}%`}</td>,
                      <td key={`${c.key}o`}>{none ? '-' : int.format(cell.outs)}</td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
