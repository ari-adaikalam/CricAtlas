'use client';

import { useCallback, useMemo, useState, type PointerEvent } from 'react';
import { ChartTip } from '../ChartTip';
import { useBox } from '../charts/useBox';
import { usePlayOnView } from '../charts/usePlayOnView';
import { scoreText, type InningsCard, type MatchBundle } from '@/domain/match';
import { niceAxis } from '@/domain/seasons';
import { Bands } from './FlowCharts';
import type { Chase, ParSeries, WinPoint } from '@/domain/story';
import { TipBody } from '../TipBody';

// The story tiles of the Match Analysis: the win probability of the match, the first innings against its par band and the chase as the rate
// needed against the rate so far. Win probability and the projected finish are the tracked values only.

const GRID = 'rgba(255,255,255,.12)', MUTED = '#A8A8A8', INK = '#ECECEC';
const LEFT = 46, TOP = 26;

function useChart(signature: string) {
  const { ref: boxRef, w: W, h: H } = useBox<SVGSVGElement>();
  const { ref: playRef, played } = usePlayOnView<SVGSVGElement>(signature);
  const ref = useCallback((node: SVGSVGElement | null) => { playRef(node); boxRef(node); }, [playRef, boxRef]);
  return { ref, W, H, played };
}

function Wicket({ x, y, r = 6.5 }: { x: number; y: number; r?: number }) {
  return (
    <g className="line-draw-dot" pointerEvents="none">
      <circle cx={x} cy={y} r={r} fill="#fff" stroke="#1B1B1B" strokeWidth="1.5" />
      <text x={x} y={y + r * 0.38} textAnchor="middle" fontSize={r * 1.15} fontWeight="800" fill="#1B1B1B">W</text>
    </g>
  );
}

function Legend({ items, x, y }: { items: ReadonlyArray<{ colour: string; label: string; dash?: string; fill?: boolean }>; x: number; y: number }) {
  let at = x;
  return (
    <g pointerEvents="none">
      {items.map((it) => {
        const out = (
          <g key={it.label}>
            {it.fill ? <rect x={at} y={y - 5} width="14" height="10" rx="2" fill={it.colour} fillOpacity=".35" /> : <line x1={at} x2={at + 16} y1={y} y2={y} stroke={it.colour} strokeWidth="3" strokeDasharray={it.dash} />}
            <text x={at + 22} y={y + 4} fill={INK} fontSize="12">{it.label}</text>
          </g>
        );
        at += 28 + it.label.length * 6.6 + 10;
        return out;
      })}
    </g>
  );
}

const path = (pts: ReadonlyArray<readonly [number, number]>): string => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');

