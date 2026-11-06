'use client';

import { useMemo } from 'react';
import { battingLine, bestIndex, bowlingLine, sortGroups, sortValue, spanOf, type BatInput, type BatLine, type BowlInput, type BowlLine, type Group, type Kind, type SortKey } from '@/domain/fullStats';

/** A row of a group: the figures the lines read, a date for the span and the tournament for The Hundred's economy. */
export type GroupRow = (BatInput | BowlInput) & { date: string; tournament_key: string | null };
import { CountText } from './charts/CountUp';
import { useWindowedRows } from './useWindowedRows';
import { REVEALED } from './useTableMotion';

const int = new Intl.NumberFormat('en');
const whole = (n: number): string => int.format(Math.round(n));
const dash = '-';
const fixed = (v: number | null, digits: number): string => (v === null ? dash : v.toFixed(digits));

export interface SortState { key: SortKey; dir: 1 | -1 }

interface Column { key: SortKey; head: string; hint: string; best?: 'max' | 'min'; main?: boolean }

const BAT_COLUMNS: readonly Column[] = [
  { key: 'mat', head: 'Mat', hint: 'Matches batted in' }, { key: 'inns', head: 'Inns', hint: 'Innings batted' }, { key: 'no', head: 'NO', hint: 'Not outs' },
  { key: 'runs', head: 'Runs', hint: 'Runs scored', main: true }, { key: 'hs', head: 'HS', hint: 'Highest score, * is not out' }, { key: 'avg', head: 'Avg', hint: 'Runs per dismissal', best: 'max' },
  { key: 'bf', head: 'BF', hint: 'Balls faced, wides not counted' }, { key: 'sr', head: 'SR', hint: 'Runs per 100 balls', best: 'max' }, { key: 'hundreds', head: '100s', hint: 'Scores of 100 or more' },
  { key: 'fifties', head: '50s', hint: 'Scores of 50 to 99' }, { key: 'ducks', head: '0s', hint: 'Out for no runs' }, { key: 'fours', head: '4s', hint: 'Fours' }, { key: 'sixes', head: '6s', hint: 'Sixes' },
];
const BOWL_COLUMNS: readonly Column[] = [
  { key: 'mat', head: 'Mat', hint: 'Matches bowled in' }, { key: 'inns', head: 'Inns', hint: 'Innings bowled' }, { key: 'balls', head: 'Balls', hint: 'Legal balls bowled' }, { key: 'runs', head: 'Runs', hint: 'Runs conceded' },
  { key: 'wkts', head: 'Wkts', hint: 'Wickets credited to the bowler', main: true }, { key: 'bbi', head: 'BBI', hint: 'Best bowling in an innings' }, { key: 'avg', head: 'Avg', hint: 'Runs per wicket', best: 'min' },
  { key: 'econ', head: 'Econ', hint: 'Runs per over (per 5 balls in The Hundred)', best: 'min' }, { key: 'sr', head: 'SR', hint: 'Balls per wicket', best: 'min' }, { key: 'four', head: '4w', hint: 'Four wickets in an innings' }, { key: 'five', head: '5w', hint: 'Five or more wickets in an innings' },
];

/** The text of a cell. */
function cellText(line: BatLine | BowlLine, key: SortKey, kind: Kind): string {
  if (kind === 'bat') {
    const l = line as BatLine;
    switch (key) {
      case 'hs': return l.hs === null ? dash : `${l.hs}${l.hsNotOut ? '*' : ''}`;
      case 'avg': return fixed(l.avg, 2);
      case 'sr': return fixed(l.sr, 2);
      default: return whole((l as unknown as Record<string, number>)[key] ?? 0);
    }
  }
  const l = line as BowlLine;
  switch (key) {
    case 'bbi': return l.bbiW === null ? dash : `${l.bbiW}/${l.bbiR}`;
    case 'avg': return fixed(l.avg, 2);
    case 'econ': return fixed(l.econ, 2);
    case 'sr': return fixed(l.sr, 1);
    default: return whole((l as unknown as Record<string, number>)[key] ?? 0);
  }
}

export interface Built<T> { group: Group<T>; line: BatLine | BowlLine; span: string | null }

/** The lines of a table: one for each group, worked out once. A bowler's economy is per 5 balls when every ball of the group was The Hundred's. */
export function buildLines<T extends GroupRow>(groups: readonly Group<T>[], kind: Kind): Built<T>[] {
  return groups.map((g) => ({ group: g, line: kind === 'bat' ? battingLine(g.rows as BatInput[]) : bowlingLine(g.rows as BowlInput[], g.rows.every((r) => r.tournament_key === 'hnd')), span: spanOf(g.rows) }));
}

/** The four cards over a table: the row with the most runs (wickets), the best average, and so on. Only with two or more rows to compare. */
export function cardsOf<T>(built: readonly Built<T>[], kind: Kind): Array<{ label: string; name: string; value: string }> {
  if (built.length < 2) return [];
  const spec: Array<[string, SortKey, 'max' | 'min']> = kind === 'bat'
    ? [['Most runs', 'runs', 'max'], ['Best average', 'avg', 'max'], ['Best strike rate', 'sr', 'max'], ['Most matches', 'mat', 'max']]
    : [['Most wickets', 'wkts', 'max'], ['Best average', 'avg', 'min'], ['Best economy', 'econ', 'min'], ['Best strike rate', 'sr', 'min']];
  return spec.map(([label, key, want]) => {
    const values = built.map((b) => sortValue(b.line, key));
    const best = bestIndex(values, want);
    const pick = best >= 0 ? best : values.findIndex((v) => v !== null && (want === 'max' || v > 0));
    return pick < 0 ? { label, name: dash, value: dash } : { label, name: built[pick]!.group.label, value: cellText(built[pick]!.line, key, kind) };
  });
}

