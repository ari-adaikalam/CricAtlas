import { useLayoutEffect, useRef } from 'react';
import { figuresText, type BattingLine, type BowlingLine } from '@/domain/career';
import { CountText } from './charts/CountUp';
import { useTableMotion } from './useTableMotion';

const int = new Intl.NumberFormat('en');
const two = (value: number | null): string => (value === null ? '-' : value.toFixed(2));
const COMBINED = new Set(['International', 'T20s']);

const BAT_HEAD = ['Format', 'Mat', 'Inns', 'NO', 'Runs', 'HS', 'Ave', 'BF', 'SR', '100s', '50s', '4s', '6s', 'Ct', 'St'];
const BOWL_HEAD = ['Format', 'Mat', 'Inns', 'Balls', 'Runs', 'Wkts', 'BBI', 'BBM', 'Ave', 'Econ', 'SR', '4w', '5w', '10w', 'Wd', 'NB'];

const head = (cols: readonly string[]) => <thead><tr>{cols.map((h, i) => <th key={h} className="swap" scope="col" style={i ? undefined : { textAlign: 'left' }}>{h}</th>)}</tr></thead>;
/**
 * Smooths the card when its height changes (another player's table has more or fewer rows): the height runs from the old size to the new one, and everything below the card, which follows
 * it in the layout, moves with it. Without this the card and the buttons under it jump in one frame. Reduced motion keeps the jump.
 */
export function useSmoothHeight() {
  const card = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);
  const running = useRef(false);
  useLayoutEffect(() => {
    const el = card.current;
    // While the height is running, a render (a count ticking over) would measure the height it has reached and start a second animation back from the end: leave it alone.
    if (!el || running.current) return;
    const height = el.getBoundingClientRect().height;
    const before = last.current;
    last.current = height;
    if (before === null || Math.abs(before - height) < 2 || typeof el.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    running.current = true;
    const run = el.animate([{ height: `${before}px`, overflow: 'hidden' }, { height: `${height}px`, overflow: 'hidden' }], { duration: 480, easing: 'cubic-bezier(0.22, 0.7, 0.25, 1)' });
    const done = (): void => { running.current = false; };
    run.onfinish = done; run.oncancel = done;
  });
  return card;
}

/**
 * Slides the children of a box to their new places when a change of layout moves them (a T20's two innings stack, a Test's four sit in a grid): each child starts from where it was and
 * glides to where it is now. A child with no earlier place (a new block) fades in. Reduced motion keeps the jump.
 */
export function useSlideChildren() {
  const box = useRef<HTMLDivElement>(null);
  const places = useRef<Map<string, { x: number; y: number }>>(new Map());
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const still = typeof el.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, { x: number; y: number }>();
    [...el.children].forEach((child, i) => {
      const key = (child as HTMLElement).dataset.slide ?? String(i);
      // Layout positions, not screen ones: the page's own entrance moves everything by a transform, and that must not read as a block that moved.
      const at = { x: (child as HTMLElement).offsetLeft, y: (child as HTMLElement).offsetTop };
      next.set(key, at);
      const was = places.current.get(key);
      if (still || places.current.size === 0) return;
      const keep = { easing: 'cubic-bezier(0.22, 0.7, 0.25, 1)', duration: 480 };
      if (!was) { if (!child.className.includes('-in')) child.animate([{ opacity: 0 }, { opacity: 1 }], keep); }
      else if (Math.abs(was.x - at.x) > 2 || Math.abs(was.y - at.y) > 2) child.animate([{ transform: `translate(${was.x - at.x}px, ${was.y - at.y}px)` }, { transform: 'none' }], keep);
    });
    places.current = next;
  });
  return box;
}

const name = (label: string) => (COMBINED.has(label) ? <b>{label}</b> : label);

/**
 * The profile table: batting and fielding, or bowling, one row for each group. It is one table that stays in place, so that changing the player or switching between Batting and Bowling
 * morphs it: a row that exists on both sides is kept, and each number counts from what the cell showed to its new value (the cell in the same place, even when the column is a different
 * one), text cells and the headings that change fade in, and the card's height runs to its new size. The Runs column (batting) and the Wickets column (bowling) are bold, as in the mockup.
 * The Hundred's economy is per five-ball over and a note says so.
 */
export function ProfileTable({ kind, bat, bowl }: { kind: 'bat' | 'bowl'; bat: readonly BattingLine[]; bowl: readonly BowlingLine[] }) {
  const lines = kind === 'bat' ? bat : bowl;
  const key = lines.map((l) => l.label).join('|');
  // The data key stays the same, so the rows are revealed once and not again when the numbers change.
  const { ref, motion, played } = useTableMotion<HTMLDivElement>('morph', key);
  const card = useSmoothHeight();
  const n = (value: number, shown: (v: number) => string = (v) => int.format(Math.round(v))) => <CountText value={value} format={shown} play={played} morph />;
  const dec = (value: number | null, digits: number) => (value === null ? (digits === 2 ? two(null) : '-') : n(value, (v) => v.toFixed(digits)));
  const text = (value: string | number) => <span className="swap" key={kind}>{value}</span>;
  return (
    <div className="in tt" ref={card}>
      <h5 className="sh0" key={kind}><span className="swap">{kind === 'bat' ? 'Batting and fielding' : 'Bowling'}</span></h5>
      <div className="tsc" ref={ref} data-rows={motion}>
        <table className="cmp2 ct">
          {head(kind === 'bat' ? BAT_HEAD : BOWL_HEAD)}
          <tbody>
            {kind === 'bat'
              ? bat.map((l) => (
                <tr key={l.label}>
                  <td>{name(l.label)}</td><td>{n(l.matches)}</td><td>{n(l.innings)}</td><td>{n(l.notOuts)}</td><td><b>{n(l.runs)}</b></td><td>{text(l.highScore)}</td>
                  <td>{dec(l.average, 2)}</td><td>{n(l.ballsFaced)}</td><td>{dec(l.strikeRate, 2)}</td><td>{n(l.hundreds)}</td><td>{n(l.fifties)}</td><td>{n(l.fours)}</td><td>{n(l.sixes)}</td>
                  <td>{n(l.catches)}</td><td>{n(l.stumpings)}</td>
                </tr>
              ))
              : bowl.map((l) => (
                <tr key={l.label}>
                  <td>{name(l.label)}</td><td>{n(l.matches)}</td><td>{n(l.innings)}</td><td>{n(l.balls)}</td><td>{n(l.runs)}</td><td><b>{n(l.wickets)}</b></td>
                  <td>{text(figuresText(l.bestInnings))}</td><td>{text(figuresText(l.bestMatch))}</td><td>{dec(l.average, 2)}</td><td>{dec(l.economy, 2)}</td><td>{dec(l.strikeRate, 1)}</td>
                  <td>{n(l.fourWickets)}</td><td>{n(l.fiveWickets)}</td><td>{n(l.tenWickets)}</td><td>{n(l.wides)}</td><td>{n(l.noBalls)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {kind === 'bowl' && bowl.some((l) => l.hundred) && <div className="thin" style={{ padding: '6px 2px 0' }}>The Hundred economy is runs per 5 ball over. Every other format, and the T20s row, is runs per 6 ball over.</div>}
        {kind === 'bowl' && bowl.length === 0 && <div className="thin">No balls bowled in the data.</div>}
      </div>
    </div>
  );
}
