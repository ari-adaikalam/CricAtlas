import { decided, otherId, type BatRow, type BowlRow, type Fmt, type TMatch } from './tournament';

// Player lines for the Players view and the champions' top scorers. They are summed from the players' match rows (n/pl) over the matches under the filters. A match with no result is left out.

export interface InningsLine { runs: number; balls: number; out: boolean; oppId: string; matchId: number; edition: string; id: string }
export interface FigureLine { wkts: number; conceded: number; oppId: string; matchId: number; edition: string; id: string }

export interface PlayerAgg {
  id: string; name: string;
  /** The team the player played for in the latest match. */
  teamId: string;
  matches: number; inns: number; runs: number; balls: number; outs: number; fours: number; sixes: number;
  high: { runs: number; out: boolean } | null;
  fifties: number;
  bowlBalls: number; conceded: number; wkts: number; maidens: number; fiveFers: number;
  best: { wkts: number; conceded: number } | null;
  potm: number;
  innings: InningsLine[];
  figures: FigureLine[];
}

export const strikeRate = (p: Pick<PlayerAgg, 'runs' | 'balls'>): number | null => (p.balls ? (p.runs / p.balls) * 100 : null);
export const average = (p: Pick<PlayerAgg, 'runs' | 'outs'>): number | null => (p.outs ? p.runs / p.outs : null);
/** Runs conceded per over, an over being 6 balls (5 in The Hundred, where the page says economy per 5 balls). */
export const economy = (p: Pick<PlayerAgg, 'conceded' | 'bowlBalls'>, format: Fmt): number | null => (p.bowlBalls ? (p.conceded / p.bowlBalls) * (format === 'HUNDRED' ? 5 : 6) : null);
export const bowlAverage = (p: Pick<PlayerAgg, 'conceded' | 'wkts'>): number | null => (p.wkts ? p.conceded / p.wkts : null);

export function playerAgg(bat: readonly BatRow[], bowl: readonly BowlRow[], ms: readonly TMatch[]): PlayerAgg[] {
  const by = new Map(ms.filter(decided).map((m) => [m.id, m]));
  const out = new Map<string, PlayerAgg>();
  const seen = new Map<string, Set<number>>();
  const latest = new Map<string, string>();
  const get = (id: string, name: string): PlayerAgg => {
    let p = out.get(id);
    if (!p) { p = { id, name, teamId: '', matches: 0, inns: 0, runs: 0, balls: 0, outs: 0, fours: 0, sixes: 0, high: null, fifties: 0, bowlBalls: 0, conceded: 0, wkts: 0, maidens: 0, fiveFers: 0, best: null, potm: 0, innings: [], figures: [] }; out.set(id, p); }
    return p;
  };
  const played = (p: PlayerAgg, m: TMatch, teamId: string): void => {
    let s = seen.get(p.id); if (!s) { s = new Set(); seen.set(p.id, s); }
    if (!s.has(m.id)) { s.add(m.id); p.matches += 1; }
    if ((latest.get(p.id) ?? '') <= m.date) { latest.set(p.id, m.date); p.teamId = teamId; }
  };
  for (const b of bat) {
    const m = by.get(b.matchId); if (!m) continue;
    const p = get(b.id, b.name); played(p, m, b.teamId);
    p.inns += 1; p.runs += b.runs; p.balls += b.balls; p.fours += b.fours; p.sixes += b.sixes; if (b.out) p.outs += 1; if (b.runs >= 50) p.fifties += 1;
    if (!p.high || b.runs > p.high.runs || (b.runs === p.high.runs && !b.out && p.high.out)) p.high = { runs: b.runs, out: b.out };
    p.innings.push({ runs: b.runs, balls: b.balls, out: b.out, oppId: otherId(m, b.teamId), matchId: m.id, edition: m.edition, id: b.id });
  }
  for (const w of bowl) {
    const m = by.get(w.matchId); if (!m) continue;
    const p = get(w.id, w.name); played(p, m, w.teamId);
    p.bowlBalls += w.balls; p.conceded += w.runs; p.wkts += w.wkts; p.maidens += w.maidens; if (w.wkts >= 5) p.fiveFers += 1;
    if (w.balls > 0) {
      p.figures.push({ wkts: w.wkts, conceded: w.runs, oppId: otherId(m, w.teamId), matchId: m.id, edition: m.edition, id: w.id });
      if (!p.best || w.wkts > p.best.wkts || (w.wkts === p.best.wkts && w.runs < p.best.conceded)) p.best = { wkts: w.wkts, conceded: w.runs };
    }
  }
  for (const m of by.values()) if (m.potmId) { const p = out.get(m.potmId) ?? get(m.potmId, m.potm ?? 'Unknown player'); p.potm += 1; if (!p.teamId) p.teamId = m.winnerId ?? ''; }
  return [...out.values()];
}

