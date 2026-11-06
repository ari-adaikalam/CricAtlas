import { seasonOf, type MatchKind, type TeamMatch, type TeamPlayerRow } from './team';

// The Players view. Rows come from the team's player file, one for each player in each match.

/** A named player is used when the side named no more than eleven, or when they batted, bowled or took a fielding dismissal. A side that named more (an impact player, a squad list) has its unused ones left out. */
export function usedRows(rows: readonly TeamPlayerRow[]): Map<string, boolean> {
  const named = new Map<number, number>();
  for (const r of rows) if (r.named) named.set(r.matchId, (named.get(r.matchId) ?? 0) + 1);
  const out = new Map<string, boolean>();
  for (const r of rows) {
    if (!r.named) continue;
    const did = r.batInns > 0 || r.bowlInns > 0 || r.catches + r.stumpings + r.runOuts > 0;
    out.set(`${r.matchId}|${r.id}`, (named.get(r.matchId) ?? 0) <= 11 || did);
  }
  return out;
}

/** The rows of the matches in scope. */
export function rowsIn(rows: readonly TeamPlayerRow[], ms: readonly TeamMatch[]): TeamPlayerRow[] {
  const ids = new Set(ms.map((m) => m.id));
  return rows.filter((r) => ids.has(r.matchId));
}

export interface SquadRow {
  id: string;
  name: string;
  /** Matches the player was used in. */
  matches: number;
  /** Matches the player was named for and not used. */
  notUsed: number;
  inns: number;
  runs: number;
  balls: number;
  outs: number;
  high: number;
  average: number | null;
  strikeRate: number | null;
  fifties: number;
  hundreds: number;
  wkts: number;
  bowlBalls: number;
  conceded: number;
  bowlAverage: number | null;
  economy: number | null;
  fiveWickets: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  dismissals: number;
  potm: number;
}

/** Runs per 5 balls only when every match is The Hundred, otherwise per 6. */
export const economyBalls = (ms: readonly TeamMatch[]): 5 | 6 => (ms.length > 0 && ms.every((m) => m.kind === 'hundred') ? 5 : 6);

/** One row for each player used in the matches in scope. A substitute fielder is not a player used, so they do not appear here (Top fielders counts them). */
export function squad(rows: readonly TeamPlayerRow[], ms: readonly TeamMatch[]): SquadRow[] {
  const mine = rowsIn(rows, ms);
  const used = usedRows(mine);
  const unit = economyBalls(ms);
  const by = new Map<string, SquadRow>();
  for (const r of mine) {
    if (!r.named) continue;
    const u = used.get(`${r.matchId}|${r.id}`) ?? false;
    const e = by.get(r.id) ?? { id: r.id, name: r.name, matches: 0, notUsed: 0, inns: 0, runs: 0, balls: 0, outs: 0, high: 0, average: null, strikeRate: null, fifties: 0, hundreds: 0, wkts: 0, bowlBalls: 0, conceded: 0, bowlAverage: null, economy: null, fiveWickets: 0, catches: 0, stumpings: 0, runOuts: 0, dismissals: 0, potm: 0 };
    if (!u) { e.notUsed += 1; by.set(r.id, e); continue; }
    e.matches += 1; e.inns += r.batInns; e.runs += r.runs; e.balls += r.balls; e.outs += r.outs; e.high = Math.max(e.high, r.high); e.fifties += r.fifties; e.hundreds += r.hundreds;
    e.wkts += r.wkts; e.bowlBalls += r.bowlBalls; e.conceded += r.conceded; e.fiveWickets += r.fivefers;
    e.catches += r.catches; e.stumpings += r.stumpings; e.runOuts += r.runOuts; e.potm += r.potm ? 1 : 0;
    by.set(r.id, e);
  }
  return [...by.values()].filter((e) => e.matches > 0).map((e) => ({
    ...e,
    average: e.outs > 0 ? e.runs / e.outs : null,
    strikeRate: e.balls > 0 ? (e.runs / e.balls) * 100 : null,
    bowlAverage: e.wkts > 0 ? e.conceded / e.wkts : null,
    economy: e.bowlBalls > 0 ? (e.conceded / e.bowlBalls) * unit : null,
    dismissals: e.catches + e.stumpings + e.runOuts,
  })).sort((a, b) => b.matches - a.matches || b.runs - a.runs || a.name.localeCompare(b.name));
}

