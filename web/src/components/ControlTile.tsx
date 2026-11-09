'use client';

import { ChartTip } from './ChartTip';
import { useMemo, useState, type ReactNode } from 'react';
import { BANDS, landingGrid, LANES, type PitchRow } from '@/domain/pitch';
import { dismissalMapGrid } from '@/domain/dismissals';
import { controlGrid, falseShotTrend, FALSE_SHOT_MINIMUM, type ControlRow, type FalseShotInnings } from '@/domain/control';
import { withAlpha } from '@/domain/colours';
import { smallSample } from '@/domain/opponents';
import type { Hand } from '@/domain/wagon';
import { BarChart } from './charts/BarChart';
import { usePlayOnView } from './charts/usePlayOnView';
import { useChartColours } from './ChartColours';
import { TipBody } from './TipBody';

const int = new Intl.NumberFormat('en');
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The Shot control tile body, as in the player page mockup: a grid of the six lengths by the five lines, each cell the share of shots played in control, darker and higher
 * for more control. A left-hander's lines are reversed so the off side is on the right. A cell under the small sample line is dimmed. The cells fade in when the tile is on screen.
 */
export function ControlBody({ rows, hand, test, note }: { rows: readonly ControlRow[]; hand: Hand; test: boolean; note?: string }) {
  const { main } = useChartColours();
  const grid = useMemo(() => controlGrid(rows, hand), [rows, hand]);
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const { ref, played } = usePlayOnView<HTMLDivElement>(`${rows.length}:${rows.reduce((a, r) => a + r.known, 0)}:${hand}`);
  if (rows.length === 0) return <div className="thin">No balls with a line, a length and a control reading in this slice.</div>;
  const line = smallSample(test);
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className={`ctlgrid${played ? ' play' : ''}`} ref={ref} onPointerLeave={() => setTip(null)}>
        {BANDS.map((b, j) => (
          <div className="ctlrow" key={b.key}>
            <span className="ctlname">{b.full}</span>
            {grid.cells[j]!.map((c, i) => {
              const few = c.balls < line;
              return (
                <div className="ctlcell fade-in" key={i} style={{ background: c.share === null ? 'rgba(255,255,255,.04)' : withAlpha(main, 0.12 + 0.78 * c.share), ['--dim' as string]: few && c.share !== null ? 0.6 : undefined, animationDelay: `${(j * 5 + i) * 18}ms` }}
                  onPointerMove={(e) => setTip({ x: e.clientX, y: e.clientY, body: <TipBody title={`${b.full}, ${grid.lanes[i]!.toLowerCase()}`} rows={[{ label: 'In control', value: c.share === null ? 'No reading' : `${Math.round(c.share * 100)}%` }, { label: 'Balls', value: int.format(c.balls) }]} note={few && c.share !== null ? `Under ${line} balls, a small sample` : undefined} /> })}>
                  {c.share === null ? '-' : `${Math.round(c.share * 100)}%`}
                </div>
              );
            })}
          </div>
        ))}
        <div className="ctlrow ctlhead"><span className="ctlname" />{grid.lanes.map((l) => <span key={l} className="ctllane">{l}</span>)}</div>
      </div>
      {tip && <ChartTip x={tip.x} y={tip.y}>{tip.body}</ChartTip>}
    </>
  );
}

const when = (date: string): string => { const d = new Date(`${date}T00:00:00`); return Number.isNaN(d.getTime()) ? date : day.format(d); };

/**
 * The False shot trend body, as in the mockup: one bar for each of the latest innings (the latest on the right), the share of balls with a control reading that were not
 * in control, with the average of those innings as a dashed line. Innings above the average are in the warm colour. An innings needs 10 balls with a reading to show.
 */
export function FalseShotsBody({ innings, note }: { innings: readonly FalseShotInnings[]; note?: string }) {
  const { main } = useChartColours();
  const { points, average } = useMemo(() => falseShotTrend(innings), [innings]);
  if (points.length < 3 || average === null) return <div className="thin">Too few innings with a control reading ({points.length}). An innings needs {FALSE_SHOT_MINIMUM} balls with a reading.</div>;
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className="art">
        <BarChart
          values={points.map((p) => p.rate)} labels={points.map((_, i) => `#${i + 1}`)} colour={main} barColours={points.map((p) => (p.rate > average ? '#FF9F43' : main))}
          axisLabel="False shot rate (%)" xTitle={`Latest ${points.length} innings, the latest on the right. Orange is above the average`} reference={{ value: average, label: `Average ${average.toFixed(1)}%` }}
          label={`False shot rate in each of the latest ${points.length} innings, average ${average.toFixed(1)} percent`}
          tip={(i) => { const p = points[i]!; return <TipBody title={`Innings ${i + 1}`} sub={`v ${p.opponent}, ${when(p.date)}`} rows={[{ label: 'False shots', value: `${p.rate.toFixed(1)}%` }, { label: 'Balls with a reading', value: `${int.format(p.falseShots)} of ${int.format(p.known)}` }]} />; }}
        />
      </div>
    </>
  );
}


/**
 * The Dismissal map body, as in the mockup: the six lengths by the five lines with the dismissals in each cell, brighter for more. The batter's own view, so a left-hander's
 * lines are reversed. Only dismissals whose delivery was tracked have a cell, and a note says how many that is.
 */
