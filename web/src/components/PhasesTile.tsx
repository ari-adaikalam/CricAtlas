import { usePlayOnView } from './charts/usePlayOnView';
import { CountUp } from './charts/CountUp';
import { phaseColumns, type PhaseCounts, type PhaseFormat } from '@/domain/phases';

const int = new Intl.NumberFormat('en');

/** The Phases tile body, as in the player page mockup: a column per phase. More than three columns (Tests) use the narrow card. */
export function PhasesBody({ rows, format, note }: { rows: readonly PhaseCounts[]; format: PhaseFormat; note?: string }) {
  const hundred = rows.some((r) => r.key === 'rest') && !rows.some((r) => r.key === 'middle' || r.key === 'death');
  const columns = phaseColumns(rows, format, hundred);
  const { ref, played } = usePlayOnView<HTMLDivElement>(columns.map((c) => `${c.key}:${c.balls}:${c.strikeRate}`).join('|'));
  const narrow = columns.length > 3;
  const overall = rows.reduce((a, r) => ({ balls: a.balls + r.balls, runs: a.runs + r.runs }), { balls: 0, runs: 0 });
  const all = overall.balls > 0 ? Math.round((overall.runs / overall.balls) * 100) : null;
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className={`phrow${played ? ' play' : ''}`} ref={ref} style={{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, 1fr)`, ...(narrow ? { gap: 8 } : {}) }}>
        {columns.map((c, i) => (
          <div className={`phc rise${narrow ? ' phs' : ''}`} key={`${c.key}:${c.balls}:${c.strikeRate}`} style={{ animationDelay: `${i * 90}ms` }}>
            <h5>{c.name}</h5>
            {c.overs && <span className="g">{c.overs}</span>}
            <div className="big2">{c.strikeRate === null ? '-' : <CountUp play={played} value={c.strikeRate} format={(n) => String(Math.round(n))} />}</div>
            <span className="g">strike rate</span>
            {c.difference !== null && <div className={`dtag fade-in ${c.difference >= 0 ? 'up' : 'dn'}`} style={{ animationDelay: `${i * 90 + 600}ms` }}>{c.difference >= 0 ? '+' : '−'}{Math.abs(c.difference)}{narrow || all === null ? '' : ` vs all ${all}`}</div>}
            <div className="pst"><span>Average</span><b>{c.average === null ? '-' : <CountUp play={played} value={c.average} format={(n) => n.toFixed(1)} />}</b></div>
            <div className="pst"><span>Dot balls</span><b>{c.dotShare === null ? '-' : <CountUp play={played} value={c.dotShare} format={(n) => `${Math.round(n)}%`} />}</b></div>
            <div className="pst"><span>Boundary balls</span><b>{c.boundaryShare === null ? '-' : <CountUp play={played} value={c.boundaryShare} format={(n) => `${Math.round(n)}%`} />}</b></div>
            <div className="pst"><span>Balls</span><b><CountUp play={played} value={c.balls} format={(n) => int.format(Math.round(n))} /></b></div>
          </div>
        ))}
      </div>
    </>
  );
}