export type SquadKey = 'name' | 'matches' | 'notUsed' | 'inns' | 'runs' | 'high' | 'average' | 'strikeRate' | 'wkts' | 'bowlAverage' | 'economy' | 'catches' | 'potm';
export interface SquadSort { key: SquadKey; dir: 1 | -1 }

export function sortSquad(rows: readonly SquadRow[], sort: SquadSort): SquadRow[] {
  const val = (r: SquadRow): number | string | null => r[sort.key];
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    // A missing value (no average, no wickets) always goes to the bottom.
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (x === null) return 1;
    if (y === null) return -1;
    const d = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
    return (d * sort.dir) || a.name.localeCompare(b.name);
  });
}

export function searchSquad(rows: readonly SquadRow[], text: string): SquadRow[] {
  const q = text.trim().toLowerCase();
  return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : [...rows];
}

// ---- Top performers -----------------------------------------------------------------------

/**
 * The qualifying line for an average, a strike rate or an economy (Ari, 2026-10-22): a player counts when they were used in at least a tenth of the matches in scope, and never fewer than five
 * (fewer when the scope has fewer matches). A quarter of the median balls was tried first, and on real teams it was always below the floor, so a player with four Tests led India's averages.
 */
export function minMatches(matches: number): number { return Math.min(matches, Math.max(5, Math.ceil(matches / 10))); }

const FLOORS: Record<MatchKind, { bat: number; bowl: number }> = { test: { bat: 300, bowl: 360 }, odi: { bat: 120, bowl: 180 }, t20: { bat: 60, bowl: 60 }, hundred: { bat: 40, bowl: 40 } };
/** The floors of the scope: the highest of its kinds, so a mix never lowers the bar. */
export function floorsOf(ms: readonly TeamMatch[]): { bat: number; bowl: number } {
  const kinds = [...new Set(ms.map((m) => m.kind))];
  return kinds.reduce((a, k) => ({ bat: Math.max(a.bat, FLOORS[k].bat), bowl: Math.max(a.bowl, FLOORS[k].bowl) }), { bat: 0, bowl: 0 });
}

export interface Leader { id: string; name: string; value: number; text: string; matches: number }
export interface Lists {
  runs: Leader[]; average: Leader[]; strikeRate: Leader[];
  wickets: Leader[]; bowlAverage: Leader[]; economy: Leader[];
  catches: Leader[]; potm: Leader[];
  minMatches: number; minBat: number; minBowl: number;
}

/** The first `n` rows by a value: `higher` ranks the largest first, otherwise the smallest. A row with no value is left out, and ties go to the player with more matches. */
const top = (rows: readonly SquadRow[], value: (r: SquadRow) => number | null, text: (v: number) => string, higher: boolean, n = 5): Leader[] =>
  rows.map((r) => ({ r, v: value(r) })).filter((x): x is { r: SquadRow; v: number } => x.v !== null)
    .sort((a, b) => (higher ? b.v - a.v : a.v - b.v) || b.r.matches - a.r.matches || a.r.name.localeCompare(b.r.name)).slice(0, n)
    .map(({ r, v }) => ({ id: r.id, name: r.name, value: v, text: text(v), matches: r.matches }));

export function leaderLists(rows: readonly SquadRow[], ms: readonly TeamMatch[]): Lists {
  const floors = floorsOf(ms);
  const line = minMatches(ms.length);
  const minBat = floors.bat, minBowl = floors.bowl;
  const batters = rows.filter((r) => r.matches >= line && r.balls >= minBat), bowlers = rows.filter((r) => r.matches >= line && r.bowlBalls >= minBowl);
  const int = new Intl.NumberFormat('en');
  return {
    runs: top(rows, (r) => (r.runs > 0 ? r.runs : null), (v) => int.format(v), true),
    average: top(batters, (r) => r.average, (v) => v.toFixed(1), true),
    strikeRate: top(batters, (r) => r.strikeRate, (v) => v.toFixed(1), true),
    wickets: top(rows, (r) => (r.wkts > 0 ? r.wkts : null), (v) => int.format(v), true),
    // Lower is better for these two.
    bowlAverage: top(bowlers.filter((r) => r.wkts > 0), (r) => r.bowlAverage, (v) => v.toFixed(1), false),
    economy: top(bowlers, (r) => r.economy, (v) => v.toFixed(2), false),
    catches: top(rows, (r) => (r.catches > 0 ? r.catches : null), (v) => int.format(v), true),
    potm: top(rows, (r) => (r.potm > 0 ? r.potm : null), (v) => String(v), true),
    minMatches: line, minBat, minBowl,
  };
}

