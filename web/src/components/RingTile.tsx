'use client';

import { ChartTip } from './ChartTip';
import { useMemo, useState, type ReactNode } from 'react';
import type { Shot } from '@/domain/shots';
import { ringBands } from '@/domain/ring';
import { useChartColours } from './ChartColours';
import { usePlayOnView } from './charts/usePlayOnView';
import { TipBody } from './TipBody';

const int = new Intl.NumberFormat('en');

/**
 * The Ring tile body, as in the player page mockup: the share of the runs inside and outside the 30 yard ring as one bar, then the four distance bands with their
 * runs, balls and strike rate. The bars grow when the tile comes into view. Balls are every ball with a position, dot balls too, so a strike rate is runs over balls.
 */
export function RingBody({ balls, note }: { balls: readonly Shot[]; note?: string }) {
  const { main } = useChartColours();
  const { bands, insideShare, runs } = useMemo(() => ringBands(balls), [balls]);
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const { ref, played } = usePlayOnView<HTMLDivElement>(`${balls.length}:${runs}`);
  if (balls.length === 0) return <div className="thin">No balls with a position in this slice.</div>;
  const top = Math.max(1, ...bands.map((b) => b.runs));
  const inside = Math.round(insideShare * 100);
  const show = (e: { clientX: number; clientY: number }, body: ReactNode) => setTip({ x: e.clientX, y: e.clientY, body });
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className={`ringtile${played ? ' play' : ''}`} ref={ref} onPointerLeave={() => setTip(null)}>
        <div className="rsub">Share of runs: <b>{inside}%</b> inside the ring, <b>{100 - inside}%</b> outside</div>
        <div className="rsplit">
          <i className="rin" style={{ width: `${insideShare * 100}%`, background: main }}
            onPointerMove={(e) => show(e, <TipBody title="Inside the ring" rows={[{ label: 'Runs', value: int.format(bands[0]!.runs) }, { label: 'Share of runs', value: `${(insideShare * 100).toFixed(1)}%` }]} />)}>
            {insideShare > 0.3 ? `Inside the ring ${inside}%` : ''}
          </i>
          <i className="rout" style={{ width: `${(1 - insideShare) * 100}%`, background: main }}
            onPointerMove={(e) => show(e, <TipBody title="Outside the ring" rows={[{ label: 'Runs', value: int.format(runs - bands[0]!.runs) }, { label: 'Share of runs', value: `${((1 - insideShare) * 100).toFixed(1)}%` }]} />)}>
            {1 - insideShare > 0.3 ? `Outside the ring ${100 - inside}%` : ''}
          </i>
        </div>
        <div className="rrows">
          {bands.map((b, i) => (
            <div className="rrow" key={b.key} onPointerMove={(e) => show(e, <TipBody title={b.label} rows={[{ label: 'Runs', value: int.format(b.runs) }, { label: 'Share of runs', value: `${(b.share * 100).toFixed(1)}%` }, { label: 'Balls', value: int.format(b.balls) }, ...(b.strikeRate === null ? [] : [{ label: 'Strike rate', value: b.strikeRate.toFixed(0) }])]} />)}>
              <span className="rname">{b.label}</span>
              <div className="rtrack">
                <i className="rbar" style={{ width: `${(b.runs / top) * 100}%`, background: main, opacity: i === 0 ? 1 : 0.75 }} />
                <div className={`rtext${b.runs / top > 0.55 ? ' rtin' : ''}`} style={b.runs / top > 0.55 ? undefined : { left: `${(b.runs / top) * 100}%` }}><b>{int.format(b.runs)} runs</b><span>{int.format(b.balls)} balls{b.strikeRate === null ? '' : `, SR ${b.strikeRate.toFixed(0)}`}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {tip && <ChartTip x={tip.x} y={tip.y}>{tip.body}</ChartTip>}
    </>
  );
}
