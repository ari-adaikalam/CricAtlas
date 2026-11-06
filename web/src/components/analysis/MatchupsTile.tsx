'use client';

import { useMemo, useState } from 'react';
import { TeamLabel } from '../TeamLinks';
import { ChartTip } from '../ChartTip';
import { TeamSwatch } from '../TeamSwatch';
import { usePlayOnView } from '../charts/usePlayOnView';
import { matchupGrid, matchupsOf, SMALL_MATCHUP, type Matchup } from '@/domain/analysis';
import type { BallFile } from '@/domain/ballByBall';
import type { InningsCard, SubMark } from '@/domain/match';
import { PlayerName } from '../PlayerName';
import { TipBody } from '../TipBody';
import { pickSide, useSides } from './useSides';
import { usePhone } from '../usePhone';

// The Matchups tile: for each side that bowled, a grid of the batters it bowled to against its bowlers. Each cell is the batter's strike rate against that bowler, brighter
// for higher, with the runs off the balls faced below it and a white disc where the bowler got the batter out. Every pairing is shown.

const HEAT = ['#1f2a36', '#24415a', '#2b6a96', '#3f98cf', '#8ad0f2'];
const heat = (v: number): string => HEAT[Math.min(4, Math.max(0, Math.floor(v * 5)))]!;
const sr = (m: Matchup): number | null => (m.balls > 0 ? (m.runs / m.balls) * 100 : null);

export interface MatchupPanel { key: string; label: string; team: string; inn: InningsCard; file: BallFile }