/** The most runs and the most wickets of an edition (the wicket taker with the fewer runs conceded when level), over the matches of the edition given. */
export function editionLeaders(bat: readonly BatRow[], bowl: readonly BowlRow[], ms: readonly TMatch[]): { scorer: PlayerAgg | null; taker: PlayerAgg | null } {
  const all = playerAgg(bat, bowl, ms);
  const scorer = all.reduce<PlayerAgg | null>((a, p) => (p.runs > 0 && (a === null || p.runs > a.runs) ? p : a), null);
  const taker = all.reduce<PlayerAgg | null>((a, p) => (p.wkts > 0 && (a === null || p.wkts > a.wkts || (p.wkts === a.wkts && p.conceded < a.conceded)) ? p : a), null);
  return { scorer, taker };
}

/** The top scorer and the top wicket taker of every edition, from the matches given (all stages, whatever the filters say), by edition key. Rows are split by edition first so each is summed once. */
export function leadersByEdition(bat: readonly BatRow[], bowl: readonly BowlRow[], ms: readonly TMatch[]): ReadonlyMap<string, { scorer: PlayerAgg | null; taker: PlayerAgg | null }> {
  const editionOf = new Map(ms.map((m) => [m.id, m.edition]));
  const split = <T extends { matchId: number }>(rows: readonly T[]): Map<string, T[]> => {
    const out = new Map<string, T[]>();
    for (const r of rows) { const e = editionOf.get(r.matchId); if (e === undefined) continue; const l = out.get(e); if (l) l.push(r); else out.set(e, [r]); }
    return out;
  };
  const b = split(bat), w = split(bowl);
  const out = new Map<string, { scorer: PlayerAgg | null; taker: PlayerAgg | null }>();
  for (const e of new Set(ms.map((m) => m.edition))) out.set(e, editionLeaders(b.get(e) ?? [], w.get(e) ?? [], ms.filter((m) => m.edition === e)));
  return out;
}

// ---- The Players view -------------------------------------------------------------------------------------

/** The qualifying lines for rates and averages (Ari, 2026-10-23): fixed numbers for each format. Tests rank averages, so they need runs and wickets instead of balls. */
export interface Qualifying { faced: number; bowled: number; runs: number; wkts: number }
export const qualifying = (format: Fmt): Qualifying => (format === 'HUNDRED' ? { faced: 60, bowled: 60, runs: 0, wkts: 0 } : format === 'TEST' ? { faced: 0, bowled: 0, runs: 300, wkts: 15 } : { faced: 100, bowled: 120, runs: 0, wkts: 0 });

export const mostRuns = (pl: readonly PlayerAgg[], n = 10): PlayerAgg[] => pl.filter((p) => p.runs > 0).sort((a, b) => b.runs - a.runs || a.balls - b.balls || a.name.localeCompare(b.name)).slice(0, n);
export const mostWickets = (pl: readonly PlayerAgg[], n = 10): PlayerAgg[] => pl.filter((p) => p.wkts > 0).sort((a, b) => b.wkts - a.wkts || a.conceded - b.conceded || a.name.localeCompare(b.name)).slice(0, n);

export interface BestPerformances { innings: InningsLine[]; figures: FigureLine[]; fifties: number; hauls: number; haulAt: number }
/** The best single innings (most runs, then fewest balls) and the best figures (most wickets, then fewest runs) of the players given, with the count of scores of 50 or more and of hauls (five wickets in a Test, three otherwise). */
export function bestPerformances(pl: readonly PlayerAgg[], format: Fmt): BestPerformances {
  const innings = pl.flatMap((p) => p.innings).sort((a, b) => b.runs - a.runs || a.balls - b.balls || Number(a.out) - Number(b.out));
  const figures = pl.flatMap((p) => p.figures).sort((a, b) => b.wkts - a.wkts || a.conceded - b.conceded);
  const haulAt = format === 'TEST' ? 5 : 3;
  return { innings, figures, fifties: innings.filter((i) => i.runs >= 50).length, hauls: figures.filter((f) => f.wkts >= haulAt).length, haulAt };
}

