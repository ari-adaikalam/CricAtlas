'use client';

import { PrefetchLink as Link } from '@/components/PrefetchLink';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchReplay } from '@/data/homeData';
import { HERO_INNINGS, needText, resultInPanel, scoreText, type Replay } from '@/domain/homeReplay';
import { primaryHref } from '@/domain/links';
import { ChartColoursFor } from '../ChartColours';
import { LiveWagon } from '../replay/LiveWagon';
import { sideColours } from '@/domain/colours';
import { drawChart, readouts, type HeroColours, type Surface } from './heroCanvas';

/** Balls shown each second, and the pause on the finished innings before the next one starts. A long innings runs a little faster so a 300 ball ODI does not take a minute. */
const BALLS_PER_SECOND = 22;
const HOLD_MS = 4200;

type Slot = Replay | null | undefined;

/** Loads the rotation in order, the first at once and the rest behind it, so the next innings is ready when the current one ends and the cards fill in as they arrive. */
function useReplays(frozen: boolean): Slot[] {
  const [slots, setSlots] = useState<Slot[]>(() => HERO_INNINGS.map(() => undefined));
  useEffect(() => {
    if (frozen) return;
    let live = true;
    (async () => {
      for (let i = 0; i < HERO_INNINGS.length; i++) {
        let replay: Replay | null = null;
        try { replay = await fetchReplay(i); } catch (error) { console.error('A replayed innings failed to load', error); }
        if (!live) return;
        setSlots((was) => was.map((s, k) => (k === i ? replay : s)));
      }
    })();
    return () => { live = false; };
  }, [frozen]);
  return slots;
}

function sized(canvas: HTMLCanvasElement, font: string): Surface | null {
  const box = canvas.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: box.width, h: box.height, font };
}

/**
 * The hero: one real innings replayed ball by ball, the run chart on the left and the wagon wheel on the right, then the next of the rotation. The innings come from the
 * match bundle and ball file, so every number on screen is read from the data. Frames are drawn straight to the canvases and the readouts, with no re-render per ball.
 */
/** The chart's two lines: the batting team's colour, and the batter's in the team's second colour (or the fixed gold or sky when that is too close). Text stays as it was. */
function heroColours(r: Replay): HeroColours {
  const { a, b } = sideColours(r.batting, r.batting);
  return { team: a, hero: b };
}

/**
 * `frozen` draws only the waiting frame and loads nothing: it is the first paint of the Home page (HomeFirstPaint), sent by the server before any script runs, so the page never shows an empty middle.
 */
