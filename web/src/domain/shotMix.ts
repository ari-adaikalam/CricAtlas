import { describePhase, phaseOrder, type PhaseFormat } from './phases';
import { sentence } from './shotFilter';

// The Shot mix tile: for each shot label (as tracked, as they come), the balls, runs, strike rate, how often the shot was in control and how many times
// the batter got out playing it. Only tracked balls have a label, so the table counts those. By phase splits the balls and strike rate across the phases.

/** One shot in one phase (an overs band in Tests). */
export interface ShotMixCell { shot: string; key: string | null; balls: number; runs: number; outs: number; controlKnown: number; inControl: number }

export interface ShotMixRow {
  shot: string; label: string;
  balls: number; runs: number; outs: number;
  strikeRate: number | null;
  /** Share of the balls with a control reading on which the shot was in control, or null with none. */
  control: number | null;
}

/** One row per shot, adding every phase, most balls first and then by name. */
export function shotMixRows(cells: readonly ShotMixCell[]): ShotMixRow[] {
  const by = new Map<string, ShotMixCell>();
  for (const c of cells) {
    const t = by.get(c.shot) ?? { shot: c.shot, key: null, balls: 0, runs: 0, outs: 0, controlKnown: 0, inControl: 0 };
    t.balls += c.balls; t.runs += c.runs; t.outs += c.outs; t.controlKnown += c.controlKnown; t.inControl += c.inControl;
    by.set(c.shot, t);
  }
  return [...by.values()].filter((t) => t.balls > 0).map((t) => ({
    shot: t.shot, label: sentence(t.shot), balls: t.balls, runs: t.runs, outs: t.outs,
    strikeRate: (t.runs / t.balls) * 100, control: t.controlKnown > 0 ? Math.round((100 * t.inControl) / t.controlKnown) : null,
  })).sort((a, b) => b.balls - a.balls || a.label.localeCompare(b.label));
}

export interface ShotPhaseCell { balls: number; runs: number; outs: number; strikeRate: number | null; control: number | null }
export interface ShotPhaseRow { shot: string; label: string; cells: Record<string, ShotPhaseCell> }

/** The same shots, in the order above, with the balls, runs, strike rate, control and outs in each phase. Phases with no balls are not columns. */
export function shotMixByPhase(cells: readonly ShotMixCell[], format: PhaseFormat, hundred = false): { columns: Array<{ key: string; name: string }>; rows: ShotPhaseRow[] } {
  const keys = [...new Set(cells.filter((c) => c.key !== null && c.balls > 0).map((c) => c.key as string))].sort((a, b) => phaseOrder(a) - phaseOrder(b));
  const rows = shotMixRows(cells).map((r) => {
    const mine: Record<string, ShotPhaseCell> = {};
    for (const k of keys) {
      const hit = cells.find((c) => c.shot === r.shot && c.key === k);
      mine[k] = hit && hit.balls > 0
        ? { balls: hit.balls, runs: hit.runs, outs: hit.outs, strikeRate: (hit.runs / hit.balls) * 100, control: hit.controlKnown > 0 ? Math.round((100 * hit.inControl) / hit.controlKnown) : null }
        : { balls: 0, runs: 0, outs: 0, strikeRate: null, control: null };
    }
    return { shot: r.shot, label: r.label, cells: mine };
  });
  return { columns: keys.map((key) => ({ key, name: describePhase(key, format, hundred).name })), rows };
}