/** The win probability of the match: the chance of the side that batted first, ball by ball across both innings, shaded for whoever is ahead, a disc at each wicket. */
export function WinChart({ b, points, teams, colours, result }: { b: MatchBundle; points: readonly WinPoint[]; teams: readonly [string, string]; colours: readonly [string, string]; result: string }) {
  const { ref, W, H, played } = useChart(`win:${b.match.id}:${points.length}:${points.reduce((a, p) => a + p.p, 0)}`);
  const [at, setAt] = useState<{ i: number; x: number; y: number } | null>(null);
  const R = W - 16, BASE = H - 44;
  const last = points[points.length - 1]!.x;
  const x = (v: number): number => LEFT + (v / last) * (R - LEFT);
  const y = (p: number): number => BASE - (p / 100) * (BASE - TOP);
  const mid = y(50);
  const line = path(points.map((p) => [x(p.x), y(p.p)] as const));
  const area = `${line}L${x(last)} ${mid}L${x(points[0]!.x)} ${mid}Z`;
  const split = points.find((p) => p.innings === 2);
  function move(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const v = ((((e.clientX - box.left) / box.width) * W - LEFT) / (R - LEFT)) * last;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i]!.x - v) < Math.abs(points[best]!.x - v)) best = i;
    setAt({ i: best, x: e.clientX, y: e.clientY });
  }
  const tip = at ? points[at.i]! : null;
  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Win probability: ${result}`} onPointerLeave={() => setAt(null)}>
        <defs>
          <clipPath id={`wt${b.match.id}`}><rect x={LEFT} y={TOP} width={R - LEFT} height={mid - TOP} /></clipPath>
          <clipPath id={`wb${b.match.id}`}><rect x={LEFT} y={mid} width={R - LEFT} height={BASE - mid} /></clipPath>
        </defs>
        {[100, 75, 50, 25, 0].map((p) => <g key={p}><line x1={LEFT} x2={R} y1={y(p)} y2={y(p)} stroke={p === 50 ? '#454a53' : GRID} /><text x={LEFT - 8} y={y(p) + 4} fill={MUTED} fontSize="11" textAnchor="end">{p <= 50 ? 100 - p : p}%</text></g>)}
        <text x={14} y={y(75)} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 14 ${y(75)})`}>{teams[0]}</text>
        <text x={14} y={y(25)} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 14 ${y(25)})`}>{teams[1]}</text>
        {split && <g pointerEvents="none"><line x1={x(split.x - 0.5)} x2={x(split.x - 0.5)} y1={TOP} y2={BASE} stroke={GRID} /><text x={(x(1) + x(split.x - 0.5)) / 2} y={BASE - 6} fill={MUTED} fontSize="11" textAnchor="middle">{teams[0]} innings</text><text x={(x(split.x - 0.5) + x(last)) / 2} y={BASE - 6} fill={MUTED} fontSize="11" textAnchor="middle">{teams[1]} innings</text></g>}
        <g className="band-fade" pointerEvents="none">
          <path d={area} fill={colours[0]} fillOpacity=".24" clipPath={`url(#wt${b.match.id})`} />
          <path d={area} fill={colours[1]} fillOpacity=".24" clipPath={`url(#wb${b.match.id})`} />
        </g>
        <path className="line-draw" pathLength={1} d={line} fill="none" stroke={colours[0]} strokeWidth="3" strokeLinejoin="round" clipPath={`url(#wt${b.match.id})`} />
        <path className="line-draw" pathLength={1} d={line} fill="none" stroke={colours[1]} strokeWidth="3" strokeLinejoin="round" clipPath={`url(#wb${b.match.id})`} />
        {points.filter((p) => p.wicket).map((p) => <Wicket key={p.x} x={x(p.x)} y={y(p.p)} />)}
        {at && tip && <line x1={x(tip.x)} x2={x(tip.x)} y1={TOP} y2={BASE} stroke="#fff" strokeOpacity=".35" pointerEvents="none" />}
        <text x={LEFT} y={H - 8} fill={INK} fontSize="12">{result}</text>
        <text x={R} y={H - 8} textAnchor="end" fill={MUTED} fontSize="11">W = wicket</text>
        <rect x={LEFT} y={TOP} width={R - LEFT} height={BASE - TOP} fill="transparent" onPointerMove={move} />
      </svg>
      {at && tip && <ChartTip x={at.x} y={at.y}><TipBody title={tip.label} sub="Chance of winning" rows={[{ label: teams[0], value: `${Math.round(tip.p)}%` }, { label: teams[1], value: `${Math.round(100 - tip.p)}%` }, { label: 'Score', value: `${tip.innings === 1 ? teams[0] : teams[1]} ${tip.score}` }]} /></ChartTip>}
    </>
  );
}