function Grid({ panel, marks }: { panel: MatchupPanel; marks: Map<string, SubMark> }) {
  const grid = useMemo(() => matchupGrid(matchupsOf(panel.file, panel.inn)), [panel]);
  const [tip, setTip] = useState<{ m: Matchup; x: number; y: number } | null>(null);
  const phone = usePhone();
  const { ref, played } = usePlayOnView<HTMLDivElement>(`${panel.key}:${grid.batters.length}:${grid.bowlers.length}:${grid.batters.reduce((a, x) => a + x.balls, 0)}`);
  if (grid.batters.length === 0) return <p className="rempty">No balls were bowled.</p>;
  // On a phone the grid is a real table in a frame that scrolls both ways: the pinned names of a table scroll reliably in Safari where a grid of cells with `display: contents` did not (it jumped back to the start when moved sideways and down).
  if (phone) {
    return (
      <div className={`mutf${played ? ' play' : ''}`} ref={ref} data-noguard="">
        <table className="mut">
          <thead><tr><th className="mun0" />{grid.bowlers.map((w) => <th key={w.id ?? w.name} title={w.name}><PlayerName id={w.id} name={w.name} marks={marks} /></th>)}</tr></thead>
          <tbody>
            {grid.batters.map((bat, r) => (
              <tr key={bat.id ?? bat.name}>
                <th scope="row" title={bat.name}><PlayerName id={bat.id} name={bat.name} marks={marks} /></th>
                {grid.bowlers.map((w, c) => {
                  const m = grid.cell(r, c);
                  if (!m) return <td key={w.id ?? w.name} className="none" />;
                  const rate = sr(m);
                  return (
                    <td key={w.id ?? w.name} data-c="" style={{ background: rate === null ? '#1d2026' : heat((rate - 60) / 140) }}
                      onPointerUp={(e) => setTip({ m, x: e.clientX, y: e.clientY })} onPointerLeave={() => setTip(null)}
                      aria-label={`${m.batter} against ${m.bowler}: ${m.runs} off ${m.balls}${m.out ? `, out ${m.out} ${m.out === 1 ? 'time' : 'times'}` : ''}`}>
                      <b>{rate === null ? '-' : Math.round(rate)}</b>
                      <i>{m.runs} off {m.balls}</i>
                      {m.out > 0 && <em className="muw">W</em>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {tip && (
          <ChartTip x={tip.x} y={tip.y}>
            <TipBody title={`${tip.m.batter} v ${tip.m.bowler}`} rows={[{ label: 'Runs', value: `${tip.m.runs} off ${tip.m.balls}` }, { label: 'Strike rate', value: sr(tip.m) === null ? '-' : String(Math.round(sr(tip.m)!)) }, { label: 'Dots', value: String(tip.m.dots) }, { label: 'Out', value: String(tip.m.out) }]} note={tip.m.balls < SMALL_MATCHUP ? `Under ${SMALL_MATCHUP} balls, a small sample` : undefined} />
          </ChartTip>
        )}
      </div>
    );
  }
  return (
    <div className={`mu${played ? ' play' : ''}`} ref={ref} data-noguard={phone ? '' : undefined} style={phone ? { gridTemplateColumns: `96px repeat(${grid.bowlers.length}, 64px)`, gridTemplateRows: `44px repeat(${grid.batters.length}, 48px)` } : { gridTemplateColumns: `minmax(78px, 132px) repeat(${grid.bowlers.length}, minmax(0, 1fr))`, gridTemplateRows: `22px repeat(${grid.batters.length}, minmax(30px, 1fr))` }} onPointerLeave={() => setTip(null)}>
      <span className="muh" />
      {grid.bowlers.map((w) => <span key={w.id ?? w.name} className="muh" title={w.name}><PlayerName id={w.id} name={w.name} marks={marks} /></span>)}
      {grid.batters.map((bat, r) => (
        <div key={bat.id ?? bat.name} className="mur">
          <span className="mub" title={bat.name}><PlayerName id={bat.id} name={bat.name} marks={marks} /></span>
          {grid.bowlers.map((w, c) => {
            const m = grid.cell(r, c);
            if (!m) return <span key={w.id ?? w.name} className="muc none" />;
            const rate = sr(m);
            const small = m.balls < SMALL_MATCHUP;
            return (
              <span key={w.id ?? w.name} className="muc" data-c="" style={{ background: rate === null ? '#1d2026' : heat((rate - 60) / 140), ['--i' as string]: r + c }}
                onPointerMove={(e) => setTip({ m, x: e.clientX, y: e.clientY })} tabIndex={0} onFocus={(e) => { const box = e.currentTarget.getBoundingClientRect(); setTip({ m, x: box.left + box.width / 2, y: box.top }); }} onBlur={() => setTip(null)}
                aria-label={`${m.batter} against ${m.bowler}: ${m.runs} off ${m.balls}${m.out ? `, out ${m.out} ${m.out === 1 ? 'time' : 'times'}` : ''}${small ? ', a small sample' : ''}`}>
                <b>{rate === null ? '-' : Math.round(rate)}</b>
                <i>{m.runs} off {m.balls}</i>
                {m.out > 0 && <em className="muw">W</em>}
              </span>
            );
          })}
        </div>
      ))}
      {tip && (
        <ChartTip x={tip.x} y={tip.y}>
          <TipBody
            title={`${tip.m.batter} v ${tip.m.bowler}`}
            rows={[
              { label: 'Runs', value: `${tip.m.runs} off ${tip.m.balls}` },
              { label: 'Strike rate', value: sr(tip.m) === null ? '-' : String(Math.round(sr(tip.m)!)) },
              { label: 'Dots', value: String(tip.m.dots) },
              { label: 'Fours', value: String(tip.m.fours) },
              { label: 'Sixes', value: String(tip.m.sixes) },
              ...(tip.m.out ? [{ label: 'Dismissed', value: tip.m.out === 1 ? 'Once' : `${tip.m.out} times` }] : []),
            ]}
            note={tip.m.balls < SMALL_MATCHUP ? `Under ${SMALL_MATCHUP} balls, a small sample` : undefined}
          />
        </ChartTip>
      )}
    </div>
  );
}

export function MatchupsTile({ panels, marks }: { panels: readonly MatchupPanel[]; marks: Map<string, SubMark> }) {
  const { bar, side } = useSides(panels.map((p) => p.team));
  return (
    <div className="mus">
      {bar}
      <div className={`two2${panels.length === 1 ? ' one' : ''}`} data-side={side}>
        {pickSide(panels.map((p) => <div className="pan2" key={p.key}><h5><TeamSwatch team={p.team} /><TeamLabel team={p.team} text={p.label} /></h5><Grid panel={p} marks={marks} /></div>), side)}
      </div>
      <p className="mun">Each cell is the batter&rsquo;s strike rate against the bowler, with the runs off the balls faced below it. A white disc marks a wicket the bowler took.</p>
    </div>
  );
}
