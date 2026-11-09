'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChartTip } from '../ChartTip';
import { usePlayOnView } from '../charts/usePlayOnView';
import { PlayerName } from '../PlayerName';
import { fetchBalls } from '@/data/ballData';
import { ballRows, coverage, overLine, overRows, type BallFile, type BallRow, type OverRow } from '@/domain/ballByBall';
import type { InningsCard, MatchBundle, SubMark } from '@/domain/match';
import { superTitle } from '@/domain/superOver';
import { TipBody } from '../TipBody';

// Ball by ball: every delivery of one innings, with the over map above it. A long list draws only the rows on screen, and every row (an over's heading too) is the same height, so the window is plain arithmetic.

const ROW = 34;
const OVERSCAN = 10;
/** Rows that rise in when the part comes on screen, and after which the list stops animating so a row that scrolls into view is never replayed. */
const REVEALED = 14;

type Item = { kind: 'over'; over: OverRow } | { kind: 'ball'; row: BallRow; over: OverRow | null; at: number } | { kind: 'section'; title: string; team: string; bowler: BallRow['bowler']; at: number };

function evClass(tag: string): string { return tag.startsWith('Review') ? 'review' : tag === 'Dropped catch' ? 'drop' : 'chance'; }

/** The ball files of the innings shown: one for an innings, two for the Super Over of a round. */
function useBalls(matchId: number, list: readonly number[]): { state: 'loading' | 'ready' | 'missing' | 'error'; files: BallFile[] } {
  const [got, setGot] = useState<{ key: string; state: 'ready' | 'missing' | 'error'; files: BallFile[] } | null>(null);
  const key = `${matchId}_${list.join('_')}`;
  useEffect(() => {
    let cancelled = false;
    Promise.all(list.map((n) => fetchBalls(matchId, n))).then((files) => {
      if (cancelled) return;
      const ok = files.filter((f): f is BallFile => f !== null);
      setGot({ key, state: ok.length === files.length ? 'ready' : 'missing', files: ok });
    }).catch(() => { if (!cancelled) setGot({ key, state: 'error', files: [] }); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` names the list
  }, [matchId, key]);
  return got && got.key === key ? got : { state: 'loading', files: [] };
}

/** `innings` is the one innings shown, or for a Super Over the two of a round, whose balls are listed one after the other under a heading for each. */
export function BallByBallPart({ b, innings, marks, superOver = false, name = 'Super Over' }: { b: MatchBundle; innings: readonly InningsCard[]; marks: Map<string, SubMark>; superOver?: boolean; name?: string }) {
  const { state, files } = useBalls(b.match.id, innings.map((i) => i.n));
  const sections = useMemo(() => files.map((f, k) => ({ inn: innings[k]!, file: f, rows: ballRows(b, innings[k]!, f) })), [b, innings, files]);
  const first = sections[0];
  const rows = useMemo(() => sections.flatMap((x) => x.rows), [sections]);
  const overs = useMemo(() => (first && !superOver ? overRows(b, first.file, first.rows) : []), [b, first, superOver]);
  const cover = useMemo(() => coverage(b, rows), [b, rows]);
  const items = useMemo((): Item[] => {
    if (superOver) {
      let at = 0;
      return sections.flatMap((x) => [{ kind: 'section', title: name, team: superTitle(b, x.inn), bowler: x.rows[0]?.bowler ?? null, at: at } as Item, ...x.rows.map((row) => ({ kind: 'ball', row, over: null, at: at++ }) as Item)]);
    }
    return overs.flatMap((o) => [{ kind: 'over', over: o } as Item, ...(first?.rows ?? []).slice(o.first, o.last + 1).map((row) => ({ kind: 'ball', row, over: o, at: row.index }) as Item)]);
  }, [b, sections, first, overs, superOver, name]);
  const hundred = b.match.kind === 'hundred';
  const innings0 = innings[0];
  const key = `${b.match.id}:${innings.map((i) => i.n).join('_')}`;

  const { ref: playRef, played } = usePlayOnView<HTMLDivElement>(key);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(400);
  const [settled, setSettled] = useState(false);
  const [tip, setTip] = useState<{ over: OverRow; x: number; y: number } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  // The result chip says what the ball was in a sentence, so a wicket ball names the dismissal here and not in the Shot column.
  const [ballTip, setBallTip] = useState<{ lines: string[]; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const read = (): void => setHeight(el.clientHeight || 400);
    read();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [state]);
  // Another innings starts at the top.
  useEffect(() => { setTop(0); setPicked(null); setSettled(false); if (scroller.current) scroller.current.scrollTop = 0; }, [key]);
  useEffect(() => { if (!played) return; const t = window.setTimeout(() => setSettled(true), 1600); return () => window.clearTimeout(t); }, [played, key]);

  // A short list (a Super Over, an innings of a few balls) shares the height of the list between its rows, with no limit (Ari, 2026-10-21), as the rows of the Details tables do. A long one keeps ROW.
  const rh = items.length > 0 && items.length * ROW < height ? Math.floor(height / items.length) : ROW;
  const from = Math.max(0, Math.floor(top / rh) - OVERSCAN);
  const to = Math.min(items.length, Math.ceil((top + height) / rh) + OVERSCAN);
  const jump = (over: OverRow): void => {
    const at = items.findIndex((it) => it.kind === 'over' && it.over === over);
    if (at < 0 || !scroller.current) return;
    setPicked(over.over);
    scroller.current.scrollTo({ top: at * rh, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  if (state === 'loading') return <p className="g bbmsg">Loading the balls.</p>;
  if (state !== 'ready' || !first) return <p className="g bbmsg">{state === 'error' ? 'The balls of this innings did not load. Try again in a moment.' : 'There is no ball by ball data for this innings.'}</p>;

  const maxRuns = Math.max(6, ...overs.map((o) => o.runs));
  const cols = cover.winShown ? 'bbw' : '';
  return (
    <div className="bbp" ref={playRef} data-rows={played ? 'play' : 'wait'}>
      {!superOver && <div className="omr">
        <div className={`omap${overs.length > 20 ? ' tomap' : ''}`} role="group" aria-label={`Jump to ${hundred ? 'a set of 5 balls' : 'an over'}`} onPointerLeave={() => setTip(null)}>
          {overs.map((o, k) => (
            <button key={o.over} type="button" className={`om${picked === o.over ? ' on' : ''}`} style={{ ['--i' as string]: Math.min(k, 20) }}
              aria-label={`${o.title}: ${overLine(o)}`} onClick={() => jump(o)}
              onPointerMove={(e) => setTip({ over: o, x: e.clientX, y: e.clientY })} onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ over: o, x: r.left + r.width / 2, y: r.top }); }} onBlur={() => setTip(null)}>
              <span className="ow">{o.wickets > 0 ? <b>W</b> : null}</span>
              <i style={{ height: `${Math.max(4, Math.round((o.runs / maxRuns) * 34))}px` }} />
              <em>{overs.length > 20 ? ((hundred ? k + 1 : o.over + 1) % 10 === 0 ? (hundred ? k + 1 : o.over + 1) : '') : (hundred ? ((k + 1) % 2 === 0 ? (k + 1) * 5 : '') : o.over + 1)}</em>
            </button>
          ))}
        </div>
      </div>}
      <div className={`bbh ${cols}`}>
        <span>Ball</span><span>Delivery</span><span>Result</span><span className="hm">Shot</span><span className="hm">Line and length</span><span className="hm">Control</span>
        {cover.winShown && <span>{superOver ? 'Win chance' : `${innings0?.team ?? ''} win chance`}</span>}<span>Score</span>
      </div>
      <div className="bbl" style={{ ['--rh' as string]: `${rh}px` }} ref={scroller} onScroll={(e) => setTop(e.currentTarget.scrollTop)} tabIndex={0} aria-label="Every ball of the innings">
        <div style={{ paddingTop: from * rh, paddingBottom: (items.length - to) * rh }}>
          {items.slice(from, to).map((it, k) => {
            const index = from + k;
            const anim = !settled && index < REVEALED ? { className: ' bbrise', style: { ['--i' as string]: index } } : { className: '', style: undefined };
            if (it.kind === 'section') {
              return (
                <div key={`s${it.at}`} className={`ovh${anim.className}`} style={anim.style}>
                  <b>{it.title}</b><span>{it.team}</span>{it.bowler && <span><PlayerName id={it.bowler.id} name={it.bowler.name} marks={marks} /></span>}
                </div>
              );
            }
            if (it.kind === 'over') {
              const o = it.over;
              return (
                <div key={`o${o.over}`} className={`ovh${anim.className}`} style={anim.style}>
                  <b>{o.title}</b>{o.bowler && <span><PlayerName id={o.bowler.id} name={o.bowler.name} marks={marks} /></span>}<span>{overLine(o)}</span><span className="g">{o.end}</span>
                  {o.tracked < o.balls && <span className="g">tracking {o.tracked} of {o.balls} balls</span>}
                </div>
              );
            }
            const r = it.row;
            return (
              <div key={`b${it.at}:${r.index}`} data-i={it.at} className={`bbr${cols ? ' bbw' : ''}${r.chip.kind === 'wicket' ? ' wr' : ''}${anim.className}`} style={anim.style}>
                <span className="g">{r.label}</span>
                <span><span className="bw">{r.bowler ? <PlayerName id={r.bowler.id} name={r.bowler.name} marks={marks} /> : 'Unknown'} </span>to {r.batter ? <PlayerName id={r.batter.id} name={r.batter.name} marks={marks} /> : 'unknown'}</span>
                <span className={`rc c${r.chip.kind}`} aria-label={r.summary} onPointerMove={(e) => setBallTip({ lines: r.tip, x: e.clientX, y: e.clientY })} onPointerLeave={() => setBallTip(null)}>{r.chip.text}</span>
                <span className="hm">
                  {r.tracked ? r.shot : <span className="g">no tracking</span>}
                  {r.tags.map((t) => <em key={t} className={`evt ${evClass(t)}`} title={t}>{t}</em>)}
                </span>
                <span className="hm">{r.line || <span className="g">&ndash;</span>}</span>
                <span className="hm">{r.control === null ? <span className="g">&ndash;</span> : r.control === 'in control' ? 'in control' : <u>not in control</u>}</span>
                {cover.winShown && <span className="wp">{r.win === null ? <span className="g">&ndash;</span> : <>{r.win}%{r.change !== null && r.change !== 0 && <em className={r.change < 0 ? 'dn' : ''}>{r.change > 0 ? '+' : ''}{r.change}</em>}</>}</span>}
                <span className="g">{r.score}</span>
              </div>
            );
          })}
        </div>
      </div>
      {ballTip && <ChartTip x={ballTip.x} y={ballTip.y}><TipBody title={ballTip.lines[0] ?? ''} sub={ballTip.lines.slice(1)} /></ChartTip>}
      {tip && <ChartTip x={tip.x} y={tip.y}><TipBody title={tip.over.title} sub={overLine(tip.over)} note="Click to jump to it" /></ChartTip>}
    </div>
  );
}