export interface PotmSummary { awards: number; winners: number; repeat: number; most: PlayerAgg[]; byTeam: Array<{ teamId: string; awards: number }>; finals: TMatch[] }
/** Awards in the matches given: how many, to how many players, the most awards, the winner of each final (newest first) and the awards by the team the winner played for in that match. */
export function potmSummary(pl: readonly PlayerAgg[], bat: readonly BatRow[], bowl: readonly BowlRow[], ms: readonly TMatch[]): PotmSummary {
  const given = ms.filter((m) => decided(m) && m.potmId);
  const team = new Map<string, string>();
  const want = new Set(given.map((m) => m.id));
  for (const r of bat) if (want.has(r.matchId)) team.set(`${r.matchId}|${r.id}`, r.teamId);
  for (const r of bowl) if (want.has(r.matchId)) team.set(`${r.matchId}|${r.id}`, r.teamId);
  const by = new Map<string, number>();
  for (const m of given) { const t = team.get(`${m.id}|${m.potmId}`); if (t) by.set(t, (by.get(t) ?? 0) + 1); }
  const withAward = pl.filter((p) => p.potm > 0);
  return {
    awards: given.length, winners: withAward.length, repeat: withAward.filter((p) => p.potm > 1).length,
    most: [...withAward].sort((a, b) => b.potm - a.potm || b.runs - a.runs || a.name.localeCompare(b.name)),
    byTeam: [...by.entries()].map(([teamId, awards]) => ({ teamId, awards })).sort((a, b) => b.awards - a.awards),
    finals: given.filter((m) => m.stageName === 'Final').sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export interface RateLeaders { bat: PlayerAgg[]; bowl: PlayerAgg[]; third: PlayerAgg[]; fours: PlayerAgg[]; line: Qualifying }
/**
 * Best strike rates, best economy, most sixes and most fours among players with enough balls (the fixed line of `qualifying`). Tests rank batting average (300 runs), bowling average (15 wickets),
 * scores of 50 or more and fours.
 */
export function rateLeaders(pl: readonly PlayerAgg[], format: Fmt): RateLeaders {
  const line = qualifying(format), test = format === 'TEST';
  const num = (v: number | null, dir: 1 | -1): number => (v === null ? dir * Infinity : v);
  const bat = test
    ? pl.filter((p) => p.runs >= line.runs && average(p) !== null).sort((a, b) => num(average(b), -1) - num(average(a), -1) || b.runs - a.runs)
    : pl.filter((p) => p.balls >= line.faced).sort((a, b) => (strikeRate(b) ?? 0) - (strikeRate(a) ?? 0) || b.runs - a.runs);
  const bowl = test
    ? pl.filter((p) => p.wkts >= line.wkts).sort((a, b) => num(bowlAverage(a), 1) - num(bowlAverage(b), 1) || b.wkts - a.wkts)
    : pl.filter((p) => p.bowlBalls >= line.bowled).sort((a, b) => num(economy(a, format), 1) - num(economy(b, format), 1) || b.wkts - a.wkts);
  const third = test ? pl.filter((p) => p.fifties > 0).sort((a, b) => b.fifties - a.fifties || b.runs - a.runs) : pl.filter((p) => p.sixes > 0).sort((a, b) => b.sixes - a.sixes || b.runs - a.runs);
  const fours = pl.filter((p) => p.fours > 0).sort((a, b) => b.fours - a.fours || b.runs - a.runs);
  return { bat, bowl, third, fours, line };
}

/** Which innings a Players tile reads: all of them, the first innings of each match (batting first, bowling first) or the second (chasing, or bowling while the other side chases). Tests have four innings, so they have no split. */
export type Split = 'all' | 'first' | 'chase';
export type SplitTile = 'runs' | 'wkts' | 'best' | 'rate';
export const SPLIT_LABEL: Record<Split, string> = { all: 'Overall', first: '1st innings', chase: 'Chasing' };
export const splitRows = <T extends { inn: number }>(rows: readonly T[], split: Split): T[] => (split === 'all' ? [...rows] : rows.filter((r) => r.inn === (split === 'first' ? 1 : 2)));
