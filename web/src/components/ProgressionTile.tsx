import { useMemo } from 'react';
import type { BowlProgression } from '@/data/bowlProgression';
import { battingSpan, economyByBall, progressionSpan, PROGRESSION_MINIMUM, wicketsByBin } from '@/domain/progression';
import type { BatProgression } from '@/data/batProgression';
import { BarChart } from './charts/BarChart';
import { LineChart } from './charts/LineChart';
import { useChartColours } from './ChartColours';
import { TipBody } from './TipBody';

const int = new Intl.NumberFormat('en');

/**
 * The bowling Progression tile body, as in the player page mockup: the running economy through a spell (the line is the typical innings, the band holds the
 * middle half of them) and the wickets per 100 balls in eight stretches of the spell. Balls are the bowler's own, counted from the first of the innings.
 */
export function BowlProgressionBody({ data, hundred, note }: { data: BowlProgression; hundred: boolean; note?: string }) {
  const { main, second } = useChartColours();
  const span = progressionSpan(new Set(data.formats), data.hundredOnly);
  const per = hundred ? 5 : 6;
  const points = useMemo(() => economyByBall(data.balls, span, per), [data.balls, span, per]);
  const bins = useMemo(() => wicketsByBin(data.balls, span), [data.balls, span]);
  const unit = hundred ? 'economy per 5 balls' : 'economy';
  const step = Math.max(1, Math.ceil(points.length / 5));
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className="charts">
        <div className="art">
          {points.length >= 2 ? (
            <LineChart
              values={points.map((p) => p.median)} band={points.map((p) => ({ low: p.low, high: p.high }))} colour={main} axisLabel={hundred ? 'Econ (5)' : 'Economy'} decimals={1}
              labels={points.map((p) => String(p.ball))} labelStep={step} xTitle="Balls bowled in the innings"
              label={`Economy by balls bowled in the innings, the typical innings with the middle half as a band, first ${span} balls`}
              tip={(i) => { const p = points[i]!; return <TipBody title={`Ball ${p.ball}`} rows={[{ label: `Typical ${unit}`, value: p.median.toFixed(2) }, { label: 'Middle half', value: `${p.low.toFixed(2)} to ${p.high.toFixed(2)}` }, { label: 'Innings', value: int.format(p.innings) }]} />; }}
            />
          ) : <div className="thin">Too few innings to show how economy builds. A ball needs {PROGRESSION_MINIMUM} innings that reached it.</div>}
        </div>
        <div className="art">
          <BarChart
            values={bins.map((b) => b.per100)} labels={bins.map((b) => `${b.from}-${b.to}`)} colour={second} axisLabel="Wickets per 100 balls" xTitle="Balls bowled in the innings"
            label={`Wickets per 100 balls in eight stretches of the first ${span} balls of an innings`}
            tip={(i) => { const b = bins[i]!; return <TipBody title={`Balls ${b.from} to ${b.to}`} rows={[{ label: 'Wickets per 100 balls', value: b.per100.toFixed(1) }, { label: 'Wickets', value: int.format(b.wickets) }, { label: 'Balls', value: int.format(b.balls) }]} />; }}
          />
        </div>
      </div>
    </>
  );
}

/**
 * The batting Innings progression tile body, as in the player page mockup: the running strike rate through an innings (the line is the typical innings, the band holds
 * the middle half of them), by the balls the batter has faced. The method is the same as the bowling Progression.
 */
export function BatProgressionBody({ data, note }: { data: BatProgression; note?: string }) {
  const { main } = useChartColours();
  const span = battingSpan(new Set(data.formats), data.hundredOnly);
  const points = useMemo(() => economyByBall(data.balls, span, 100), [data.balls, span]);
  const step = Math.max(1, Math.ceil(points.length / 6));
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className="art">
        {points.length >= 2 ? (
          <LineChart
            values={points.map((p) => p.median)} band={points.map((p) => ({ low: p.low, high: p.high }))} colour={main} axisLabel="Strike rate" decimals={0}
            labels={points.map((p) => String(p.ball))} labelStep={step} xTitle={`Balls faced. Based on ${int.format(data.innings)} innings`}
            label={`Strike rate by balls faced, the typical innings with the middle half as a band, first ${span} balls`}
            tip={(i) => { const p = points[i]!; return <TipBody title={`Ball ${p.ball}`} rows={[{ label: 'Typical strike rate', value: p.median.toFixed(0) }, { label: 'Middle half', value: `${p.low.toFixed(0)} to ${p.high.toFixed(0)}` }, { label: 'Innings', value: int.format(p.innings) }]} />; }}
          />
        ) : <div className="thin">Too few innings to show how the strike rate builds. A ball needs {PROGRESSION_MINIMUM} innings that reached it.</div>}
      </div>
    </>
  );
}
