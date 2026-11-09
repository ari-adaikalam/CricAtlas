'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { BarSet, ReviewBar } from '@/domain/fullStatsExtra';
import { ChartTip } from './ChartTip';
import { usePlayOnView } from './charts/usePlayOnView';
import { TipBody } from './TipBody';

const int = new Intl.NumberFormat('en');
const capital = (unit: string): string => unit.charAt(0).toUpperCase() + unit.slice(1);

/** One play state for every chart of a tile, so charts side by side grow together and not one after the other. */
const GroupPlayed = createContext<boolean | null>(null);

export function ChartGroup({ id, signature, columns, template, children }: { id: string; signature: string; columns: number; /** Column widths when the charts are not equal. */ template?: string; children: ReactNode }) {
  const { ref: viewRef, played } = usePlayOnView<HTMLDivElement>(`${id}:${signature}`);
  const own = useRef<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => { own.current = node; viewRef(node); }, [viewRef]);
  // The group is given the height the tile has left, in pixels. Flex and grid heights that depend on the tile's own height are not definite in every browser (Safari
  // let the stack run past the tile and the tile scrolled), so the charts inside get a fixed height to fill.
  useEffect(() => {
    const el = own.current, scroller = el?.closest<HTMLElement>('.fsb');
    if (!el || !scroller) return;
    const fit = (): void => {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      el.style.height = `${Math.max(160, Math.floor(scroller.clientHeight - top - parseFloat(getComputedStyle(scroller).paddingBottom || '0')))}px`;
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(scroller);
    return () => watch.disconnect();
  }, []);
  return <GroupPlayed.Provider value={played}><div className="fsg fit" ref={ref} style={{ gridTemplateColumns: template ?? `repeat(${Math.max(1, Math.min(3, columns))}, minmax(0, 1fr))` }}>{children}</div></GroupPlayed.Provider>;
}

/** Horizontal bars for a set of counts: the bar is the count against the largest, the note beside it a share or a rate. They grow from the left when the tile is on screen, and a tip names the bar. */
export function StatBars({ set, id }: { set: BarSet; id: string }) {
  const [tip, setTip] = useState<{ row: BarSet['rows'][number]; x: number; y: number } | null>(null);
  const own = usePlayOnView<HTMLDivElement>(`${id}:${set.rows.map((r) => `${r.label}${r.value}`).join('|')}`);
  const group = useContext(GroupPlayed);
  const played = group ?? own.played, ref = group === null ? own.ref : undefined;
  const max = Math.max(1, ...set.rows.map((r) => r.value));
  return (
    <div className="fsc fch" data-table={id}>
      <h5 className="sub">{set.title}</h5>
      {set.rows.length === 0 ? <div className="thin">Nothing in these filters.</div> : (
        <div className={`fbars${played ? ' play' : ''}`} ref={ref} onPointerLeave={() => setTip(null)}>
          {set.rows.map((r) => (
            <div className="fbr" key={r.label} data-rk={r.label} onPointerMove={(e) => setTip({ row: r, x: e.clientX, y: e.clientY })} role="img" aria-label={`${r.label}: ${int.format(r.value)} ${set.unit}${r.note ? `, ${r.note}` : ''}`}>
              <span className="fbl">{r.label}</span>
              <span className="fbt"><i style={{ width: `${(100 * r.value) / max}%` }} /></span>
              <b>{int.format(r.value)}</b>
              <em>{r.note}</em>
            </div>
          ))}
        </div>
      )}
      {tip && <ChartTip x={tip.x} y={tip.y}><TipBody title={tip.row.label} rows={[{ label: capital(set.unit), value: int.format(tip.row.value) }]} note={tip.row.note ?? undefined} /></ChartTip>}
    </div>
  );
}

const SEGMENTS = [
  { key: 'struckDown', label: 'Struck down', colour: '#C4313A' },
  { key: 'umpiresCall', label: 'Umpire\'s call', colour: '#EBC862' },
  { key: 'upheld', label: 'Upheld', colour: '#56B4E9' },
] as const;

