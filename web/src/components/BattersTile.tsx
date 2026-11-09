import type { BowlBatters } from '@/data/bowlBatters';
import { handRows, orderRows, type SplitRow } from '@/domain/bowling';
import { CountText } from './charts/CountUp';
import { useFitRows } from './useFitRows';
import { useTableMotion } from './useTableMotion';

const int = new Intl.NumberFormat('en');

function Table({ title, first, rows, hundred, played }: { title: string; first: string; rows: readonly SplitRow[]; hundred: boolean; played: boolean }) {
  return (
    <>
      <h5 className="sub">{title}</h5>
      <table className="cmp2" style={{ tableLayout: 'fixed' }}>
        {/* The same widths in both tables, so Balls, Runs and the rest stand in one column from the top table to the bottom one. */}
        <colgroup><col style={{ width: '34%' }} />{Array.from({ length: 6 }, (_, i) => <col key={i} style={{ width: '11%' }} />)}</colgroup>
        <thead>
          <tr><th style={{ textAlign: 'left' }}>{first}</th><th>Balls</th><th>Runs</th><th>{hundred ? 'Econ (5)' : 'Econ'}</th><th>Wkts</th><th>Avg</th><th>Dot</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-rk={r.key}>
              <td style={{ textAlign: 'left' }}>{r.name}</td>
              <td>{int.format(r.balls)}</td><td>{int.format(r.conceded)}</td>
              <td>{r.economy === null ? '-' : r.economy.toFixed(2)}</td>
              <td><b><CountText value={r.wickets} format={(n) => int.format(Math.round(n))} play={played} /></b></td>
              <td>{r.average === null ? '-' : r.average.toFixed(1)}</td>
              <td>{r.dotShare === null ? '-' : `${r.dotShare}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * The bowling Batters tile body, as in the player page mockup: two tables of balls, runs, economy, wickets, average and dot balls, against right and left
 * handers and against each part of the batting order. A hand or batter chosen above narrows both, because the tile reads the same balls as every other.
 */
export function BattersBody({ data, hundred, note }: { data: BowlBatters; hundred: boolean; note?: string }) {
  const per = hundred ? 5 : 6;
  const hand = handRows(data.hand, per), order = orderRows(data.order, per);
  const key = `${hand.length}:${order.length}:${hand.reduce((a, r) => a + r.balls, 0)}:${order.reduce((a, r) => a + r.balls, 0)}`;
  const fitRef = useFitRows<HTMLDivElement>(key);
  const { ref, motion, played } = useTableMotion<HTMLDivElement>(key, key, fitRef);
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className="tsc" ref={ref} data-rows={motion}>
        <Table title="By hand" first="Batters" rows={hand} hundred={hundred} played={played} />
        <Table title="By batting order" first="Batters" rows={order} hundred={hundred} played={played} />
      </div>
    </>
  );
}
