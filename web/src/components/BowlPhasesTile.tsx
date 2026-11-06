import { usePlayOnView } from './charts/usePlayOnView';
import { CountUp } from './charts/CountUp';
import { bowlPhaseColumns, type BowlPhaseCounts } from '@/domain/bowling';
import type { PhaseFormat } from '@/domain/phases';

const int = new Intl.NumberFormat('en');

/**
 * The bowling Phases tile body, as in the player page mockup: a column per phase with the economy, how it compares with the whole slice, wickets, dot balls,
 * boundary balls and balls bowled. More than three columns (Tests) use the narrow card. Lower economy than the whole slice is the green tag.
 */
export function BowlPhasesBody({ rows, format, hundred, note }: { rows: readonly BowlPhaseCounts[]; format: PhaseFormat; hundred: boolean; note?: string }) {
  const columns = bowlPhaseColumns(rows, format, hundred);
  const { ref, played } = usePlayOnView<HTMLDivElement>(columns.map((c) => `${c.key}:${c.balls}:${c.economy}`).join('|'));
  const narrow = columns.length > 3;
  const total = rows.reduce((a, r) => ({ balls: a.balls + r.balls, conceded: a.conceded + r.conceded }), { balls: 0, conceded: 0 });
  const all = total.balls > 0 ? ((total.conceded / total.balls) * (hundred ? 5 : 6)).toFixed(2) : null;
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className={`phrow${played ? ' play' : ''}`} ref={ref} style={{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, 1fr)`, ...(narrow ? { gap: 8 } : {}) }}>
        {columns.map((c, i) => (
          <div className={`phc rise${narrow ? ' phs' : ''}`} key={`${c.key}:${c.balls}:${c.economy}`} style={{ animationDelay: `${i * 90}ms` }}>
            <h5>{c.name}</h5>
            {c.overs && <span className="g">{c.overs}</span>}
            <div className="big2">{c.economy === null ? '-' : <CountUp play={played} value={c.economy} format={(n) => n.toFixed(2)} />}</div>
            <span className="g">{hundred ? 'economy per 5 balls' : 'economy'}</span>
            {c.difference !== null && <div className={`dtag fade-in ${c.difference <= 0 ? 'up' : 'dn'}`} style={{ animationDelay: `${i * 90 + 600}ms` }}>{c.difference <= 0 ? '−' : '+'}{Math.abs(c.difference).toFixed(2)}{narrow || all === null ? '' : ` vs all ${all}`}</div>}
            <div className="pst"><span>Wickets</span><b><CountUp play={played} value={c.wickets} format={(n) => int.format(Math.round(n))} /></b></div>
            <div className="pst"><span>Dot balls</span><b>{c.dotShare === null ? '-' : <CountUp play={played} value={c.dotShare} format={(n) => `${Math.round(n)}%`} />}</b></div>
            <div className="pst"><span>Boundary balls</span><b>{c.boundaryShare === null ? '-' : <CountUp play={played} value={c.boundaryShare} format={(n) => `${Math.round(n)}%`} />}</b></div>
            <div className="pst"><span>Balls</span><b><CountUp play={played} value={c.balls} format={(n) => int.format(Math.round(n))} /></b></div>
          </div>
        ))}
      </div>
    </>
  );
}