export function StatCards({ cards }: { cards: ReadonlyArray<{ label: string; name: string; value: string }> }) {
  if (cards.length === 0) return null;
  return (
    <div className="fcs">
      {cards.map((c) => <div className="fc" data-mrow key={c.label} title={`${c.label}: ${c.value}, ${c.name}`}><span>{c.label}</span><b>{c.value}</b><em>{c.name}</em></div>)}
    </div>
  );
}

interface Props<T extends GroupRow> {
  id: string;
  title: string;
  kind: Kind;
  built: readonly Built<T>[];
  career: BatLine | BowlLine;
  careerSpan: string | null;
  /** The head of the first column: "Name" by default. */
  nameHead?: string;
  sort: SortState | null;
  onSort: (key: SortKey) => void;
  search: string;
  played: boolean;
}

/** One table of Full stats: the columns of the profile's career table for each group, sortable, with the career row below. Rows with no innings are not here. */
export function StatsTable<T extends GroupRow>({ id, title, kind, built, career, careerSpan, nameHead = 'Name', sort, onSort, search, played }: Props<T>) {
  const columns = kind === 'bat' ? BAT_COLUMNS : BOWL_COLUMNS;
  const q = search.trim().toLowerCase();
  const shown = useMemo(() => {
    const kept = q ? built.filter((b) => b.group.label.toLowerCase().includes(q)) : built;
    return sortGroups(kept.map((b) => ({ group: b.group, line: b.line, span: b.span })), sort, kind);
  }, [built, q, sort, kind]);
  // The best cell of each column is gold when there are more than two rows to compare, as in the mockup.
  const best = useMemo(() => columns.map((c) => (c.best && built.length > 2 ? bestIndex(built.map((b) => sortValue(b.line, c.key)), c.best) : -1)), [built, columns]);
  const bestRowOf = (key: SortKey): number => { const c = columns.findIndex((x) => x.key === key); return c < 0 ? -1 : best[c]!; };
  const win = useWindowedRows<HTMLDivElement>(shown.length, `${id}:${q}`, { rows: `table[data-table='${id}'] tbody tr:not([data-spacer])`, scroller: { closest: '.fsb' } });
  const keyOf = (b: { group: Group<T> }): string => b.group.key;
  const drawn = shown.slice(win.from, win.to);
  return (
    <>
      <h5 className="sub">{title}</h5>
      <span ref={win.ref} hidden />
      <table className="fst" data-table={id}>
        {/* Fixed widths: the same column is the same width and in the same place under every chip, whatever the numbers in it are. */}
        <colgroup><col style={{ width: '20%' }} />{columns.map((c) => <col key={c.key} style={{ width: `${80 / columns.length}%` }} />)}</colgroup>
        <thead>
          <tr>
            <th className={`l srt${sort?.key === 'label' ? (sort.dir > 0 ? ' asc' : ' desc') : ''}`} onClick={() => onSort('label')} title="Sort by name">{nameHead}</th>
            {columns.map((c) => <th key={c.key} className={`srt${sort?.key === c.key ? (sort.dir > 0 ? ' asc' : ' desc') : ''}`} onClick={() => onSort(c.key)} title={`Sort by ${c.head}. ${c.hint}`}>{c.head}</th>)}
          </tr>
        </thead>
        <tbody>
          {win.before > 0 && <tr data-spacer="" aria-hidden="true"><td colSpan={columns.length + 1} style={{ height: win.before, padding: 0, border: 0 }} /></tr>}
          {drawn.map((b, k) => (
            <tr key={keyOf(b)} data-rk={keyOf(b)} data-late={win.windowed && win.from + k >= REVEALED ? '' : undefined}>
              <td className="l"><b>{b.group.label}</b><em>{b.span ?? ''}</em></td>
              {columns.map((c) => {
                const isBest = bestRowOf(c.key) >= 0 && built[bestRowOf(c.key)]!.group.key === b.group.key;
                const text = cellText(b.line, c.key, kind);
                const count = c.main ? (b.line as unknown as Record<string, number>)[c.key === 'wkts' ? 'wkts' : 'runs']! : null;
                return (
                  <td key={c.key} className={`${c.main ? 'bold' : ''}${isBest ? ' bst' : ''}`}>
                    <span>{count !== null ? <CountText value={count} format={(n) => int.format(Math.round(n))} play={played} /> : text}</span>
                  </td>
                );
              })}
            </tr>
          ))}
          {win.after > 0 && <tr data-spacer="" aria-hidden="true"><td colSpan={columns.length + 1} style={{ height: win.after, padding: 0, border: 0 }} /></tr>}
          {shown.length === 0 && <tr><td className="l" colSpan={columns.length + 1}><span className="thin">No row matches &ldquo;{search}&rdquo;.</span></td></tr>}
        </tbody>
        <tfoot>
          <tr>
            <td className="l"><b>Career</b><em>{careerSpan ?? ''}</em></td>
            {columns.map((c) => <td key={c.key} className={c.main ? 'bold' : ''}><span>{cellText(career, c.key, kind)}</span></td>)}
          </tr>
        </tfoot>
      </table>
    </>
  );
}