export function DismissalMapBody({ rows, all, hand, note, noun = 'dismissals' }: { rows: readonly { length: string; line: string; outs: number }[]; all: number; hand: Hand; note?: string; noun?: 'dismissals' | 'wickets' }) {
  const { main } = useChartColours();
  const grid = useMemo(() => dismissalMapGrid(rows, hand), [rows, hand]);
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const { ref, played } = usePlayOnView<HTMLDivElement>(`${grid.total}:${hand}`);
  if (grid.total === 0) return <div className="thin">No {noun} with a tracked line and length in this slice.</div>;
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className={`ctlgrid${played ? ' play' : ''}`} ref={ref} onPointerLeave={() => setTip(null)}>
        {BANDS.map((b, j) => (
          <div className="ctlrow" key={b.key}>
            <span className="ctlname">{b.full}</span>
            {grid.cells[j]!.map((n, i) => (
              <div className="ctlcell fade-in" key={i} style={{ background: n === 0 ? 'rgba(255,255,255,.04)' : withAlpha(main, 0.15 + 0.75 * (n / grid.max)), animationDelay: `${(j * 5 + i) * 18}ms` }}
                onPointerMove={(e) => setTip({ x: e.clientX, y: e.clientY, body: <TipBody title={`${b.full}, ${grid.lanes[i]!.toLowerCase()}`} rows={[{ label: noun.charAt(0).toUpperCase() + noun.slice(1), value: String(n) }, { label: 'Share', value: `${((100 * n) / grid.total).toFixed(1)}%` }]} /> })}>
                {n === 0 ? '-' : n}
              </div>
            ))}
          </div>
        ))}
        <div className="ctlrow ctlhead"><span className="ctlname" />{grid.lanes.map((l) => <span key={l} className="ctllane">{l}</span>)}</div>
        <div className="ctlfoot">{int.format(grid.total)} of {int.format(all)} {noun} have a tracked line and length.</div>
      </div>
      {tip && <ChartTip x={tip.x} y={tip.y}>{tip.body}</ChartTip>}
    </>
  );
}

export type LandingChoice = 'dots' | 'boundaries' | 'rpb';

/** The header switch of Line and length results. */
export function LandingSwitch({ value, onChange }: { value: LandingChoice; onChange: (next: LandingChoice) => void }) {
  return (
    <span className="sw msw">
      {([['dots', 'Dots'], ['boundaries', 'Boundaries'], ['rpb', 'Runs per ball']] as const).map(([key, label]) => <button key={key} type="button" className={value === key ? 'on' : undefined} onClick={() => onChange(key)}>{label}</button>)}
    </span>
  );
}

/**
 * The bowling Line and length results body, as in the mockup: the six lengths by the five lines, each cell the share of dot balls, the share hit for four or six, or the runs
 * off the bat per ball. The lines are as the batter sees them (off side on the left). A cell under the small sample line is dimmed. The cells fade in when the tile is on screen.
 */
export function LandingBody({ rows, mode, test, note }: { rows: readonly PitchRow[]; mode: LandingChoice; test: boolean; note?: string }) {
  const { main } = useChartColours();
  const grid = useMemo(() => landingGrid(rows, mode), [rows, mode]);
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const { ref, played } = usePlayOnView<HTMLDivElement>(`${mode}:${rows.length}:${rows.reduce((a, r) => a + r.balls, 0)}`);
  const values = grid.flat().map((c) => c.value).filter((v): v is number => v !== null);
  if (values.length === 0) return <div className="thin">No balls with a line and a length in this slice.</div>;
  const lo = Math.min(...values), hi = Math.max(...values), line = smallSample(test);
  const show = (v: number): string => (mode === 'rpb' ? v.toFixed(2) : `${Math.round(v * 100)}%`);
  const label = mode === 'dots' ? 'dot balls' : mode === 'boundaries' ? 'balls hit for four or six' : 'runs per ball';
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className={`ctlgrid${played ? ' play' : ''}`} ref={ref} onPointerLeave={() => setTip(null)}>
        {BANDS.map((b, j) => (
          <div className="ctlrow" key={b.key}>
            <span className="ctlname">{b.full}</span>
            {grid[j]!.map((c, i) => {
              const few = c.balls < line;
              const alpha = c.value === null ? 0 : 0.12 + 0.78 * ((c.value - lo) / (hi - lo || 1));
              return (
                <div className="ctlcell fade-in" key={i} style={{ background: c.value === null ? 'rgba(255,255,255,.04)' : withAlpha(main, alpha), ['--dim' as string]: few && c.value !== null ? 0.6 : undefined, animationDelay: `${(j * 5 + i) * 18}ms` }}
                  onPointerMove={(e) => setTip({ x: e.clientX, y: e.clientY, body: <TipBody title={`${b.full}, ${LANES[i]!.short.toLowerCase()}`} rows={[{ label: label.charAt(0).toUpperCase() + label.slice(1), value: c.value === null ? 'No balls' : show(c.value) }, { label: 'Balls', value: int.format(c.balls) }]} note={few && c.value !== null ? `Under ${line} balls, a small sample` : undefined} /> })}>
                  {c.value === null ? '-' : show(c.value)}
                </div>
              );
            })}
          </div>
        ))}
        <div className="ctlrow ctlhead"><span className="ctlname" />{LANES.map((l) => <span key={l.key} className="ctllane">{l.short}</span>)}</div>
      </div>
      {tip && <ChartTip x={tip.x} y={tip.y}>{tip.body}</ChartTip>}
    </>
  );
}

export type BowlControlChoice = 'control' | 'false';

/** The header switch of the bowling Control tile. */
export function BowlControlSwitch({ value, onChange }: { value: BowlControlChoice; onChange: (next: BowlControlChoice) => void }) {
  return (
    <span className="sw msw">
      {([['control', 'In control'], ['false', 'False shots']] as const).map(([key, label]) => <button key={key} type="button" className={value === key ? 'on' : undefined} onClick={() => onChange(key)}>{label}</button>)}
    </span>
  );
}
