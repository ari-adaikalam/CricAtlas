import { bowlSeasonStats, seasonStats, shortYear, type BowlYearCounts, type YearCounts } from '@/domain/seasons';
import { BarChart } from './charts/BarChart';
import { LineChart } from './charts/LineChart';
import { useChartColours } from './ChartColours';
import { TipBody } from './TipBody';

const int = new Intl.NumberFormat('en');

/** The By season tile body: runs in each year as bars over the strike rate of the year as a line, two charts with one scale each. */
export function SeasonsBody({ rows, note }: { rows: readonly YearCounts[]; note?: string }) {
  const { main, second } = useChartColours();
  const years = seasonStats(rows);
  const labels = years.map((y) => shortYear(y.year));
  const span = years.length ? `${years[0]?.year} to ${years[years.length - 1]?.year}` : '';
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className="charts">
        <div className="art">
          <BarChart
            values={years.map((y) => y.runs)} labels={labels} colour={main} axisLabel="Runs" label={`Runs in each year, ${span}`}
            tip={(i) => { const y = years[i]!; return <TipBody title={String(y.year)} rows={[{ label: 'Runs', value: int.format(y.runs) }, { label: 'Innings', value: int.format(y.innings) }, ...(y.average !== null ? [{ label: 'Average', value: y.average.toFixed(1) }] : [])]} />; }}
          />
        </div>
        <div className="art">
          <LineChart
            values={years.map((y) => y.strikeRate)} colour={second} axisLabel="Strike rate" decimals={0} labels={labels} labelStep={2} slots label={`Strike rate in each year, ${span}`}
            tip={(i) => { const y = years[i]!; return <TipBody title={String(y.year)} rows={[{ label: 'Strike rate', value: y.strikeRate?.toFixed(0) ?? '-' }, { label: 'Runs', value: int.format(y.runs) }, { label: 'Balls', value: int.format(y.balls) }]} />; }}
          />
        </div>
      </div>
    </>
  );
}

/** The bowling By season tile body: wickets in each year as bars over the economy of the year as a line, two charts with one scale each. */
export function BowlSeasonsBody({ rows, hundred, note }: { rows: readonly BowlYearCounts[]; hundred: boolean; note?: string }) {
  const { main, second } = useChartColours();
  const years = bowlSeasonStats(rows, hundred ? 5 : 6);
  const labels = years.map((y) => shortYear(y.year));
  const span = years.length ? `${years[0]?.year} to ${years[years.length - 1]?.year}` : '';
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className="charts">
        <div className="art">
          <BarChart
            values={years.map((y) => y.wickets)} labels={labels} colour={main} axisLabel="Wickets" zero="No wickets in these years." label={`Wickets in each year, ${span}`}
            tip={(i) => { const y = years[i]!; return <TipBody title={String(y.year)} rows={[{ label: 'Wickets', value: int.format(y.wickets) }, { label: 'Innings', value: int.format(y.innings) }, ...(y.average !== null ? [{ label: 'Average', value: y.average.toFixed(1) }] : [])]} />; }}
          />
        </div>
        <div className="art">
          <LineChart
            values={years.map((y) => y.economy)} colour={second} axisLabel={hundred ? 'Economy per 5 balls' : 'Economy'} decimals={2} labels={labels} labelStep={2} slots label={`Economy in each year, ${span}`}
            tip={(i) => { const y = years[i]!; return <TipBody title={String(y.year)} rows={[{ label: hundred ? 'Economy per 5 balls' : 'Economy', value: y.economy?.toFixed(2) ?? '-' }, { label: 'Runs conceded', value: int.format(y.conceded) }, { label: 'Balls', value: int.format(y.balls) }]} />; }}
          />
        </div>
      </div>
    </>
  );
}
