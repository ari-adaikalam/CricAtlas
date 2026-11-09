'use client';

import { TeamSwatch } from '../TeamSwatch';
import { TeamLink } from '../TeamLinks';
import { CountUp } from '../charts/CountUp';
import { usePlayOnView } from '../charts/usePlayOnView';
import type { InningsCard, MatchBundle } from '@/domain/match';
import { phaseName, phaseRange, phasesOf } from '@/domain/matchDetails';
import { pickSide, useSides } from './useSides';

// The Phases tile of the Match analysis (Ari, 2026-10-22): the columns of the Batting analysis Phases tile for each side of a limited-overs match, with the run rate where the player page has the
// strike rate. The numbers are the innings' own phase rows (the same ones Match details shows).

const rateOf = (runs: number, balls: number, per: number): number | null => (balls > 0 ? runs / (balls / per) : null);

function SidePhases({ b, inn }: { b: MatchBundle; inn: InningsCard }) {
  const hundred = b.match.kind === 'hundred';
  const per = hundred ? 5 : b.match.ballsPerOver || 6;
  const rows = phasesOf(inn);
  const all = rateOf(rows.reduce((a, p) => a + p.runs, 0), rows.reduce((a, p) => a + p.balls, 0), per);
  const key = `${b.match.id}:${inn.n}:${rows.map((p) => `${p.key}${p.runs}`).join(',')}`;
  const { ref, played } = usePlayOnView<HTMLDivElement>(key);
  return (
    <div className="phside">
      <h5 className="phteam"><TeamSwatch team={inn.team} /><TeamLink name={inn.team} /> batting</h5>
      <div className={`phrow${played ? ' play' : ''}`} ref={ref} style={{ gridTemplateColumns: `repeat(${Math.max(1, rows.length)}, 1fr)` }}>
        {rows.map((p, i) => {
          const rate = rateOf(p.runs, p.balls, per);
          const diff = rate !== null && all !== null ? Math.round((rate - all) * 10) / 10 : null;
          return (
            <div className="phc phs rise" key={p.key} style={{ animationDelay: `${i * 90}ms` }}>
              <h5>{phaseName(b, p)}</h5>
              <span className="g">{phaseRange(b, inn, p)}</span>
              <div className="big2">{rate === null ? '-' : <CountUp play={played} value={rate} format={(n) => n.toFixed(1)} />}</div>
              <span className="g">{hundred ? 'runs per 5 balls' : 'run rate'}</span>
              {diff !== null && <div className={`dtag fade-in ${diff >= 0 ? 'up' : 'dn'}`} style={{ animationDelay: `${i * 90 + 600}ms` }}>{diff >= 0 ? '+' : '−'}{Math.abs(diff).toFixed(1)}</div>}
              <div className="pst"><span>Runs</span><b><CountUp play={played} value={p.runs} format={(n) => String(Math.round(n))} /></b></div>
              <div className="pst"><span>Wickets</span><b>{p.wkts}</b></div>
              <div className="pst"><span>Dot balls</span><b>{p.balls > 0 ? `${Math.round((p.dots / p.balls) * 100)}%` : '-'}</b></div>
              <div className="pst"><span>Boundary balls</span><b>{p.balls > 0 ? `${Math.round(((p.fours + p.sixes) / p.balls) * 100)}%` : '-'}</b></div>
              <div className="pst"><span>Balls</span><b>{p.balls}</b></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MatchPhases({ b, innings }: { b: MatchBundle; innings: readonly InningsCard[] }) {
  const { bar, side } = useSides(innings.map((i) => i.team));
  return <>{bar}<div className="phpair" data-side={side}>{pickSide(innings.map((inn) => <SidePhases key={inn.n} b={b} inn={inn} />), side)}</div></>;
}
