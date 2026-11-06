// The Bowler type filter on the Batting view. A bowler is classified by the first style listed for
// them, which is the main one: "right-arm offbreak, legbreak" is an offspinner. Decided with Ari on 2026-10-18.

/** Pace by the first style listed. A bowler of any other first style (such as "right-arm bowler") or with none is in All bowlers only. */
export const PACE_STYLES: readonly string[] = [
  'right-arm fast', 'right-arm fast-medium', 'right-arm medium-fast', 'right-arm medium', 'right-arm slow-medium',
  'left-arm fast', 'left-arm fast-medium', 'left-arm medium-fast', 'left-arm medium', 'left-arm slow-medium',
];
export const SPIN_STYLES: readonly string[] = [
  'right-arm offbreak', 'legbreak', 'legbreak googly', 'right-arm slow', 'slow left-arm orthodox', 'left-arm wrist-spin', 'left-arm slow',
];

/** The thirteen labels of the mockup, in its order. */
export const TYPE_LABELS: readonly string[] = [
  'right-arm fast', 'right-arm fast-medium', 'right-arm medium-fast', 'right-arm medium', 'left-arm fast', 'left-arm fast-medium', 'left-arm medium-fast', 'left-arm medium',
  'right-arm offbreak', 'legbreak', 'legbreak googly', 'slow left-arm orthodox', 'left-arm wrist-spin',
];

export const primaryStyle = (style: string | null): string | null => (style ? style.split(',')[0]?.trim() || null : null);

export type BowlerGroup = 'pace' | 'spin' | null;
export function groupOfStyle(style: string | null): BowlerGroup {
  const first = primaryStyle(style);
  if (first === null) return null;
  return PACE_STYLES.includes(first) ? 'pace' : SPIN_STYLES.includes(first) ? 'spin' : null;
}

/** Filter values: all, pace, spin, or `s:` and one label. */
export const typeValue = (label: string): string => `s:${label}`;
export function isKnownType(value: string): boolean {
  return value === 'all' || value === 'pace' || value === 'spin' || (value.startsWith('s:') && TYPE_LABELS.includes(value.slice(2)));
}

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export interface TypeOption { value: string; label: string; balls: number }

/** The options with how many balls each holds in the slice (a map of first style to balls), so an empty one can be greyed. */
export function typeOptions(ballsByStyle: ReadonlyMap<string, number> | null): TypeOption[] {
  const count = (styles: readonly string[]): number => styles.reduce((a, s) => a + (ballsByStyle?.get(s) ?? 0), 0);
  const total = ballsByStyle ? [...ballsByStyle.values()].reduce((a, b) => a + b, 0) : 0;
  return [
    { value: 'all', label: 'All bowlers', balls: total },
    { value: 'pace', label: 'Pace', balls: count(PACE_STYLES) },
    { value: 'spin', label: 'Spin', balls: count(SPIN_STYLES) },
    ...TYPE_LABELS.map((l) => ({ value: typeValue(l), label: sentence(l), balls: ballsByStyle?.get(l) ?? 0 })),
  ];
}

// The Bowler type tile (batting): the batter's strike rate against each bowler type, next to the strike rate against all bowlers (Ari, 2026-10-18).

export interface TypeCounts { style: string | null; balls: number; runs: number; outs: number }
export interface TypeRow { label: string; style: string; balls: number; runs: number; outs: number; strikeRate: number; difference: number }

/**
 * One row for each first-style label that has balls, most balls first. The comparison is the batter's strike rate against all bowlers in the same filters,
 * the balls of other styles (such as "right-arm bowler") and of bowlers with no style included. A row's difference is its strike rate minus that one, in runs per 100 balls.
 */
export function typeRows(rows: readonly TypeCounts[]): { rows: TypeRow[]; overall: number | null } {
  const total = rows.reduce((a, r) => ({ balls: a.balls + r.balls, runs: a.runs + r.runs }), { balls: 0, runs: 0 });
  const overall = total.balls > 0 ? (total.runs / total.balls) * 100 : null;
  const out = rows
    .filter((r) => r.style && TYPE_LABELS.includes(r.style) && r.balls > 0)
    .map((r) => { const strikeRate = (r.runs / r.balls) * 100; return { label: sentence(r.style!), style: r.style!, balls: r.balls, runs: r.runs, outs: r.outs, strikeRate, difference: overall === null ? 0 : strikeRate - overall }; })
    .sort((a, b) => b.balls - a.balls || a.label.localeCompare(b.label));
  return { rows: out, overall };
}

/**
 * How far the phone's bars reach each side of the overall line, in strike-rate points: the second biggest gap plus a quarter, so one outlier (a type with a few balls) cannot flatten the rest, and at least 10.
 * A gap beyond it is drawn to the edge and marked as cut, with its number printed.
 */
export function barHalfRange(gaps: readonly number[]): number {
  const sizes = gaps.map(Math.abs).sort((a, b) => b - a);
  const base = (sizes.length > 2 ? sizes[1] : sizes[0]) ?? 0;
  return Math.max(10, Math.ceil(base * 1.25));
}

// The Shots by bowler type tile: for each shot and each of the five bowler types with most tracked balls, the share of those balls the shot was played on, and its strike rate.

export interface ShotTypeCounts { style: string | null; shot: string; balls: number; runs: number }
export interface ShotTypeCell { balls: number; share: number | null; strikeRate: number | null }
export interface ShotTypeRow { key: string; label: string; cells: Record<string, ShotTypeCell> }
export interface ShotsByType { columns: Array<{ style: string; label: string; balls: number }>; rows: ShotTypeRow[] }

/**
 * The nine most common shot labels (as tracked, as they come, counted over the balls against the bowler types) and then Other shots, against the five bowler types with most balls that have a shot label. A share is
 * of the labelled balls against that type, so each column adds to 100. A strike rate is the runs per 100 balls of that shot against that type.
 */
export function shotsByType(rows: readonly ShotTypeCounts[], topShots = 9, topTypes = 5): ShotsByType {
  const byShot = new Map<string, number>(), byType = new Map<string, number>();
  for (const r of rows) {
    if (!r.style || !TYPE_LABELS.includes(r.style)) continue;
    byShot.set(r.shot, (byShot.get(r.shot) ?? 0) + r.balls);
    byType.set(r.style, (byType.get(r.style) ?? 0) + r.balls);
  }
  const order = (m: Map<string, number>, n: number): string[] => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k]) => k);
  const shots = order(byShot, topShots), types = order(byType, topTypes);
  const groups = [...shots.map((s) => ({ key: s, label: sentence(s), in: (x: string) => x === s })), { key: 'other', label: 'Other shots', in: (x: string) => !shots.includes(x) }];
  const table = groups.map((g) => ({ key: g.key, label: g.label, cells: {} as Record<string, ShotTypeCell> }));
  for (const style of types) {
    const mine = rows.filter((r) => r.style === style);
    const total = mine.reduce((a, r) => a + r.balls, 0);
    groups.forEach((g, i) => {
      const hit = mine.filter((r) => g.in(r.shot));
      const balls = hit.reduce((a, r) => a + r.balls, 0), runs = hit.reduce((a, r) => a + r.runs, 0);
      table[i]!.cells[style] = { balls, share: total > 0 ? (100 * balls) / total : null, strikeRate: balls > 0 ? (100 * runs) / balls : null };
    });
  }
  const used = table.filter((r) => Object.values(r.cells).some((c) => c.balls > 0));
  return { columns: types.map((style) => ({ style, label: sentence(style), balls: byType.get(style) ?? 0 })), rows: used };
}
