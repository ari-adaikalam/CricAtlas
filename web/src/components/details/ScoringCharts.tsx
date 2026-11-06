'use client';

import { TeamSwatch } from '../TeamSwatch';
import { TeamLabel } from '../TeamLinks';
import { useCallback, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ChartTip } from '../ChartTip';
import { CountText } from '../charts/CountUp';
import { useBox } from '../charts/useBox';
import { usePlayOnView } from '../charts/usePlayOnView';
import { PlayerName } from '../PlayerName';
import type { InningsCard, MatchBundle, SubMark } from '@/domain/match';
import { fowAxis, fowRows, inningsName, standRows, standScale, standTip, standTipParts, type StandRow } from '@/domain/matchDetails';
import { Pan } from './Pan';
import { pickSide, useSides } from '../analysis/useSides';
import { sideLabel } from './DetailTables';
import { TipBody } from '../TipBody';

// The two scoring charts of Match details: Partnerships as paired bars for each stand, Fall of wickets as a runs line with a stem for each wicket.

interface PartProps { b: MatchBundle; innings: InningsCard[]; marks: Map<string, SubMark> }
const LEFT_BAR = '#EBC862', RIGHT_BAR = '#56B4E9', MUTED = '#A8A8A8';
const whole = (n: number): string => String(Math.round(n));
const heading = (b: MatchBundle, i: InningsCard): string => (b.match.kind === 'test' ? `${i.team}, ${inningsName(b, i)}` : `${i.team} batting`);
function Sides({ count, labels, children }: { count: number; labels: readonly string[]; children: React.ReactNode }) {
  const { bar, side } = useSides(labels);
  return <>{bar}<div className={`two2${count === 1 ? ' one' : ''}`} data-side={side}>{pickSide(children, side)}</div></>;
}

