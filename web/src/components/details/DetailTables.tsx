'use client';

import type { ReactNode } from 'react';
import { CountText } from '../charts/CountUp';
import { PlayerName } from '../PlayerName';
import type { InningsCard, MatchBundle, SubMark } from '@/domain/match';
import { sides } from '@/domain/match';
import {
  ballLabel, decisionText, dotShare, extrasText, extrasTotal, fieldingTables, figureHeaders, figureRows, howOutParts, inningsName, oversWord, phaseName, phaseRange, phasesOf, playerIdsByName, reviewSummary, reviewTables,
  runRate, strikeRate, totalText,
} from '@/domain/matchDetails';
import { Pan } from './Pan';
import { pickSide, useSides } from '../analysis/useSides';

interface PartProps { b: MatchBundle; innings: InningsCard[]; marks: Map<string, SubMark> }

const whole = (n: number): string => String(Math.round(n));
const other = (b: MatchBundle, team: string): string => (b.match.teams[0]!.name === team ? b.match.teams[1]!.name : b.match.teams[0]!.name);

/** "Team A batting, 178 all out", and for a Test "Team A, 1st innings, 312/6 declared". */
function batHeading(b: MatchBundle, i: InningsCard): string {
  return b.match.kind === 'test' ? `${i.team}, ${inningsName(b, i)}, ${totalText(b, i)}` : `${i.team} batting, ${totalText(b, i)}`;
}
/** A part's two panels, or one when only one side has something to show. On a phone one panel shows at a time, picked by a chip for each (the team, or the innings of a Test). */
function Sides({ count, labels, children }: { count: number; labels: readonly string[]; children: ReactNode }) {
  const { bar, side } = useSides(labels);
  return <>{bar}<div className={`two2${count === 1 ? ' one' : ''}`} data-side={side}>{pickSide(children, side)}</div></>;
}
/** What the chip of an innings' panel says: the team in a match of two innings, the innings in a Test. */
export const sideLabel = (b: MatchBundle, i: InningsCard): string => {
  if (b.match.kind !== 'test') return i.team;
  const n = inningsName(b, i);
  return n.charAt(0).toUpperCase() + n.slice(1);
};

export function BattingPart({ b, innings, marks }: PartProps) {
  const ids = playerIdsByName(b);
  return (
    <Sides count={innings.length} labels={innings.map((i) => sideLabel(b, i))}>
      {innings.map((i) => (
        <Pan key={i.n} team={i.team} title={batHeading(b, i)} dataKey={`bat:${b.match.id}:${i.n}`}>
          {(played) => (
            <>
              <table className="cmp2" data-t="batt">
                <thead><tr><th>Batter</th><th className="how" style={{ textAlign: 'left' }}>How out</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
                <tbody>
                  {i.batters.map((c, k) => (
                    <tr key={`${c.id ?? c.name}:${k}`}>
                      <td><PlayerName id={c.id} name={c.name} marks={marks} /></td>
                      <td className="how" style={{ textAlign: 'left', color: 'var(--mut)' }}>{howOutParts(c.out).map((x, n) => (typeof x === 'string' ? x : <PlayerName key={n} id={(x.name === c.out?.bowler ? c.out.bowlerId : null) ?? ids.get(x.name.replace(/ \(sub\)$/, '')) ?? null} name={x.name} marks={marks} />))}</td>
                      <td><b><CountText value={c.runs} format={whole} play={played} /></b></td>
                      <td>{c.balls}</td><td>{c.fours}</td><td>{c.sixes}</td><td>{strikeRate(c.runs, c.balls) ?? '-'}</td>
                    </tr>
                  ))}
                  <tr><td>Extras</td><td className="how" style={{ textAlign: 'left', color: 'var(--mut)' }}>{extrasText(i)}</td><td><b>{extrasTotal(i)}</b></td><td colSpan={4} /></tr>
                  <tr className="tot"><td>Total</td><td className="how" style={{ textAlign: 'left', color: 'var(--mut)' }}>{oversWord(b, i)}</td><td colSpan={5}>{totalText(b, i)}</td></tr>
                </tbody>
              </table>
              {i.didNotBat.length > 0 && <p className="dnb"><b>Did not bat:</b> {i.didNotBat.map((p, k) => <span key={`${p.id ?? p.name}:${k}`}>{k > 0 ? ', ' : ''}<PlayerName id={p.id} name={p.name} marks={marks} /></span>)}</p>}
            </>
          )}
        </Pan>
      ))}
    </Sides>
  );
}