/** The first innings: the score after each over against the middle half of comparable first innings, with the projected finish where there is one. */
export function ParChart({ b, inn, series, colour, team, scopeNote }: { b: MatchBundle; inn: InningsCard; series: ParSeries; colour: string; team: string; scopeNote: string }) {
  const n = series.band.mid.length - 1;
  const peak = Math.max(...series.actual, ...series.band.high, ...series.projected.map((v) => v ?? 0));
  const axis = useMemo(() => niceAxis(peak * 1.05), [peak]);
  const { ref, W, H, played } = useChart(`par:${b.match.id}:${series.actual.length}:${series.actual[series.actual.length - 1]}`);
  const [at, setAt] = useState<{ k: number; x: number; y: number } | null>(null);
  const R = W - 16, BASE = H - 40;
  const unit = b.match.kind === 'hundred' ? 5 : 1;
  const x = (k: number): number => LEFT + (k / n) * (R - LEFT);
  const y = (v: number): number => BASE - (v / axis.top) * (BASE - TOP);
  const idx = Array.from({ length: n + 1 }, (_, k) => k);
  const band = `${path(idx.map((k) => [x(k), y(series.band.high[k]!)] as const))}${idx.slice().reverse().map((k) => `L${x(k).toFixed(1)} ${y(series.band.low[k]!).toFixed(1)}`).join('')}Z`;
  const played_ = series.actual.length;
  const proj = series.projected.map((v, k) => (v === null ? null : ([x(k), y(v)] as const))).filter((p): p is readonly [number, number] => p !== null);
  const step = n > 20 ? 10 : 5;
  const word = b.match.kind === 'hundred' ? 'Balls' : 'Overs';
  function move(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const k = Math.round(((((e.clientX - box.left) / box.width) * W - LEFT) / (R - LEFT)) * n);
    setAt({ k: Math.max(1, Math.min(n, k)), x: e.clientX, y: e.clientY });
  }
  const k = at?.k ?? 0;
  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Par score: ${team} ${series.actual[played_ - 1]} after ${played_ - 1} overs`} onPointerLeave={() => setAt(null)}>
        {[0, 1, 2, 3].map((j) => { const v = j * axis.step; return <g key={j}><line x1={LEFT} x2={R} y1={y(v)} y2={y(v)} stroke={GRID} /><text x={LEFT - 8} y={y(v) + 4} fill={MUTED} fontSize="11" textAnchor="end">{v}</text></g>; })}
        {idx.filter((j) => j % step === 0).map((j) => <text key={j} x={x(j)} y={BASE + 16} fill={MUTED} fontSize="11" textAnchor="middle">{j * unit}</text>)}
        <text x={LEFT} y={H - 4} fill={MUTED} fontSize="11">{word}</text>
        <text x={12} y={(TOP + BASE) / 2} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 12 ${(TOP + BASE) / 2})`}>Runs</text>
        <Bands b={b} inn={inn} x={x} top={TOP} bottom={BASE} />
        <path className="band-fade" d={band} fill="#fff" fillOpacity=".12" pointerEvents="none" />
        <path className="line-draw" pathLength={1} d={path(idx.map((j) => [x(j), y(series.band.mid[j]!)] as const))} fill="none" stroke={MUTED} strokeWidth="2" strokeDasharray="5 4" pointerEvents="none" style={{ strokeDasharray: '5 4' }} />
        {proj.length > 1 && <path className="band-fade" d={path(proj)} fill="none" stroke={colour} strokeWidth="2.5" strokeDasharray="2 5" strokeLinecap="round" pointerEvents="none" />}
        <path className="line-draw" pathLength={1} d={path(series.actual.map((v, j) => [x(j), y(v)] as const))} fill="none" stroke={colour} strokeWidth="3" strokeLinejoin="round" pointerEvents="none" />
        <Legend items={[{ colour, label: team }, { colour: MUTED, label: 'Par', dash: '5 4' }, { colour: '#fff', label: 'Middle half', fill: true }, ...(proj.length > 1 ? [{ colour, label: 'Projected', dash: '2 5' }] : [])]} x={LEFT + 8} y={TOP - 12} />
        <text x={R} y={H - 4} textAnchor="end" fill={MUTED} fontSize="10.5">{scopeNote}</text>
        {at && <line x1={x(k)} x2={x(k)} y1={TOP} y2={BASE} stroke="#fff" strokeOpacity=".35" pointerEvents="none" />}
        <rect x={LEFT} y={0} width={R - LEFT} height={BASE} fill="transparent" onPointerMove={move} />
      </svg>
      {at && (
        <ChartTip x={at.x} y={at.y}>
          <TipBody
            title={b.match.kind === 'hundred' ? `Ball ${k * 5}` : `After over ${k}`}
            rows={[
              { label: team, value: k < series.actual.length ? String(series.actual[k]) : 'Innings over' },
              { label: 'Par', value: String(series.band.mid[k]) },
              { label: 'Middle half', value: `${series.band.low[k]} to ${series.band.high[k]}` },
              ...(series.projected[k] != null ? [{ label: 'Projected', value: String(series.projected[k]) }] : []),
            ]}
          />
        </ChartTip>
      )}
    </>
  );
}