export function HeroReplay({ frozen = false }: { frozen?: boolean }) {
  const slots = useReplays(frozen);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  const replay = slots[index] ?? null;
  // The grey shapes (home.css, `data-wait`) stand where the content will be until the first innings arrives. They then give way to the content with one fade (`data-in`), and never again.
  const [phase, setPhase] = useState<'wait' | 'in' | 'done'>('wait');
  useEffect(() => { if (!frozen && replay && phase === 'wait') setPhase('in'); }, [frozen, replay, phase]);
  useEffect(() => {
    if (phase !== 'in') return;
    const id = window.setTimeout(() => setPhase('done'), 700);
    return () => window.clearTimeout(id);
  }, [phase]);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const chart = useRef<HTMLCanvasElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const els = useRef<Record<'hero' | 'heroNote' | 'team' | 'teamNote' | 'result' | 'bar', HTMLElement | null>>({ hero: null, heroNote: null, team: null, teamNote: null, result: null, bar: null });
  const live = useRef({ progress: 0, paused: false, visible: true, holdUntil: 0 });
  const surface = useRef<Surface | null>(null);
  const [shown, setShown] = useState(0);
  const shownNow = useRef(0);
  const frame = useRef<(() => void) | null>(null);
  live.current.paused = paused;
  const loaded = useRef(slots);
  loaded.current = slots;

  const draw = useCallback(() => {
    if (!replay) return;
    const ball = Math.max(0, Math.min(replay.points.length - 1, Math.floor(live.current.progress * (replay.points.length - 1))));
    const c = surface.current;
    if (c) { c.ctx.clearRect(0, 0, c.w, c.h); drawChart(c, replay, ball, heroColours(replay)); }
    // The wheel is told only when a new shot has happened.
    const count = replay.shotCount[ball] ?? 0;
    if (count !== shownNow.current) { shownNow.current = count; setShown(count); }
    const r = readouts(replay, ball), e = els.current;
    if (e.hero) e.hero.textContent = r.hero;
    if (e.heroNote) e.heroNote.textContent = r.heroNote;
    if (e.team) e.team.textContent = r.team;
    if (e.teamNote) e.teamNote.textContent = r.teamNote;
    if (e.bar) e.bar.style.width = `${Math.round(live.current.progress * 100)}%`;
    // The last row of the readout panel says what the chase still needs, and then how it ended.
    const finished = ball >= replay.points.length - 1;
    const note = finished ? resultInPanel(replay) : needText(replay, ball);
    if (e.result) {
      if (e.result.textContent !== (note ?? '')) e.result.textContent = note ?? '';
      e.result.classList.toggle('on', note !== null);
      e.result.classList.toggle('end', finished);
    }
  }, [replay]);
  frame.current = draw;

  // Canvases follow their boxes.
  useEffect(() => {
    const cv = chart.current;
    if (!cv) return;
    const font = getComputedStyle(document.body).fontFamily;
    const fit = (): void => { surface.current = sized(cv, font); frame.current?.(); };
    const observer = new ResizeObserver(fit);
    observer.observe(cv);
    fit();
    return () => observer.disconnect();
  }, [replay]);

  // Nothing is drawn while the hero is scrolled out of sight.
  useEffect(() => {
    const el = hero.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => { live.current.visible = entry?.isIntersecting ?? true; });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The replay of the chosen innings. `run` restarts the same innings (the Replay button).
  useEffect(() => {
    if (!replay) return;
    const state = live.current;
    state.progress = reduced ? 1 : 0; state.holdUntil = 0; shownNow.current = -1;
    draw();
    if (reduced) return;
    let raf = 0, last = performance.now();
    const n = replay.points.length;
    const tick = (now: number): void => {
      const dt = Math.max(0, Math.min(60, now - last)); last = now;
      if (!state.paused && state.visible) {
        if (state.progress < 1) {
          state.progress = Math.min(1, state.progress + (dt / ((n * 1000) / BALLS_PER_SECOND)) * (n > 200 ? 1.25 : 1));
          if (state.progress >= 1) state.holdUntil = now + HOLD_MS;
          draw();
        } else if (state.holdUntil && now > state.holdUntil) {
          const next = (index + 1) % HERO_INNINGS.length;
          // The next innings may still be loading: wait for it, then move on.
          if (loaded.current[next]) { setIndex(next); return; }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `index` is read only when the innings ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay, run, reduced, draw]);

  const choose = (i: number): void => { setPaused(false); setRun((n) => n + 1); setIndex(i); };
  const href = replay ? primaryHref({ kind: 'match', id: replay.matchId, name: `${replay.batting} v ${replay.bowling}` }) : null;
  const hasWheel = !replay || replay.shots.length > 0;
  const set = (k: keyof typeof els.current) => (el: HTMLElement | null): void => { els.current[k] = el; };

  return (
    <div className="hm-first" data-wait={phase === 'wait' ? '' : undefined} data-in={phase === 'in' ? '' : undefined}>
      <div className="hm-hero">
        <div className="hm-hin" ref={hero}>
          <div className="hm-lc">
            <div className="hm-hl">
              <div className="hm-hh">
                <div className="hm-kick">{replay?.kicker ?? ' '}</div>
                <div className="hm-tt"><h1>{replay?.hero.name ?? ' '}</h1><div className="hm-big">{replay ? `${scoreText(replay.heroRuns, replay.heroOut)} off ${replay.heroBalls}` : ' '}</div></div>
                <div className="hm-ln">{replay ? <><b>{replay.batting}</b> v {replay.bowling}{replay.target ? `, chasing ${replay.target}` : ', batting first'}</> : ' '}</div>
              </div>
              <div className="hm-lvc">
                <div className="hm-live">
                  <div className="hm-lv h"><b ref={set('hero')}>0</b><span ref={set('heroNote')}>balls</span></div>
                  <div className="hm-lv t"><b ref={set('team')}>0/0</b><span ref={set('teamNote')}>overs</span></div>
                  <div className="hm-rs" ref={set('result')} />
                </div>
              </div>
            </div>
            <div className="hm-pc"><canvas ref={chart} aria-label="Run chart of the innings being replayed" /><div className="hm-prog"><i ref={set('bar')} /></div></div>
          </div>
          <div className={`hm-rcol${hasWheel ? '' : ' no'}`}>
            <div className="hm-pw">
              <h3>Wagon wheel</h3>
              {replay && replay.shots.length > 0 && (
                <ChartColoursFor colour={null}><LiveWagon shots={replay.shots} count={shown} travelMs={320} label={`Wagon wheel of ${replay.hero.name}, ${shown} balls placed so far`} /></ChartColoursFor>
              )}
            </div>
            <div className="hm-cta">
              <button type="button" className="hm-ib" aria-label={paused ? 'Play' : 'Pause'} title={paused ? 'Play' : 'Pause'} onClick={() => setPaused((p) => !p)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">{paused ? <path d="M8 5.5v13l11-6.5z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}</svg>
              </button>
              <button type="button" className="hm-ib" aria-label="Replay from the start" title="Replay from the start" onClick={() => choose(index)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.7 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M12 1.5v7L7 5z" /></svg>
              </button>
              {href ? <Link className="hm-btn p" href={href}>Open the match</Link> : <span className="hm-btn p off">Open the match</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="hm-row">
        <div className="hm-cards" role="group" aria-label="Pick an innings to replay">
          {HERO_INNINGS.map((spec, i) => {
            const r = slots[i];
            return r ? (
              <button key={spec.matchId} type="button" className={`hm-ic${i === index ? ' on' : ''}`} onClick={() => choose(i)} title={`${r.hero.name}, ${r.kicker}`} aria-label={`Play ${r.hero.name} ${scoreText(r.heroRuns, r.heroOut)}`}>
                <b>{r.hero.name}</b><div className="sc">{scoreText(r.heroRuns, r.heroOut)}<small> off {r.heroBalls}</small></div><span>{r.batting} v {r.bowling}</span>
              </button>
            ) : <div key={spec.matchId} className="hm-ic wait" aria-hidden="true"><b>{'\u00a0'}</b><div className="sc">{'\u00a0'}</div><span>{'\u00a0'}</span></div>;
          })}
        </div>
      </div>
    </div>
  );
}