/** Bars of reviews, each split into struck down, lost on the umpire's call and upheld, as the Reviews tiles read them. */
export function ReviewStack({ title, rows, id }: { title: string; rows: readonly ReviewBar[]; id: string }) {
  const [tip, setTip] = useState<{ row: ReviewBar; label: string; n: number; x: number; y: number } | null>(null);
  const own = usePlayOnView<HTMLDivElement>(`${id}:${rows.map((r) => `${r.label}${r.struckDown}${r.umpiresCall}${r.upheld}`).join('|')}`);
  const group = useContext(GroupPlayed);
  const played = group ?? own.played, ref = group === null ? own.ref : undefined;
  return (
    <div className="fsc fch" data-table={id}>
      <h5 className="sub">{title}</h5>
      <div className={`fbars sources${played ? ' play' : ''}`} ref={ref} onPointerLeave={() => setTip(null)}>
        {rows.map((r) => {
          const total = r.struckDown + r.umpiresCall + r.upheld;
          return (
            <div className="srow" key={r.label} data-rk={r.label}>
              <span>{r.label}</span>
              <div className="stk grow" role="img" aria-label={`${r.label}: ${SEGMENTS.map((s) => `${s.label} ${r[s.key]}`).join(', ')}`}>
                {total === 0 && <span className="thin" style={{ padding: '0 8px', lineHeight: '28px' }}>No reviews</span>}
                {SEGMENTS.filter((s) => r[s.key] > 0).map((s) => (
                  <i key={s.key} style={{ width: `${total > 0 ? (100 * r[s.key]) / total : 0}%`, background: s.colour, color: '#111' }} onPointerMove={(e) => setTip({ row: r, label: s.label, n: r[s.key], x: e.clientX, y: e.clientY })}>
                    {total > 0 && r[s.key] / total > 0.08 ? int.format(r[s.key]) : ''}
                  </i>
                ))}
              </div>
            </div>
          );
        })}
        <div className="sleg">{SEGMENTS.map((s) => <span key={s.key}><i style={{ background: s.colour }} />{s.label}</span>)}</div>
      </div>
      {tip && <ChartTip x={tip.x} y={tip.y}><TipBody title={tip.row.label} rows={[{ label: tip.label, value: `${int.format(tip.n)} of ${int.format(tip.row.struckDown + tip.row.umpiresCall + tip.row.upheld)}` }]} /></ChartTip>}
    </div>
  );
}

/** Blocks that stack inside one column of a chart group. */
export function Stack({ children }: { children: ReactNode }) { return <div className="fstack">{children}</div>; }

const PALETTE = ['#56B4E9', '#EBC862', '#C4313A', '#9aa7b8', '#7BD88F'];

