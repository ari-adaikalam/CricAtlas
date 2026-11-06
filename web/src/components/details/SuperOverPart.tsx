'use client';

import { CountText } from '../charts/CountUp';
import { PlayerName } from '../PlayerName';
import type { MatchBundle, SubMark } from '@/domain/match';
import { extrasText, extrasTotal } from '@/domain/matchDetails';
import { roundResult, superBatters, superBowling, superTitle, type SuperRound } from '@/domain/superOver';
import { Pan } from './Pan';

const whole = (n: number): string => String(Math.round(n));

/** The Super Over of one round: a one-over scorecard for each side, the side that batted first on the left, the bowling line under each, and what the round decided. */
export function SuperOverPart({ b, rounds, at, marks }: { b: MatchBundle; rounds: readonly SuperRound[]; at: number; marks: Map<string, SubMark> }) {
  const round = rounds[at];
  if (!round) return null;
  const sides = [round.first, ...(round.second ? [round.second] : [])];
  return (
    <>
      <div className={`two2${sides.length === 1 ? ' one' : ''}`}>
        {sides.map((i) => (
          <Pan key={i.n} team={i.team} title={superTitle(b, i)} dataKey={`so:${b.match.id}:${i.n}`}>
            {(played) => (
              <>
                <table className="cmp2">
                  <thead><tr><th style={{ textAlign: 'left' }}>Batter</th><th className="how" style={{ textAlign: 'left' }}>How out</th><th>R</th><th>B</th></tr></thead>
                  <tbody>
                    {superBatters(i).map((c, k) => (
                      <tr key={`${c.id ?? c.name}:${k}`}>
                        <td style={{ textAlign: 'left' }}><PlayerName id={c.id} name={c.name} marks={marks} /></td>
                        <td className="how" style={{ textAlign: 'left', color: 'var(--mut)' }}>{c.how}</td>
                        <td><b><CountText value={c.runs} format={whole} play={played} /></b></td><td>{c.balls}</td>
                      </tr>
                    ))}
                    {extrasTotal(i) > 0 && <tr><td style={{ textAlign: 'left' }}>Extras</td><td className="how" style={{ textAlign: 'left', color: 'var(--mut)' }}>{extrasText(i)}</td><td><b>{extrasTotal(i)}</b></td><td /></tr>}
                  </tbody>
                </table>
                <h5 className="sobowl">Bowling: {superBowling(b, i)}</h5>
              </>
            )}
          </Pan>
        ))}
      </div>
      <div className="sores">{roundResult(rounds, at)}</div>
    </>
  );
}
