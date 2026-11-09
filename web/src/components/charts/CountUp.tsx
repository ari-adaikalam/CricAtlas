'use client';

import { useLayoutEffect, useRef } from 'react';
import { isRepeating } from './usePlayOnView';

const DURATION = 700;
const ease = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * A number that counts up from zero when it starts playing (`play`, which waits for its tile to be on screen) and again when its value changes. Reduced motion shows the final number at once.
 * The text is written by `format`, so a rate keeps its decimals while it counts.
 */
export function CountUp({ value, format, play = true, morph = false }: { value: number; format: (n: number) => string; play?: boolean; morph?: boolean }) {
  const node = useRef<HTMLSpanElement>(null);
  // The number last shown, so a morph carries on from it to the new value (a profile switched to another player) instead of starting from zero.
  const last = useRef<number | null>(null);
  // The counting number is written straight into the element, so a count of twenty numbers does not render React twenty times a frame (which made the page stutter in Safari).
  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    // The number is one text node that is changed in place, which is cheaper than replacing it.
    const text = el.firstChild ?? el.appendChild(document.createTextNode(''));
    const write = (n: number): void => { last.current = n; text.nodeValue = format(n); };
    if (!play) { write(0); return; }
    // A state that was already shown shows its number at once.
    if (isRepeating(el)) { write(value); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { write(value); return; }
    let frame = 0;
    const from = morph && last.current !== null ? last.current : 0;
    write(from);
    // A row that is below the visible part of its table is marked `data-late` (useTableMotion) and shows its final number, because counting a table of hundreds of numbers wrote
    // 13,000 changes to the page in one scroll. This is looked up on the next frame and reads no layout, so counting hundreds of numbers never makes the page lay itself out again and again.
    frame = requestAnimationFrame((first) => {
      if (el.closest('[data-late]')) { write(value); return; }
      const step = (now: number): void => {
        // The frame time can sit a hair before the start time, so t is kept from going below zero.
        const t = Math.max(0, Math.min(1, (now - first) / DURATION));
        write(from + (value - from) * ease(t));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
    // format is a fresh function each render and only describes how to write the number, so the count restarts on the value and on play alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, play]);
  return <span className="cu-t" ref={node}>{format(value)}</span>;
}

/**
 * A number that counts up inside a table cell without moving its neighbours. The finished number is laid out invisibly, so the cell and the column keep their final width, and the
 * counting number is drawn over it with the cell's own alignment. Tabular digits keep the counting steady.
 */
export function CountText({ value, format, play = true, morph = false }: { value: number; format: (n: number) => string; play?: boolean; morph?: boolean }) {
  return (
    <span className="cu">
      <i className="cu-final" aria-hidden="true">{format(value)}</i>
      <span className="cu-now"><CountUp value={value} format={format} play={play} morph={morph} /></span>
    </span>
  );
}
