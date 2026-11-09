'use client';

import { useState } from 'react';
import type { CustomTable } from '@/domain/fullStatsExtra';

const int = new Intl.NumberFormat('en');
const num = (v: string | number): number | null => {
  if (typeof v === 'number') return v;
  const t = Number.parseFloat(String(v).replace(/,|%|\*/g, ''));
  return Number.isNaN(t) ? null : t;
};
const show = (v: string | number): string => (typeof v === 'number' ? int.format(v) : v);

/**
 * A table of Full stats that is not the career table's columns (dismissed for, awards, fielding, Super Overs, reviews, shot placement). Its columns sort, a column of counts has a Total row, and
 * a table with one row is shown as cards. The same look as the standard tables (.fst).
 */
export function CustomStats({ table, id }: { table: CustomTable; id: string }) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const rows = sort
    ? [...table.rows].sort((a, b) => {
      if (sort.col === 0) return sort.dir * String(a[0]).localeCompare(String(b[0]));
      const x = num(a[sort.col]!), y = num(b[sort.col]!);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return sort.dir * (x - y);
    })
    : table.rows;
  const click = (col: number): void => setSort((was) => (was?.col === col ? { col, dir: was.dir === 1 ? -1 : 1 } : { col, dir: col === 0 ? 1 : -1 }));
  const totals = table.rows.length > 1 && table.sum ? table.head.map((_, i) => (i === 0 ? 'Total' : table.sum![i - 1] ? int.format(table.rows.reduce((s, r) => s + (num(r[i]!) ?? 0), 0)) : '')) : null;
  if (table.rows.length === 1) {
    return (
      <div className="fsc one" data-table={id}>
        <h5 className="sub">{table.title}</h5>
        <div className="k1g">{table.head.map((h, i) => (i ? <div className="k1" key={h}><span>{h}</span><b>{show(table.rows[0]![i]!)}</b></div> : null))}</div>
        <div className="k1n">{show(table.rows[0]![0]!)}</div>
      </div>
    );
  }
  return (
    <div className="fsc" data-table={id}>
      <h5 className="sub">{table.title}</h5>
      <table className="fst">
        <thead>
          <tr>{table.head.map((h, i) => <th key={h} className={`${i === 0 ? 'l ' : ''}srt${sort?.col === i ? (sort.dir > 0 ? ' asc' : ' desc') : ''}`} onClick={() => click(i)} title={`Sort by ${h}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td className="l" colSpan={table.head.length}><span className="thin">Nothing in these filters.</span></td></tr>}
          {rows.map((r) => (
            <tr key={String(r[0])} data-rk={String(r[0])}>
              {r.map((c, i) => (i === 0 ? <td className="l" key={i}><b>{show(c)}</b></td> : <td key={i}><span>{show(c)}</span></td>))}
            </tr>
          ))}
        </tbody>
        {totals && <tfoot><tr>{totals.map((c, i) => (i === 0 ? <td className="l" key={i}><b>{c}</b></td> : <td key={i}><span>{c}</span></td>))}</tr></tfoot>}
      </table>
    </div>
  );
}
