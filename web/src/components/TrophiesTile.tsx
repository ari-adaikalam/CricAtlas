'use client';

import type { Trophies } from '@/domain/trophies';
import { chipYear, resultLabel } from '@/domain/trophies';
import { CountText } from './charts/CountUp';
import { useTableMotion } from './useTableMotion';
import { TeamRef } from './TeamLinks';

const int = new Intl.NumberFormat('en');

/**
 * The Trophies tile body, as in the player page mockup: four totals above a row for each tournament, with its titles, lost finals and a chip for every edition (gold a title, sky a lost
 * final, grey any other result). The row list scrolls. Only major tournaments and leagues are here, never bilateral series.
 */
export function TrophiesBody({ data }: { data: Trophies }) {
  const key = data.rows.map((r) => `${r.key}:${r.editions.length}:${r.titles}:${r.finals}`).join('|');
  const { ref, motion, played } = useTableMotion<HTMLDivElement>(key, key);
  if (data.rows.length === 0) return <div className="thin">No tournament editions in these filters. Bilateral series are not counted.</div>;
  const totals: Array<[number, string]> = [[data.titles, 'titles'], [data.finals, 'lost finals'], [data.editions, 'editions played'], [data.won, 'tournaments won']];
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {totals.map(([n, label]) => <div className="kn" key={label}><b><CountText value={n} format={(v) => int.format(Math.round(v))} play={played} /></b><span>{label}</span></div>)}
      </div>
      <div className="trg" ref={ref} data-rows={motion}>
        {data.rows.map((r) => (
          <div className="trr" key={r.key}>
            <div className="trn"><b>{r.name}</b><span>{r.editions.length} edition{r.editions.length === 1 ? '' : 's'}{r.winners.length ? <>, with {r.winners.map((w, i) => <span key={w}>{i > 0 && ', '}<TeamRef name={w} /></span>)}</> : ''}</span></div>
            <div className="trk"><b className="tw">{r.titles}</b><span>title{r.titles === 1 ? '' : 's'}</span></div>
            <div className="trk"><b className="tf">{r.finals}</b><span>lost final{r.finals === 1 ? '' : 's'}</span></div>
            <div className="trc">
              {r.editions.map((e) => (
                <span key={`${e.season_label}|${e.team}`} className={`tch${e.result === 'champion' ? ' w' : e.result === 'runner-up' ? ' f' : ''}`}
                  title={`${r.name} ${e.season_label}, with ${e.team}: ${resultLabel(e.result)}`}>{chipYear(e.season_label)}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
