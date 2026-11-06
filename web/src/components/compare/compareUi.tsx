'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { CountedText } from '../charts/CountedText';
import { useTableMotion } from '../useTableMotion';
import { leader, type Cell, type CompareRow } from '@/domain/compareStats';
import { inkFor } from '@/domain/colours';

/**
 * The colours of the two sides, as CSS values (Ari, 2026-10-24: team colours, not a fixed pair). `--sa` and `--sb` are set on the page by `SideColours`, so a style, an SVG stroke or fill and a
 * stylesheet rule all follow the teams, and the tooltips that are drawn outside the page do too. Until they are set, or where a page does not set them, they are the fixed gold and sky.
 */
export const GOLD = 'var(--sa, #EBC862)', SKY = 'var(--sb, #56B4E9)';

const FIXED = { a: '#EBC862', b: '#56B4E9' } as const;
const Sides = createContext<{ a: string; b: string }>(FIXED);

/** The two side colours as real hex values, for the few places that work with the colour itself (the ink on a coloured bar). */
export const useSideColours = (): { a: string; b: string } => useContext(Sides);

/** Provides the two side colours to a page: as hex values to the tiles, and as `--sa` and `--sb` on the document, which is what the stylesheets and the tooltips read. */
export function SideColours({ a, b, children }: { a: string; b: string; children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    // `--sai` and `--sbi` are the ink that reads on each colour, for a label drawn on a bar or a pill of it.
    root.style.setProperty('--sa', a); root.style.setProperty('--sb', b); root.style.setProperty('--sai', inkFor(a)); root.style.setProperty('--sbi', inkFor(b));
    return () => { for (const v of ['--sa', '--sb', '--sai', '--sbi']) root.style.removeProperty(v); };
  }, [a, b]);
  return <Sides.Provider value={{ a, b }}>{children}</Sides.Provider>;
}
/** The colours of Caught, Bowled, LBW, Stumped and Other in every dismissal bar. */
export const DISMISSAL_COLOURS = ['#EBC862', '#56B4E9', '#B79CFF', '#FF9F43', '#6c717a'];

const MotionPlay = createContext(true);

/**
 * A container whose rows reveal one after another and whose numbers count up when it is on screen, and again when `k` (its data) changes.
 * It is the element that holds the rows, so the tile's layout classes go on it.
 */
export function Mo({ k, className, style, winRef, children }: { k: string; className?: string; style?: CSSProperties; /** The ref of useWindowedRows, for a table that draws only the rows on screen. */ winRef?: (node: HTMLDivElement | null) => void; children: ReactNode }) {
  const { ref, motion, played } = useTableMotion<HTMLDivElement>(k, k, ...(winRef ? [winRef] : []));
  return <MotionPlay.Provider value={played}><div ref={ref} data-rows={motion} className={className} style={style}>{children}</div></MotionPlay.Provider>;
}

/** A figure of a row: its numbers count up with the row's container. */
export function Fig({ text }: { text: string }) { return <CountedText text={text} play={useContext(MotionPlay)} />; }

/**
 * Space that opens and closes by its height (Ari, 2026-10-25): what is inside grows out of nothing, or shrinks to nothing, and what is below it moves with it, so a pick screen never snaps when a table or a row of
 * buttons joins it. It starts as it is (no growth on first draw) and changes the frame after `on` changes.
 */
export function Reveal({ on, children, className = '' }: { on: boolean; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(on);
  useEffect(() => { const id = requestAnimationFrame(() => setOpen(on)); return () => cancelAnimationFrame(id); }, [on]);
  return <div className={`reveal${className ? ` ${className}` : ''}${open ? ' on' : ''}`} aria-hidden={!open}><div className="reveal-in">{children}</div></div>;
}

/** The height the table of a pick screen takes when it is open, measured, so the tall search slots can be exactly as much taller than the cards as the table and the gap under it: the buttons then never move. */
export function useTableHeight(): [number, (el: HTMLElement | null) => void] {
  const [h, setH] = useState(260);
  const [node, setNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!node) return;
    const read = (): void => { const box = node.closest('#ptabs') ?? node, cs = getComputedStyle(box); const v = Math.round(box.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)); if (v > 0) setH(v); };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [h, setNode];
}

/** The chips of a search panel: a short row of choices, one of them on. */
export function PickChips<T extends string>({ options, value, onChange, label }: { options: ReadonlyArray<readonly [T, string]>; value: T; onChange: (next: T) => void; label: string }) {
  return (
    <div className="pchips" role="group" aria-label={label}>
      {options.map(([v, text]) => <button key={v} type="button" className={value === v ? 'on' : undefined} aria-pressed={value === v} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(v)}>{text}</button>)}
    </div>
  );
}

/** The number a bar is drawn from: its share of the two numbers together. */
const share = (v: number | null, total: number): number => (v === null || v < 0 ? 0 : (v / total) * 100);

/**
 * Rows of the comparison: the first player's number on the left, the label in the middle with a bar drawn out from the centre for each side, the second player's number on the right (Ari, 2026-10-17).
 * The better number is bright and the other dimmed; a lower number is better where the row says so.
 */
export function CompareRows({ rows, className = '' }: { rows: readonly CompareRow[]; className?: string }) {
  return (
    <Mo k={rows.map((r) => `${r.label}${r.a.s}${r.b.s}`).join('|')} className={`crg${className ? ` ${className}` : ''}`}>
      {rows.map((r) => {
        const lead = leader(r);
        const total = (r.a.v ?? 0) + (r.b.v ?? 0) || 1;
        return (
          <div className={`cr${lead ? ` lead-${lead}` : ''}`} key={r.label}>
            <b className="cva"><Fig text={r.a.s} /></b>
            <div className="cm"><span>{r.label}</span><i><u className="ba" style={{ width: `${share(r.a.v, total) / 2}%` }} /><u className="bb" style={{ width: `${share(r.b.v, total) / 2}%` }} /></i></div>
            <b className="cvb"><Fig text={r.b.s} /></b>
          </div>
        );
      })}
    </Mo>
  );
}

/** The two names in the colours of their sides, under a tile. */
export function Who({ a, b }: { a: string; b: string }) {
  return <div className="cwho"><span className="wa"><i />{a}</span><span className="wb"><i />{b}</span></div>;
}

export function Thin({ children }: { children: ReactNode }) { return <div className="thin">{children}</div>; }

/** One figure of a tile's headline row. */
export function Kn({ value, label, side }: { value: ReactNode; label: ReactNode; side?: 'a' | 'b' }) {
  return <div className={`kn${side ? ` k${side}` : ''}`}><b>{value}</b><span>{label}</span></div>;
}

export const whole = (n: number): string => Math.round(n).toLocaleString('en');
export type { Cell };
