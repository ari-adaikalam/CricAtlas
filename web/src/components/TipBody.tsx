import type { ReactNode } from 'react';

export interface TipRow {
  label: string;
  value: ReactNode;
  /** A colour swatch before the label, for a chart with more than one series. */
  colour?: string;
}

/**
 * What every chart tooltip says, in one shape (Ari, 2026-10-24: clear, concise, to the point). A title for the thing under the pointer (a year, an over, an opponent), an optional line
 * under it (a date, an opponent), then the numbers as rows: the label on the left and the value on the right, so a column of tips reads the same everywhere. No sentences. A note
 * goes last and says what a click does or why a number is thin.
 */
export function TipBody({ title, sub, colour, rows, note }: { title: string; sub?: string | readonly string[]; colour?: string; rows?: readonly TipRow[]; note?: string }) {
  return (
    <div className="ct">
      <div className="ct-h">{colour && <i className="ct-dot" style={{ background: colour }} />}<b>{title}</b></div>
      {(typeof sub === 'string' ? [sub] : sub ?? []).filter(Boolean).map((line) => <div className="ct-sub" key={line}>{line}</div>)}
      {rows && rows.length > 0 && (
        <dl className="ct-rows">
          {rows.map((r) => <div className="ct-row" key={r.label}><dt>{r.colour && <i className="ct-dot" style={{ background: r.colour }} />}{r.label}</dt><dd>{r.value}</dd></div>)}
        </dl>
      )}
      {note && <div className="ct-note">{note}</div>}
    </div>
  );
}
