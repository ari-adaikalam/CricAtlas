'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CountUp } from './charts/CountUp';
import { usePlayOnView } from './charts/usePlayOnView';
import { MorphText } from './MorphText';
import { TileLoader } from './states/TileStates';

/** One number of a Key numbers card. `n` null is a figure with no value ("-"). A pair counts both numbers ("9 / 105"). Text is a name that cross-dissolves when it changes. */
export type KeyValue =
  | { kind: 'num'; n: number | null; format: (n: number) => string }
  | { kind: 'pair'; a: number; b: number; format: (n: number) => string; join?: string }
  | { kind: 'text'; text: string };

export interface KeyCell { id: string; value: KeyValue; label: string; wide?: boolean; title?: string }

function Figure({ value, play }: { value: KeyValue; play: boolean }): ReactNode {
  if (value.kind === 'text') return <MorphText text={value.text} />;
  if (value.kind === 'pair') return <><CountUp value={value.a} format={value.format} play={play} morph />{value.join ?? ' / '}<CountUp value={value.b} format={value.format} play={play} morph /></>;
  return value.n === null ? <>-</> : <CountUp value={value.n} format={value.format} play={play} morph />;
}

/**
 * The cards of a Key numbers tile (Batting and Bowling). Each card keeps its place when the filters change: its number counts from the number it showed to the new one, and its words
 * cross-dissolve. While the new numbers are on their way the old ones stay, dimmed, with the loader over them, so the tile never empties.
 */
export function KeyGrid({ cells, label }: { cells: readonly KeyCell[] | null; label: string }) {
  const last = useRef<readonly KeyCell[] | null>(null);
  const { ref, played } = usePlayOnView<HTMLDivElement>('key');
  // New numbers for a tile that is off screen wait: its old numbers stay until the tile is on screen, then they count to the new ones in front of you (the rest of the tiles draw when they are
  // reached, and these would otherwise have finished counting where nobody could see).
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') { setOnScreen(true); return; }
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const fromLeft = e.rootBounds !== null && e.boundingClientRect.left < e.rootBounds.left;
        const across = e.boundingClientRect.width > 0 ? e.intersectionRect.width / e.boundingClientRect.width : 0;
        setOnScreen(e.isIntersecting && across >= (fromLeft ? 0.1 : 0.2));
      }
    }, { root: node.closest('.car'), threshold: [0, 0.05, 0.1, 0.2, 0.35, 0.5] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  if (cells && (onScreen || last.current === null)) last.current = cells;
  const setRef = (el: HTMLDivElement | null): void => { setNode(el); ref(el); };
  const shown = last.current !== null && cells ? last.current : cells ?? last.current;
  if (!shown) return <TileLoader label={label} />;
  return (
    <div className={`kgrid${cells ? '' : ' stale'}`} ref={setRef} style={{ position: 'relative' }} aria-busy={cells ? undefined : true}>
      {shown.map((c) => (
        <div className={`kn${c.wide ? ' w2' : ''}`} key={c.id} title={c.title}>
          <b><Figure value={c.value} play={played} /></b>
          <span><MorphText text={c.label} /></span>
        </div>
      ))}
      {!cells && <div className="kload"><TileLoader label={label} /></div>}
    </div>
  );
}