/** A ring split into the shares of a set, with the total in the middle and a legend. The ring is drawn round when the tile is on screen. */
export function Donut({ id, title, rows, unit, colours = PALETTE, centre }: { id: string; title: string; rows: ReadonlyArray<{ label: string; value: number; note?: string }>; unit: string; colours?: readonly string[]; centre?: string }) {
  const [tip, setTip] = useState<{ row: { label: string; value: number }; x: number; y: number } | null>(null);
  const group = useContext(GroupPlayed);
  const own = usePlayOnView<HTMLDivElement>(`${id}:${rows.map((r) => `${r.label}${r.value}`).join('|')}`);
  const played = group ?? own.played;
  const total = rows.reduce((s, r) => s + r.value, 0);
  let acc = 0;
  return (
    <div className="fsc fch" data-table={id} ref={group === null ? own.ref : undefined}>
      <h5 className="sub">{title}</h5>
      {total === 0 ? <div className="thin">Nothing in these filters.</div> : (
        <div className="fdonut" onPointerLeave={() => setTip(null)}>
          <svg viewBox="0 0 120 120" role="img" aria-label={`${title}: ${rows.map((r) => `${r.label} ${r.value}`).join(', ')}`}>
            <circle cx="60" cy="60" r="46" fill="none" stroke="#2c2c2c" strokeWidth="16" />
            {rows.map((r, i) => {
              const share = (100 * r.value) / total;
              const offset = -acc;
              acc += share;
              return <circle key={r.label} cx="60" cy="60" r="46" fill="none" stroke={colours[i % colours.length]} strokeWidth="16" pathLength={100} transform="rotate(-90 60 60)" strokeDasharray={played ? `${Math.max(0, share - 0.6)} ${100 - Math.max(0, share - 0.6)}` : '0 100'} strokeDashoffset={offset}
                style={{ transition: `stroke-dasharray 0.9s cubic-bezier(0.22, 0.7, 0.25, 1) ${i * 70}ms` }} onPointerMove={(e) => setTip({ row: r, x: e.clientX, y: e.clientY })} />;
            })}
            <text x="60" y="58" textAnchor="middle" className="fdn">{int.format(total)}</text>
            <text x="60" y="74" textAnchor="middle" className="fdl">{centre ?? unit}</text>
          </svg>
          <ul className="fleg">
            {rows.map((r, i) => (
              <li key={r.label} onPointerMove={(e) => setTip({ row: r, x: e.clientX, y: e.clientY })}><i style={{ background: colours[i % colours.length] }} /><span>{r.label}</span><b>{int.format(r.value)}</b><em>{Math.round((100 * r.value) / total)}%</em></li>
            ))}
          </ul>
        </div>
      )}
      {tip && <ChartTip x={tip.x} y={tip.y}><TipBody title={tip.row.label} rows={[{ label: capital(unit), value: int.format(tip.row.value) }, { label: 'Share', value: `${Math.round((100 * tip.row.value) / total)}%` }]} /></ChartTip>}
    </div>
  );
}

/** Columns for a set in time order (oldest on the left): they rise from the baseline when the tile is on screen, and a tip names the column. */
export function Columns({ id, title, rows, unit, newestFirst = true }: { id: string; title: string; rows: ReadonlyArray<{ label: string; value: number; note?: string }>; unit: string; /** Rows come newest first and are drawn oldest first. False keeps the order given, for a ranking. */ newestFirst?: boolean }) {
  const [tip, setTip] = useState<{ row: { label: string; value: number }; x: number; y: number } | null>(null);
  const group = useContext(GroupPlayed);
  const own = usePlayOnView<HTMLDivElement>(`${id}:${rows.map((r) => `${r.label}${r.value}`).join('|')}`);
  const played = group ?? own.played;
  const ordered = newestFirst ? [...rows].reverse() : [...rows];
  const max = Math.max(1, ...ordered.map((r) => r.value));
  const many = ordered.length > 14;
  return (
    <div className="fsc fch" data-table={id} ref={group === null ? own.ref : undefined}>
      <h5 className="sub">{title}</h5>
      {ordered.length === 0 ? <div className="thin">Nothing in these filters.</div> : (
        <div className={`fcols${played ? ' play' : ''}`} onPointerLeave={() => setTip(null)}>
          {ordered.map((r, i) => (
            <div className="fcol" key={r.label} role="img" aria-label={`${r.label}: ${r.value} ${unit}`} onPointerMove={(e) => setTip({ row: r, x: e.clientX, y: e.clientY })}>
              {!many && <b>{int.format(r.value)}</b>}
              <span className="fcb"><i style={{ height: `${(100 * r.value) / max}%`, transitionDelay: `${Math.min(i, 20) * 25}ms` }} /></span>
              <em>{many ? `\u2019${r.label.slice(-2)}` : r.label}</em>
            </div>
          ))}
        </div>
      )}
      {tip && <ChartTip x={tip.x} y={tip.y}><TipBody title={tip.row.label} rows={[{ label: capital(unit), value: int.format(tip.row.value) }]} /></ChartTip>}
    </div>
  );
}
