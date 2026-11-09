'use client';

import { useState, type PointerEvent } from 'react';
import { ChartTip } from '../ChartTip';
import type { Mark, MarkKind, Timeline } from '@/domain/replay';
import { TipBody } from '../TipBody';

export const MARK_COLOUR: Record<MarkKind, string> = { wicket: '#FFFFFF', review: '#56B4E9', drop: '#E58F65', chance: '#8C96A5' };
const MARK_NAME: Record<MarkKind, string> = { wicket: 'Wicket', review: 'Review', drop: 'Dropped catch', chance: 'Chance' };

interface Props {
  t: Timeline;
  pos: number;
  onPos: (pos: number) => void;
  playing: boolean;
  onToggle: () => void;
  speed: number;
  speeds: readonly number[];
  onSpeed: (speed: number) => void;
  marks: readonly Mark[];
  /** "Over 13.1, 112/4", the state at the playhead. */
  where: string;
}

/** The controls of the Replay (Ari, 2026-10-22): play and pause, the scrubber over every ball with its marks, and the speed. They are there from the first ball. */
export function Playbar({ t, pos, onPos, playing, onToggle, speed, speeds, onSpeed, marks, where }: Props) {
  const [hover, setHover] = useState<{ mark: Mark; x: number; y: number } | null>(null);
  const atEnd = pos >= t.total;
  const pct = (v: number): string => `${t.total > 0 ? (v / t.total) * 100 : 0}%`;
  function move(e: PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const at = ((e.clientX - box.left) / box.width) * t.total;
    // The nearest mark within 7 px of the pointer.
    const within = (7 / box.width) * t.total;
    let best: Mark | null = null;
    for (const m of marks) if (Math.abs(m.at - at) <= within && (best === null || Math.abs(m.at - at) < Math.abs(best.at - at))) best = m;
    setHover(best ? { mark: best, x: e.clientX, y: e.clientY } : null);
  }
  return (
    <div className="rpbar">
      <button type="button" className="rpplay" onClick={onToggle} aria-label={playing ? 'Pause' : atEnd ? 'Play again from the start' : 'Play'}>
        {playing ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          : atEnd ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>}
      </button>
      <span className="rpwhere" aria-live="off">{where}</span>
      <div className="rpscrub" onPointerMove={move} onPointerLeave={() => setHover(null)}>
        <div className="rpline"><i style={{ width: pct(pos) }} /></div>
        {t.innings.slice(1).map((ri) => <b key={ri.inn.n} className="rpbreak" style={{ left: pct(ri.start) }} aria-hidden="true" />)}
        {marks.map((m, i) => <u key={i} className={`rpmark ${m.kind}`} style={{ left: pct(m.at), background: MARK_COLOUR[m.kind] }} aria-hidden="true" />)}
        <input type="range" min={0} max={t.total} step={1} value={pos} onChange={(e) => onPos(Number(e.target.value))} aria-label="Ball of the match" aria-valuetext={where} />
      </div>
      <span className="rpleg" tabIndex={0} title="Marks on the bar: a white dot is a wicket, blue a review, orange a dropped catch, grey a chance.">Marks</span>
      <div className="rpspeed" role="group" aria-label="Speed">
        {speeds.map((s) => <button key={s} type="button" aria-pressed={s === speed} onClick={() => onSpeed(s)}>{s}x</button>)}
      </div>
      {hover && <ChartTip x={hover.x} y={hover.y}><TipBody title={MARK_NAME[hover.mark.kind]} sub={hover.mark.label} /></ChartTip>}
    </div>
  );
}