function StandsTable({ i, scale, marks, played }: { b: MatchBundle; i: InningsCard; scale: number; marks: Map<string, SubMark>; played: boolean }) {
  const [tip, setTip] = useState<{ row: StandRow; x: number; y: number } | null>(null);
  const rows = standRows(i);
  const move = (row: StandRow) => (e: PointerEvent<HTMLTableRowElement>) => setTip({ row, x: e.clientX, y: e.clientY });
  const focus = (row: StandRow) => (e: KeyboardEvent<HTMLTableRowElement> | React.FocusEvent<HTMLTableRowElement>) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ row, x: r.left + r.width / 2, y: r.top }); };
  const width = (runs: number): string => `${Math.round((runs / scale) * 100)}%`;
  return (
    <>
      <table className="cmp2 pship"><colgroup><col /><col /><col /><col /><col /></colgroup>
        <thead><tr><th style={{ textAlign: 'left' }}>Wkt</th><th style={{ textAlign: 'right' }}>Batter</th><th className="pbh">Runs (balls)</th><th style={{ textAlign: 'left' }}>Partner</th><th>Partnership</th></tr></thead>
        <tbody>
          {rows.map((s, k) => (
            <tr key={k} tabIndex={0} onPointerMove={move(s)} onPointerLeave={() => setTip(null)} onFocus={focus(s)} onBlur={() => setTip(null)} aria-label={standTip(s)}>
              <td style={{ textAlign: 'left' }}>{s.label}</td>
              <td style={{ textAlign: 'right' }}><PlayerName id={s.a.id} name={s.a.name} marks={marks} /></td>
              <td className="pb">
                <span className="ph-l"><em>{s.a.runs} ({s.a.balls})</em><i style={{ width: width(s.a.runs), background: LEFT_BAR }} /></span>
                <span className="ph-r"><i style={{ width: width(s.b.runs), background: RIGHT_BAR }} /><em>{s.b.runs} ({s.b.balls})</em></span>
              </td>
              <td style={{ textAlign: 'left' }}><PlayerName id={s.b.id} name={s.b.name} marks={marks} /></td>
              <td><b><CountText value={s.runs} format={whole} play={played} /></b>{s.unbroken ? '*' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tip && <ChartTip x={tip.x} y={tip.y}><TipBody {...standTipParts(tip.row)} /></ChartTip>}
    </>
  );
}

export function PartnershipsPart({ b, innings, marks }: PartProps) {
  const scale = standScale(innings);
  return (
    <Sides count={innings.length} labels={innings.map((i) => sideLabel(b, i))}>
      {innings.map((i) => (
        <Pan key={i.n} team={i.team} title={heading(b, i)} dataKey={`ps:${b.match.id}:${i.n}`}>
          {(played) => <StandsTable b={b} i={i} scale={scale} marks={marks} played={played} />}
        </Pan>
      ))}
    </Sides>
  );
}

const STEM = 78;
/** About how wide a wicket's detail lines are, so two on the same side are told apart by their real width and not a fixed gap. */
const reach = (r: { name: string; score: string; when: string; shot: string }): number => Math.max(`${r.name}, ${r.score}, ${r.when}`.length, r.shot.length) * 11 * 0.56;

/** One innings' runs line: the wickets stand above and below it in turn, each with its score, the batter's score, the over and the shot. A close neighbour on the same side drops its detail lines and keeps only the score. */
function FallLine({ b, i, max, step }: { b: MatchBundle; i: InningsCard; max: number; step: number }) {
  const { ref: boxRef, w: W, h: H } = useBox<SVGSVGElement>();
  const { ref: playRef, played } = usePlayOnView<SVGSVGElement>(`${b.match.id}:${i.n}:${max}`);
  const ref = useCallback((node: SVGSVGElement | null) => { playRef(node); boxRef(node); }, [playRef, boxRef]);
  const [at, setAt] = useState<{ n: number; x: number; y: number } | null>(null);
  const rows = fowRows(b, i);
  const x = (v: number): number => 40 + (v / max) * (W - 80);
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, k) => k * step);
  // Wickets on the same side that fall close together would write their scores over each other, so each score takes the first line, counting up from its stem, that no near neighbour on that side
  // already uses. The stems are then shortened to leave room for the lines needed, and a score that still has no room (a very short panel) is left out. Its tooltip names it.
  const isUp = (k: number): boolean => k % 2 === 0;
  const levels: number[] = [];
  rows.forEach((r, k) => {
    const hw = (r.label.length * 14 * 0.56) / 2, taken = new Set<number>();
    for (let j = 0; j < k; j++) if (isUp(j) === isUp(k) && Math.abs(x(rows[j]!.runs) - x(r.runs)) < hw + (rows[j]!.label.length * 14 * 0.56) / 2 + 6) taken.add(levels[j]!);
    let level = 0; while (taken.has(level)) level += 1;
    levels.push(level);
  });
  const deepest = Math.max(0, ...levels);
  // A short panel has no room for the batter and shot lines under a stem, so they are left to the tooltip and the stem stays inside the chart.
  const compact = H < 200;
  const mid = H / 2, stem = Math.max(16, Math.min(compact ? H / 2 - 38 : Math.min(H / 2 - 52, STEM), H / 2 - 24 - 15 * deepest));
  const room = (k: number): number => Math.floor((isUp(k) ? mid - stem - 20 : H - (mid + stem) - 24) / 15);
  const fits = (k: number): boolean => levels[k]! <= Math.max(0, room(k));
  const open = (n: number) => (e: PointerEvent<SVGGElement>) => setAt({ n, x: e.clientX, y: e.clientY });
  const key = (n: number) => (e: KeyboardEvent<SVGGElement>) => { const r = e.currentTarget.getBoundingClientRect(); setAt({ n, x: r.left + r.width / 2, y: r.top }); };
  const tipRow = at ? rows[at.n] : undefined;
  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${heading(b, i)}: ${i.wkts} ${i.wkts === 1 ? 'wicket' : 'wickets'} fell${rows.length > i.wkts ? `, ${rows.length - i.wkts} retired` : ''}`}>
        <line x1={40} x2={W - 40} y1={mid} y2={mid} stroke="rgba(255,255,255,.25)" strokeWidth="3" />
        {ticks.map((v) => <text key={v} x={x(v)} y={mid + 32} textAnchor="middle" fill={MUTED} fontSize="12">{v}</text>)}
        {rows.map((r, k) => {
          const up = isUp(k), end = up ? mid - stem : mid + stem, px = x(r.runs);
          const crowded = compact || !fits(k) || rows.some((o, k2) => k2 !== k && (k2 % 2 === 0) === up && Math.abs(x(o.runs) - px) < (reach(rows[k]!) + reach(o)) / 2 + 10);
          const near = up ? end - (crowded ? 4 + levels[k]! * 15 : 15) : end + (crowded ? 14 + levels[k]! * 15 : 18);
          // A line centred on the stem would run past the chart at either end of the axis, so it is anchored to the edge there instead.
          const place = (text: string, size: number): { x: number; anchor: 'start' | 'middle' | 'end' } => {
            const half = (text.length * size * 0.56) / 2;
            return px - half < 6 ? { x: 6, anchor: 'start' } : px + half > W - 6 ? { x: W - 6, anchor: 'end' } : { x: px, anchor: 'middle' };
          };
          const name = `${r.name}, ${r.score}, ${r.when}`, score = r.label;
          const pn = place(name, 11), ps = place(r.shot, 11), pr = place(score, 14);
          return (
            <g key={`${r.label}:${k}`} tabIndex={0} className="fow-g" style={{ ['--i' as string]: Math.min(k, 8) }} onPointerMove={open(k)} onPointerLeave={() => setAt(null)} onFocus={key(k) as never} onBlur={() => setAt(null)}>
              <line x1={px} x2={px} y1={mid} y2={end} stroke="rgba(255,255,255,.4)" />
              <circle cx={px} cy={mid} r="5" fill={r.retired ? '#1B1B1B' : '#fff'} stroke={r.retired ? '#fff' : '#1B1B1B'} strokeWidth="2" />
              {fits(k) && <text x={pr.x} y={near} textAnchor={pr.anchor} fill="#fff" fontSize="14" fontWeight="600">{score}</text>}
              {!crowded && !compact && <text x={pn.x} y={up ? end - 3 : end + 31} textAnchor={pn.anchor} fill={MUTED} fontSize="11">{name}</text>}
              {!crowded && !compact && r.shot && <text x={ps.x} y={up ? end - 28 : end + 43} textAnchor={ps.anchor} fill="#EBC862" fontSize="11">{r.shot}</text>}
              <rect x={px - 14} y={Math.min(mid, end) - 6} width="28" height={stem + 12} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {at && tipRow && <ChartTip x={at.x} y={at.y}><TipBody title={tipRow.label} sub={tipRow.name} rows={[{ label: 'Scored', value: tipRow.score }, { label: 'When', value: tipRow.when }, ...(tipRow.shot ? [{ label: tipRow.retired ? 'Retired' : 'Out', value: tipRow.shot }] : [])]} /></ChartTip>}
    </>
  );
}

export function FallOfWicketsPart({ b, innings }: Omit<PartProps, 'marks'>) {
  // Two innings of a limited-overs match share one axis so the lines compare. Innings of a Test differ too much in length for that, so each has its own.
  const shared = fowAxis(innings);
  // Two innings fit one above the other on a phone; the four of a Test get a chip each.
  const { bar, side } = useSides(innings.length > 2 ? innings.map((i) => sideLabel(b, i)) : []);
  return (
    <>
    {bar}
    <div className={`fwrow${innings.length === 1 ? ' one' : ''}`} data-side={side}>
      {pickSide(innings.map((i) => {
        const { max, step } = b.match.kind === 'test' ? fowAxis([i]) : shared;
        return (
          <div key={i.n}>
            <h5 className="h5"><TeamSwatch team={i.team} /><TeamLabel team={i.team} text={heading(b, i)} /></h5>
            <div className="art">{fowRows(b, i).length === 0 ? <p className="rempty">No wickets fell.</p> : <FallLine b={b} i={i} max={max} step={step} />}</div>
            {/* The list under the line is for the phone, where a Test shows one innings at a time (globals.css hides it elsewhere). */}
            {innings.length > 2 && fowRows(b, i).length > 0 && (
              <ol className="fwl">
                {fowRows(b, i).map((r, k) => (
                  <li key={`${r.label}:${k}`}><b>{r.label}</b><span>{r.name}</span><em>{r.score}</em><i>{r.when}</i>{r.shot && <u>{r.shot}</u>}</li>
                ))}
              </ol>
            )}
          </div>
        );
      }), side)}
    </div>
    </>
  );
}
