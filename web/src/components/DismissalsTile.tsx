'use client';

import { ChartTip } from './ChartTip';
import { useMemo, useState, type ReactNode } from 'react';
import type { DismissalData } from '@/data/bowlDismissals';
import { ballBinSize, batterHowOut, histogram, howOut, outPlaying } from '@/domain/dismissals';
import { useChartColours } from './ChartColours';
import { usePlayOnView } from './charts/usePlayOnView';
import { TipBody } from './TipBody';

const int = new Intl.NumberFormat('en');
const sentence = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

type Tip = { x: number; y: number; body: ReactNode };

/**
 * The Dismissals tiles. For a bowler: Dismissal types, the wickets taken (run outs are not credited). For a batter: Dismissals, how the batter got out (run outs count).
 * The bowling Dismissal types tile body, as in the player page mockup: how the wickets came as one bar, the five shots the batter was playing when out (and the wickets
 * with no shot recorded), and a spread of the balls or runs the batter had when the wicket fell. Run outs are not the bowler's, so they are not here.
 * Everything draws when the tile comes into view, and each part has a tooltip.
 */
export function DismissalsBody({ data, kind, note }: { data: DismissalData; kind: 'bat' | 'bowl'; note?: string }) {
  const bat = kind === 'bat';
  const noun = bat ? ['dismissal', 'dismissals'] as const : ['wicket', 'wickets'] as const;
  const { main, second } = useChartColours();
  const colours: Record<string, string> = { Caught: main, Bowled: second, LBW: '#fff', Stumped: '#B79CFF', 'Run out': '#B79CFF', Other: '#5E6168' };
  const [by, setBy] = useState<'Balls' | 'Runs'>('Balls');
  const [tip, setTip] = useState<Tip | null>(null);
  const types = useMemo(() => (bat ? batterHowOut(data.types) : howOut(data.types)), [data.types, bat]);
  const total = types.reduce((a, t) => a + t.wickets, 0);
  const shots = useMemo(() => outPlaying(data.shots), [data.shots]);
  const size = by === 'Balls' ? ballBinSize(new Set(data.formats), data.hundredOnly) : 10;
  const bins = useMemo(() => histogram(data.wickets.map((w) => (by === 'Balls' ? w.balls : w.runs)), size), [data.wickets, by, size]);
  const { ref, played } = usePlayOnView<HTMLDivElement>(`${total}:${by}:${size}`);
  const topShot = Math.max(1, data.nonStriker, ...shots.map((s) => s.wickets));
  const tallest = Math.max(1, ...bins.map((b) => b.count));
  const show = (e: { clientX: number; clientY: number }, body: ReactNode) => setTip({ x: e.clientX, y: e.clientY, body });
  const labelled = data.shots.filter((s) => s.shot).reduce((a, s) => a + s.n, 0);
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className={`dis2${played ? ' play' : ''}`} ref={ref} onPointerLeave={() => setTip(null)}>
        <h5 className="sh0">How out ({int.format(total)} {total === 1 ? noun[0] : noun[1]})</h5>
        <div className="stk big grow" role="img" aria-label={`How out: ${types.filter((t) => t.wickets > 0).map((t) => `${t.label} ${t.wickets}`).join(', ')}`}>
          {types.filter((t) => t.wickets > 0).map((t) => (
            <i key={t.label} style={{ width: `${(t.share * 100).toFixed(1)}%`, background: colours[t.label], color: t.label === 'LBW' || t.label === 'Caught' || t.label === 'Bowled' ? '#04243A' : '#fff' }}
              onPointerMove={(e) => show(e, <TipBody title={t.label} rows={[{ label: sentence(noun[1]), value: int.format(t.wickets) }, { label: `Share of ${noun[1]}`, value: `${Math.round(t.share * 1000) / 10}%` }]} />)}>
              {t.share > 0.08 ? `${Math.round(t.share * 100)}%` : ''}
            </i>
          ))}
        </div>
        <div className="sleg">{types.map((t) => <span key={t.label}><i style={{ background: colours[t.label] }} />{t.label} {int.format(t.wickets)}</span>)}</div>
        <h5 className="sh0" style={{ marginTop: 8 }}>{bat ? 'Out playing' : 'Batter out playing'}</h5>
        <div className="oplay">
          {shots.map((s) => (
            <div className="orow" key={s.shot ?? 'none'} onPointerMove={(e) => show(e, <TipBody title={s.shot ? sentence(s.shot) : 'Not recorded'} rows={[{ label: sentence(noun[1]), value: int.format(s.wickets) }, ...(s.shot ? [{ label: 'Share with a shot', value: `${Math.round((1000 * s.wickets) / Math.max(1, labelled)) / 10}%` }] : [])]} note={s.shot ? undefined : 'No shot label for these'} />)}>
              <span title={s.shot ? sentence(s.shot) : 'Not recorded'}>{s.shot ? sentence(s.shot) : 'Not recorded'}</span>
              <div className="obar"><i className="grow" style={{ width: `${((s.wickets / topShot) * 100).toFixed(0)}%`, background: s.shot ? second : '#5E6168' }} /></div>
              <b>{int.format(s.wickets)}</b>
            </div>
          ))}
          {data.nonStriker > 0 && (
            <div className="orow" onPointerMove={(e) => show(e, <TipBody title="Non-striker's end" rows={[{ label: 'Run outs', value: int.format(data.nonStriker) }]} note="Another batter faced the ball, so there is no shot" />)}>
              <span title="Non-striker's end">Non-striker's end</span>
              <div className="obar"><i className="grow" style={{ width: `${((data.nonStriker / topShot) * 100).toFixed(0)}%`, background: '#5E6168' }} /></div>
              <b>{int.format(data.nonStriker)}</b>
            </div>
          )}
        </div>
        <h5 className="sh0" style={{ marginTop: 8 }}>
          {bat ? (by === 'Balls' ? 'Balls faced before getting out' : 'Runs scored when out') : by === 'Balls' ? 'Balls the batter faced before the wicket' : 'Runs the batter scored before the wicket'}
          <span className="sw msw">{(['Balls', 'Runs'] as const).map((o) => <button key={o} type="button" className={by === o ? 'on' : undefined} onClick={() => setBy(o)}>{o}</button>)}</span>
        </h5>
        <div className="hist" role="img" aria-label={`${by === 'Balls' ? 'Balls faced' : 'Runs scored'} by the batter when the wicket fell, in bins of ${size}`}>
          {bins.map((b) => (
            <div className="hb" key={b.label} onPointerMove={(e) => show(e, <TipBody title={`${b.label} ${by === 'Balls' ? 'balls' : 'runs'}`} rows={[{ label: sentence(noun[1]), value: int.format(b.count) }]} />)}>
              <i className="bar-grow" style={{ height: `${(b.count / tallest) * 100}%`, minHeight: b.count > 0 ? 2 : 0, background: main }} />
              <em>{b.label}</em>
            </div>
          ))}
        </div>
      </div>
      {tip && <ChartTip x={tip.x} y={tip.y}>{tip.body}</ChartTip>}
    </>
  );
}
