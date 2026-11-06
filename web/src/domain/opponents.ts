import type { View } from './ballFilters';
import { describePhase, phaseOrder, type PhaseFormat } from './phases';

// The Against tiles: every opponent a player met (the bowlers a batter faced, the batters a bowler bowled to), as a table, and the top ones by phase.
// Everything is worked out from counts. Run outs are not credited to the bowler, so an opponent's "outs" are the bowler's wickets in both views.

/** One opponent's balls in one phase (key is null for a ball with no phase, such as a Super Over ball). */
export interface OpponentCell {
  id: string; name: string; style: string | null; key: string | null;
  balls: number;
  /** Runs off the bat for a batter, runs charged to the bowler for a bowler. */
  runs: number;
  outs: number; dots: number;
  controlKnown: number; inControl: number;
}

export interface OpponentRow {
  id: string; name: string; style: string | null;
  balls: number; runs: number; outs: number;
  average: number | null;
  /** Strike rate for a batter, economy for a bowler. */
  rate: number | null;
  dotShare: number | null;
  controlShare: number | null;
  /** Fewer balls than the small-sample line, so the numbers are shaky. */
  small: boolean;
}

/** A pairing under this many balls is marked as a small sample: 30 in Tests and 12 elsewhere. */
export const smallSample = (test: boolean): number => (test ? 30 : 12);

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((100 * part) / whole) : null);

function rate(view: View, runs: number, balls: number, hundred: boolean): number | null {
  if (balls <= 0) return null;
  return view === 'bat' ? (runs / balls) * 100 : (runs / balls) * (hundred ? 5 : 6);
}

/** One row per opponent, adding every phase. */
export function opponentRows(cells: readonly OpponentCell[], view: View, test: boolean, hundred = false): OpponentRow[] {
  const by = new Map<string, OpponentCell>();
  for (const c of cells) {
    const t = by.get(c.id) ?? { ...c, key: null, balls: 0, runs: 0, outs: 0, dots: 0, controlKnown: 0, inControl: 0 };
    t.balls += c.balls; t.runs += c.runs; t.outs += c.outs; t.dots += c.dots; t.controlKnown += c.controlKnown; t.inControl += c.inControl;
    by.set(c.id, t);
  }
  return [...by.values()].filter((t) => t.balls > 0).map((t) => ({
    id: t.id, name: t.name, style: t.style, balls: t.balls, runs: t.runs, outs: t.outs,
    average: t.outs > 0 ? t.runs / t.outs : null, rate: rate(view, t.runs, t.balls, hundred),
    dotShare: pct(t.dots, t.balls), controlShare: pct(t.inControl, t.controlKnown), small: t.balls < smallSample(test),
  }));
}

export type OpponentSort = 'balls' | 'outs' | 'rate';

/** Most balls, most outs (then most balls), or fastest scoring (the highest strike rate or, for a bowler, the highest economy). Names break ties. */
export function sortOpponents(rows: readonly OpponentRow[], by: OpponentSort): OpponentRow[] {
  const key = (r: OpponentRow): number[] => (by === 'balls' ? [r.balls] : by === 'outs' ? [r.outs, r.balls] : [r.rate ?? -1, r.balls]);
  return [...rows].sort((a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return (kb[i] ?? 0) - (ka[i] ?? 0); return a.name.localeCompare(b.name); });
}

export interface HeatCell { rate: number | null; outs: number; balls: number }
export interface HeatRow { id: string; name: string; cells: Record<string, HeatCell> }
export interface Heat { columns: Array<{ key: string; name: string }>; rows: HeatRow[]; min: number; max: number }

/**
 * Every opponent with balls, most balls first, and their rate and outs in each phase. min and max are for the colour scale and come from the cells with at least
 * `reliable` balls, so a one-ball cell cannot stretch the scale. With no such cell they come from every cell.
 */
export function opponentPhases(cells: readonly OpponentCell[], view: View, format: PhaseFormat, hundred = false, reliable = 0, top = Infinity): Heat {
  const keys = [...new Set(cells.filter((c) => c.key !== null && c.balls > 0).map((c) => c.key as string))].sort((a, b) => phaseOrder(a) - phaseOrder(b));
  const best = opponentRows(cells, view, false, hundred).sort((a, b) => b.balls - a.balls || a.name.localeCompare(b.name)).slice(0, top);
  const rows = best.map((o) => {
    const mine: Record<string, HeatCell> = {};
    for (const k of keys) {
      const cell = cells.find((c) => c.id === o.id && c.key === k);
      mine[k] = cell && cell.balls > 0 ? { rate: rate(view, cell.runs, cell.balls, hundred), outs: cell.outs, balls: cell.balls } : { rate: null, outs: 0, balls: 0 };
    }
    return { id: o.id, name: o.name, cells: mine };
  });
  const all = rows.flatMap((r) => Object.values(r.cells));
  const sound = all.filter((c) => c.rate !== null && c.balls >= reliable);
  const rates = (sound.length > 0 ? sound : all).map((c) => c.rate).filter((v): v is number => v !== null);
  return { columns: keys.map((key) => ({ key, name: describePhase(key, format, hundred).name })), rows, min: rates.length ? Math.min(...rates) : 0, max: rates.length ? Math.max(...rates) : 0 };
}