/** The best single performances in the scope, from each player's best match. Not-outs are not marked because the file keeps only the highest score of a match. */
export interface Single { id: string; name: string; matchId: number; text: string; value: number; opp: string; date: string }
export function bestInnings(rows: readonly TeamPlayerRow[], ms: readonly TeamMatch[], n = 5): Single[] {
  const by = new Map(ms.map((m) => [m.id, m]));
  return rowsIn(rows, ms).filter((r) => r.named && r.batInns > 0).sort((a, b) => b.high - a.high || a.date.localeCompare(b.date)).slice(0, n)
    .map((r) => ({ id: r.id, name: r.name, matchId: r.matchId, value: r.high, text: String(r.high), opp: by.get(r.matchId)?.opp ?? '', date: r.date }));
}
export function bestFigures(rows: readonly TeamPlayerRow[], ms: readonly TeamMatch[], n = 5): Single[] {
  const by = new Map(ms.map((m) => [m.id, m]));
  return rowsIn(rows, ms).filter((r) => r.named && r.bestWkts > 0).sort((a, b) => b.bestWkts - a.bestWkts || a.bestRuns - b.bestRuns || a.date.localeCompare(b.date)).slice(0, n)
    .map((r) => ({ id: r.id, name: r.name, matchId: r.matchId, value: r.bestWkts, text: `${r.bestWkts}/${r.bestRuns}`, opp: by.get(r.matchId)?.opp ?? '', date: r.date }));
}

/** The fielders: everyone who made a dismissal for the team, substitutes included. */
export interface FielderRow { id: string; name: string; catches: number; stumpings: number; runOuts: number; total: number; matches: number }
export function fielders(rows: readonly TeamPlayerRow[], ms: readonly TeamMatch[]): FielderRow[] {
  const by = new Map<string, FielderRow>();
  const seen = new Map<string, Set<number>>();
  for (const r of rowsIn(rows, ms)) {
    if (r.catches + r.stumpings + r.runOuts === 0) continue;
    const e = by.get(r.id) ?? { id: r.id, name: r.name, catches: 0, stumpings: 0, runOuts: 0, total: 0, matches: 0 };
    e.catches += r.catches; e.stumpings += r.stumpings; e.runOuts += r.runOuts; e.total += r.catches + r.stumpings + r.runOuts;
    by.set(r.id, e);
    const s = seen.get(r.id) ?? new Set<number>(); s.add(r.matchId); seen.set(r.id, s);
  }
  for (const [id, e] of by) e.matches = seen.get(id)!.size;
  return [...by.values()];
}

// ---- Players used by season ---------------------------------------------------------------------

export interface UsedGrid { seasons: string[]; rows: Array<{ id: string; name: string; total: number; cells: Array<number | null> }>; perSeason: number[]; debuts: number[] }

/** Players down, seasons across, each cell the matches the player was used in. Sorted by total. A season's count is the players used, and its debuts the players whose first season in these matches it is. */
export function usedGrid(rows: readonly TeamPlayerRow[], ms: readonly TeamMatch[], national: boolean): UsedGrid {
  const mine = rowsIn(rows, ms);
  const used = usedRows(mine);
  const season = new Map(ms.map((m) => [m.id, seasonOf(m, national)]));
  const seasons = [...new Set(ms.map((m) => seasonOf(m, national)))].sort();
  const col = new Map(seasons.map((s, i) => [s, i]));
  const by = new Map<string, { id: string; name: string; total: number; cells: Array<number | null> }>();
  for (const r of mine) {
    if (!r.named || !used.get(`${r.matchId}|${r.id}`)) continue;
    const i = col.get(season.get(r.matchId)!)!;
    const e = by.get(r.id) ?? { id: r.id, name: r.name, total: 0, cells: seasons.map(() => null) };
    e.cells[i] = (e.cells[i] ?? 0) + 1; e.total += 1;
    by.set(r.id, e);
  }
  const list = [...by.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const perSeason = seasons.map((_, i) => list.filter((p) => p.cells[i] !== null).length);
  const debuts = seasons.map((_, i) => list.filter((p) => p.cells.findIndex((c) => c !== null) === i).length);
  return { seasons, rows: list, perSeason, debuts };
}