/** The chase: the rate needed from each over on, against the rate so far, with the target. */
export function ChaseChart({ b, inn, chase, colour, team, target }: { b: MatchBundle; inn: InningsCard; chase: Chase; colour: string; team: string; target: string }) {
  const rows = chase.rows.filter((r) => r.required !== null);
  const peak = Math.max(6, chase.target / (chase.scheduledBalls / chase.perOver), ...rows.flatMap((r) => [r.required ?? 0, r.current]));
  const axis = useMemo(() => niceAxis(peak * 1.05), [peak]);
  const total = Math.round(chase.scheduledBalls / chase.perOver);
  const { ref, W, H, played } = useChart(`chase:${b.match.id}:${chase.rows.length}:${chase.target}`);
  const [at, setAt] = useState<{ r: number; x: number; y: number } | null>(null);
  const R = W - 16, BASE = H - 40;
  const x = (k: number): number => LEFT + (k / total) * (R - LEFT);
  const y = (v: number): number => BASE - (v / axis.top) * (BASE - TOP);
  // Both lines start at over 0 (Ari, 2026-10-22): the rate needed before a ball is bowled, and nothing scored yet.
  const req = [[x(0), y(chase.target / (chase.scheduledBalls / chase.perOver))] as const, ...rows.map((r) => [x(r.over), y(r.required!)] as const)];
  const cur = [[x(0), y(0)] as const, ...rows.map((r) => [x(r.over), y(r.current)] as const)];
  const area = rows.length > 1 ? `${path(cur)}${req.slice().reverse().map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')}Z` : '';
  const step = total > 20 ? 10 : 5;
  const unit = chase.perOver === 5 ? 5 : 1;
  const word = chase.perOver === 5 ? 'Balls' : 'Overs';
  function move(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const k = Math.round(((((e.clientX - box.left) / box.width) * W - LEFT) / (R - LEFT)) * total);
    let best = 0;
    for (let i = 1; i < rows.length; i++) if (Math.abs(rows[i]!.over - k) < Math.abs(rows[best]!.over - k)) best = i;
    setAt({ r: best, x: e.clientX, y: e.clientY });
  }
  const tip = at ? rows[at.r] : undefined;
  return (
    <>
      <svg ref={ref} className={played ? 'play' : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chase tracker: ${team}, ${target}`} onPointerLeave={() => setAt(null)}>
        {[0, 1, 2, 3].map((j) => { const v = j * axis.step; return <g key={j}><line x1={LEFT} x2={R} y1={y(v)} y2={y(v)} stroke={GRID} /><text x={LEFT - 8} y={y(v) + 4} fill={MUTED} fontSize="11" textAnchor="end">{Math.round(v * 10) / 10}</text></g>; })}
        {Array.from({ length: Math.floor(total / step) + 1 }, (_, j) => j * step).map((j) => <text key={j} x={x(j)} y={BASE + 16} fill={MUTED} fontSize="11" textAnchor="middle">{j * unit}</text>)}
        <text x={(LEFT + R) / 2} y={H - 4} fill={MUTED} fontSize="11" textAnchor="middle">{word}</text>
        <text x={12} y={(TOP + BASE) / 2} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 12 ${(TOP + BASE) / 2})`}>{chase.perOver === 5 ? 'Runs per 5 balls' : 'Runs per over'}</text>
        <Bands b={b} inn={inn} x={x} top={TOP} bottom={BASE} />
        {area && <path className="band-fade" d={area} fill="#EBC862" fillOpacity=".14" pointerEvents="none" />}
        <path className="line-draw" pathLength={1} d={path(req)} fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" pointerEvents="none" />
        <path className="line-draw" pathLength={1} d={path(cur)} fill="none" stroke={colour} strokeWidth="3" strokeLinejoin="round" pointerEvents="none" />
        <Legend items={[{ colour, label: 'Current rate' }, { colour: '#fff', label: 'Required rate' }]} x={LEFT + 8} y={TOP - 12} />
        <text x={R} y={TOP - 8} textAnchor="end" fill={INK} fontSize="12">{target}</text>
        {at && tip && <line x1={x(tip.over)} x2={x(tip.over)} y1={TOP} y2={BASE} stroke="#fff" strokeOpacity=".35" pointerEvents="none" />}
        <rect x={LEFT} y={0} width={R - LEFT} height={BASE} fill="transparent" onPointerMove={move} />
      </svg>
      {at && tip && (
        <ChartTip x={at.x} y={at.y}>
          <TipBody
            title={chase.perOver === 5 ? `Ball ${tip.over * 5}` : `After over ${tip.over}`} sub={team}
            rows={[
              { label: 'Score', value: `${tip.score}/${tip.wickets}` },
              { label: 'Needed', value: `${tip.needed} from ${tip.ballsLeft} balls` },
              { label: `Required per ${chase.perOver === 5 ? 'set' : 'over'}`, value: tip.required!.toFixed(2) },
              { label: 'So far', value: tip.current.toFixed(2) },
            ]}
          />
        </ChartTip>
      )}
    </>
  );
}

/** "Target 179", or "Target 252 from 42 overs, revised". */
export function targetText(b: MatchBundle, chase: Chase, second: InningsCard): string {
  const overs = b.match.kind === 'hundred' ? `${chase.scheduledBalls} balls` : `${chase.scheduledBalls / chase.perOver} overs`;
  return `Target ${chase.target}${chase.revised ? ` from ${overs}, revised` : ''}${second.targetOvers && chase.revised && /D\/L|DLS/i.test(b.match.result.method ?? '') ? ' (DLS)' : ''}`;
}

export const resultLine = (b: MatchBundle, inn: readonly InningsCard[]): string => inn.slice(0, 2).map((i) => `${i.team} ${scoreText(i)}`).join(', ');