export function PhasesPart({ b, innings }: Omit<PartProps, 'marks'>) {
  const hundred = b.match.kind === 'hundred';
  const rates = innings.flatMap((i) => phasesOf(i).map((p) => (p.balls > 0 ? p.runs / (p.balls / (hundred ? 5 : b.match.ballsPerOver || 6)) : 0)));
  const top = Math.max(1, ...rates);
  return (
    <Sides count={innings.length} labels={innings.map((i) => sideLabel(b, i))}>
      {innings.map((i) => (
        <Pan key={i.n} team={i.team} title={b.match.kind === 'test' ? `${i.team}, ${inningsName(b, i)}` : `${i.team} batting`} dataKey={`ph:${b.match.id}:${i.n}`}>
          {(played) => (
            <table className="cmp2 ph">
              <thead><tr><th>Phase</th><th>Runs</th><th>Wkts</th><th>{hundred ? 'Per 5 balls' : 'Run rate'}</th><th /><th>Dots</th><th>Bdry</th></tr></thead>
              <tbody>
                {phasesOf(i).map((p) => {
                  const rate = runRate(b, p);
                  return (
                    <tr key={p.key}>
                      <td><b>{phaseName(b, p)}</b>{!p.key.startsWith('band') && <><br /><span className="g">{phaseRange(b, i, p)}</span></>}</td>
                      <td><b><CountText value={p.runs} format={whole} play={played} /></b></td><td>{p.wkts}</td><td>{rate}</td>
                      <td style={{ width: '24%' }}><span className="bar" style={{ width: `${rate === '-' ? 0 : Math.round((Number(rate) / top) * 100)}%` }} /></td>
                      <td>{dotShare(p)}</td><td>{p.fours + p.sixes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Pan>
      ))}
    </Sides>
  );
}

export function BowlingPart({ b, innings, marks }: PartProps) {
  const headers = figureHeaders(b);
  return (
    <Sides count={innings.length} labels={innings.map((i) => (b.match.kind === 'test' ? sideLabel(b, i) : other(b, i.team)))}>
      {innings.map((i) => (
        <Pan key={i.n} team={other(b, i.team)} title={b.match.kind === 'test' ? `${other(b, i.team)} bowling, ${inningsName(b, i)}` : `${other(b, i.team)} bowling`} dataKey={`bowl:${b.match.id}:${i.n}`}>
          {(played) => (
            <table className="cmp2" data-t="bowl">
              <thead><tr>{headers.map((h, k) => <th key={h} style={k === 0 ? { textAlign: 'left' } : undefined}>{h}</th>)}</tr></thead>
              <tbody>
                {figureRows(b, i).map((r, k) => (
                  <tr key={`${r.id ?? r.name}:${k}`}>
                    <td style={{ textAlign: 'left' }}><PlayerName id={r.id} name={r.name} marks={marks} /></td>
                    <td>{r.balls}</td><td>{r.extra}</td><td>{r.runs}</td><td><b><CountText value={r.wkts} format={whole} play={played} /></b></td><td>{r.econ}</td><td>{r.wd}</td><td>{r.nb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Pan>
      ))}
    </Sides>
  );
}

export function ExtrasPart({ b, innings }: Omit<PartProps, 'marks'>) {
  return (
    <Sides count={innings.length} labels={innings.map((i) => sideLabel(b, i))}>
      {innings.map((i) => {
        const rows = phasesOf(i);
        const e = i.extras;
        return (
          <Pan key={i.n} team={i.team} title={`${b.match.kind === 'test' ? `${i.team}, ${inningsName(b, i)}` : `${i.team} batting`}, ${extrasTotal(i)} ${extrasTotal(i) === 1 ? 'extra' : 'extras'}`} dataKey={`ex:${b.match.id}:${i.n}`}>
            {(played) => (
              <table className="cmp2 ph">
                <thead><tr><th>Phase</th><th>Wides</th><th>No balls</th><th>Byes</th><th>Leg byes</th><th>Penalty</th><th>Total</th></tr></thead>
                <tbody>
                  {rows.map((p) => {
                    const x = p.extras;
                    return <tr key={p.key}><td><b>{phaseName(b, p)}</b></td><td>{x.wd}</td><td>{x.nb}</td><td>{x.b}</td><td>{x.lb}</td><td>{x.pen}</td><td><b><CountText value={x.wd + x.nb + x.b + x.lb + x.pen} format={whole} play={played} /></b></td></tr>;
                  })}
                  <tr><td><b>Total</b></td><td><b>{e.wd}</b></td><td><b>{e.nb}</b></td><td><b>{e.b}</b></td><td><b>{e.lb}</b></td><td><b>{e.pen}</b></td><td><b>{extrasTotal(i)}</b></td></tr>
                </tbody>
              </table>
            )}
          </Pan>
        );
      })}
    </Sides>
  );
}

export function FieldingPart({ b, innings, marks }: PartProps) {
  const tables = fieldingTables(b, innings);
  return (
    <Sides count={tables.length} labels={tables.map((t) => t.team)}>
      {tables.map((t) => (
        <Pan key={t.team} team={t.team} title={`${t.team} fielding, ${t.total} ${t.total === 1 ? 'dismissal' : 'dismissals'}`} dataKey={`fd:${b.match.id}:${t.team}:${innings.map((i) => i.n).join('')}`}>
          {(played) => t.rows.length === 0 ? <p className="rempty">No catches, stumpings or run outs were credited.</p> : (
            <table className="cmp2 ph" data-t="field">
              <thead><tr><th>Fielder</th><th>Catches</th><th>Stumpings</th><th>Run outs</th><th>Total</th></tr></thead>
              <tbody>
                {t.rows.map((r, k) => (
                  <tr key={`${r.id ?? r.name}:${k}`}>
                    <td><b>{r.sub && !r.id ? <span>{r.name}</span> : <PlayerName id={r.id} name={r.name} marks={marks} />}{r.sub && r.id ? <span className="g"> (sub)</span> : null}</b></td>
                    <td>{r.c}</td><td>{r.st}</td><td>{r.ro}</td><td><b><CountText value={r.c + r.st + r.ro} format={whole} play={played} /></b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Pan>
      ))}
    </Sides>
  );
}

export function ReviewsPart({ b, innings, marks }: PartProps) {
  const tables = reviewTables(b, innings);
  // Both sides get a panel, the side that batted first on the left, so a side with no review says so.
  const teams = sides(b).filter((t) => innings.some((i) => i.team === t || other(b, i.team) === t));
  return (
    <Sides count={teams.length} labels={teams}>
      {teams.map((team) => {
        const t = tables.find((x) => x.team === team);
        return (
          <Pan key={team} team={team} title={t ? `${team} reviews, ${reviewSummary(t)}` : `${team} reviews`} dataKey={`rv:${b.match.id}:${team}:${innings.map((i) => i.n).join('')}`}>
            {() => !t ? <p className="rempty">{team} did not review.</p> : (
              <table className="cmp2 ph" style={{ tableLayout: 'fixed' }}>
                {/* Fixed widths: both teams and every innings keep the same columns in the same places. */}
                <colgroup><col style={{ width: '14%' }} /><col style={{ width: '40%' }} /><col style={{ width: '28%' }} /><col style={{ width: '18%' }} /></colgroup>
                <thead><tr><th>{b.match.kind === 'hundred' ? 'Ball' : 'Over'}</th><th>Batter</th><th>Decision</th><th>Umpires call</th></tr></thead>
                <tbody>
                  {t.rows.map((r, k) => (
                    <tr key={`${r.innings}:${r.ballText}:${k}`}>
                      <td>{ballLabel(b, r.over, r.ballText)}</td><td><b><PlayerName id={r.batterId} name={r.batter} marks={marks} /></b></td><td>{decisionText(r)}</td><td>{r.umpiresCall ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Pan>
        );
      })}
    </Sides>
  );
}
