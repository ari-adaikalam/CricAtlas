import type { ReactNode } from 'react';
import { FORM_MINIMUM, FORM_WINDOW, rollingBowlForm, rollingForm, type BowlInningsLine, type InningsLine } from '@/domain/form';
import { LineChart } from './charts/LineChart';
import { useChartColours } from './ChartColours';
import { TipBody, type TipRow } from './TipBody';

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function when(line: { date: string }): string {
  const d = new Date(`${line.date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? line.date : day.format(d);
}

/** The Form tile body: the rolling average over the strike rate, two charts with one scale each, oldest innings at the left. */
export function FormBody({ innings, onClear }: { innings: readonly InningsLine[]; onClear?: () => void }) {
  const { main, second } = useChartColours();
  if (innings.length < FORM_MINIMUM) {
    return <div className="thin">Too few innings to show form ({innings.length}). {onClear && <button type="button" className="clr" onClick={onClear}>Clear filters</button>}</div>;
  }
  const form = rollingForm(innings);
  const first = innings[0], last = innings[innings.length - 1];
  const span = first && last ? `from ${when(first)} to ${when(last)}` : '';
  const tip = (i: number, rows: readonly TipRow[]): ReactNode => {
    const line = innings[i]!;
    return <TipBody title={`Innings ${i + 1}`} sub={`v ${line.opponent}, ${when(line)}`} rows={[{ label: 'Score', value: `${line.runs}${line.out ? '' : '*'} off ${line.balls}` }, ...rows]} />;
  };
  return (
    <div className="charts">
      <div className="art">
        <LineChart
          values={form.map((p) => p.average)} colour={main} axisLabel="Avg" decimals={1} empty="Never out in these innings, so there is no average."
          label={`Rolling average over the latest ${innings.length} innings, ${span}`}
          tip={(i) => tip(i, [{ label: `Average, last ${form[i]?.window}`, value: form[i]?.average?.toFixed(1) ?? '-' }])}
        />
      </div>
      <div className="art">
        <LineChart
          values={form.map((p) => p.strikeRate)} colour={second} axisLabel="SR" decimals={0}
          label={`Rolling strike rate over the latest ${innings.length} innings, ${span}`}
          tip={(i) => tip(i, [{ label: `Strike rate, last ${form[i]?.window}`, value: form[i]?.strikeRate?.toFixed(0) ?? '-' }])}
        />
      </div>
    </div>
  );
}

export const formTip = (n: number): string =>
  `Rolling average and strike rate over the latest ${n} innings. Each point looks back up to ${FORM_WINDOW} innings. Oldest on the left.`;

/** The bowling Form tile body: the rolling average over the economy (per five balls in The Hundred), the same layout as the batting one. */
export function BowlFormBody({ innings, hundred, onClear }: { innings: readonly BowlInningsLine[]; hundred: boolean; onClear?: () => void }) {
  const { main, second } = useChartColours();
  if (innings.length < FORM_MINIMUM) {
    return <div className="thin">Too few innings to show form ({innings.length}). {onClear && <button type="button" className="clr" onClick={onClear}>Clear filters</button>}</div>;
  }
  const form = rollingBowlForm(innings, hundred ? 5 : 6);
  const first = innings[0], last = innings[innings.length - 1];
  const span = first && last ? `from ${when(first)} to ${when(last)}` : '';
  const tip = (i: number, rows: readonly TipRow[]): ReactNode => {
    const line = innings[i]!;
    return <TipBody title={`Innings ${i + 1}`} sub={`v ${line.opponent}, ${when(line)}`} rows={[{ label: 'Figures', value: `${line.wickets}/${line.runs} off ${line.balls}` }, ...rows]} />;
  };
  return (
    <div className="charts">
      <div className="art">
        <LineChart
          values={form.map((p) => p.average)} colour={main} axisLabel="Avg" decimals={1} empty="No wicket in these innings, so there is no average."
          label={`Rolling bowling average over the latest ${innings.length} innings, ${span}`}
          tip={(i) => tip(i, [{ label: `Average, last ${form[i]?.window}`, value: form[i]?.average === null ? 'No wicket' : form[i]?.average?.toFixed(1) ?? '-' }])}
        />
      </div>
      <div className="art">
        <LineChart
          values={form.map((p) => p.economy)} colour={second} axisLabel={hundred ? 'Econ (5)' : 'Econ'} decimals={2}
          label={`Rolling economy over the latest ${innings.length} innings, ${span}`}
          tip={(i) => tip(i, [{ label: `${hundred ? 'Economy per 5 balls' : 'Economy'}, last ${form[i]?.window}`, value: form[i]?.economy?.toFixed(2) ?? '-' }])}
        />
      </div>
    </div>
  );
}

export const bowlFormTip = (n: number, hundred: boolean): string =>
  `Rolling average and economy${hundred ? ' per 5 balls' : ''} over the latest ${n} innings. Each point looks back up to ${FORM_WINDOW} innings. Oldest on the left.`;
