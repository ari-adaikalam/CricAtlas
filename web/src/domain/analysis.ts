import type { BallFile } from './ballByBall';
import type { BowlerCard, InningsCard } from './match';

/**
 * The numbers behind the Analysis tiles that need only Cricsheet: the worm, Manhattan, runs by block, runs per over, run sources, Spells and Matchups.
 * They are worked out from the ball file of one innings (tools/ball_files.py), so every tile agrees with the scorecard. An "over" is the file's own `ov`: an over, or a set of five balls in The Hundred.
 * Pure functions with no browser code.
 */

const runsOf = (f: BallFile, i: number): number => f.rb[i]! + f.wd[i]! + f.nb[i]! + f.by[i]! + f.lb[i]! + f.pe[i]!;
/** Runs charged to the bowler: off the bat, wides and no balls. Byes, leg byes and penalty runs are not. */
const chargedOf = (f: BallFile, i: number): number => f.rb[i]! + f.wd[i]! + f.nb[i]!;

export interface OverStat { runs: number; wickets: number; balls: number }

/** One entry for each over from the first to the last that has a ball, runs including extras, wickets as the file counts them. */
export function overStats(f: BallFile): OverStat[] {
  const out: OverStat[] = [];
  for (let i = 0; i < f.d.length; i++) {
    const ov = f.ov[i]!;
    while (out.length <= ov) out.push({ runs: 0, wickets: 0, balls: 0 });
    const o = out[ov]!;
    o.runs += runsOf(f, i);
    o.wickets += f.w[i]!;
    o.balls += 1;
  }
  return out;
}

/** The score after each over, starting with 0 before the first. */
export function cumulative(stats: readonly OverStat[]): number[] {
  const out = [0];
  for (const s of stats) out.push(out[out.length - 1]! + s.runs);
  return out;
}

/** Runs and wickets in each block of `size` overs (20 overs in a Test, as the Phase filter uses). The last block may be short. */
export interface Block { from: number; to: number; runs: number; wickets: number }
export function blockStats(stats: readonly OverStat[], size = 20): Block[] {
  const out: Block[] = [];
  for (let from = 0; from < stats.length; from += size) {
    const part = stats.slice(from, from + size);
    out.push({ from: from + 1, to: from + part.length, runs: part.reduce((a, s) => a + s.runs, 0), wickets: part.reduce((a, s) => a + s.wickets, 0) });
  }
  return out;
}

/** Where the runs of an innings came from. Bat runs are by what the ball scored, extras by their kind. */
export interface SourceTotals { one: number; two: number; three: number; four: number; six: number; otherBat: number; wd: number; nb: number; by: number; lb: number; pe: number }
export function sourceTotals(f: BallFile): SourceTotals {
  const t: SourceTotals = { one: 0, two: 0, three: 0, four: 0, six: 0, otherBat: 0, wd: 0, nb: 0, by: 0, lb: 0, pe: 0 };
  for (let i = 0; i < f.d.length; i++) {
    const r = f.rb[i]!;
    if (r === 1) t.one += 1; else if (r === 2) t.two += 2; else if (r === 3) t.three += 3; else if (r === 4) t.four += 4; else if (r === 6) t.six += 6; else t.otherBat += r;
    t.wd += f.wd[i]!; t.nb += f.nb[i]!; t.by += f.by[i]!; t.lb += f.lb[i]!; t.pe += f.pe[i]!;
  }
  return t;
}

export interface Slice { key: string; label: string; runs: number; share: number; parts?: string[] }
const SLICES: ReadonlyArray<[keyof SourceTotals, string, string]> = [
  ['one', 'one', 'Singles'], ['two', 'two', 'Twos'], ['three', 'three', 'Threes'], ['four', 'four', 'Fours'], ['six', 'six', 'Sixes'],
  ['wd', 'wd', 'Wides'], ['nb', 'nb', 'No balls'], ['by', 'by', 'Byes'], ['lb', 'lb', 'Leg byes'], ['pe', 'pe', 'Penalty'], ['otherBat', 'otherBat', 'Other bat runs'],
];
/** The slices of an innings in a fixed order. A source under `small` of the runs is not a slice of its own: those are joined as one Other slice at the end (Ari, 2026-10-22, under 3%). */
export function sourceSlices(t: SourceTotals, small = 0.03): Slice[] {
  const total = SLICES.reduce((a, [k]) => a + t[k], 0);
  if (total === 0) return [];
  const kept: Slice[] = [];
  const merged: Slice[] = [];
  for (const [k, key, label] of SLICES) {
    if (t[k] === 0) continue;
    const slice: Slice = { key, label, runs: t[k], share: t[k] / total };
    (slice.share < small ? merged : kept).push(slice);
  }
  if (merged.length > 0) kept.push({ key: 'other', label: 'Other', runs: merged.reduce((a, s) => a + s.runs, 0), share: merged.reduce((a, s) => a + s.share, 0), parts: merged.map((s) => `${s.label} ${s.runs}`) });
  return kept;
}

/** A dismissal a bowler is credited with. Run outs and retirements are not. */
export const creditedToBowler = (type: string): boolean => !/^(run out|retired|obstructing|timed out|handled)/.test(type);

/** One bowler's figures over a set of overs. `balls` are legal balls. */
export interface Figures { overs: number; balls: number; maidens: number; runs: number; wickets: number }
const noFigures = (): Figures => ({ overs: 0, balls: 0, maidens: 0, runs: 0, wickets: 0 });

export interface BowlerOver { over: number; runs: number; balls: number; wickets: number; maiden: boolean }
export interface Spell { from: number; to: number; overs: BowlerOver[]; figures: Figures }
export interface Bowling { name: string; id: string | null; overs: BowlerOver[]; spells: Spell[]; figures: Figures; first: number }

/** The most overs by other bowlers that can sit between two overs of one spell (Ari, 2026-10-22: a gap of up to two overs, so a bowler with overs 1, 3 and 6 has one spell). */
export const SPELL_GAP = 2;

function figuresOf(overs: readonly BowlerOver[]): Figures {
  const out = noFigures();
  for (const o of overs) { out.overs += 1; out.balls += o.balls; out.maidens += o.maiden ? 1 : 0; out.runs += o.runs; out.wickets += o.wickets; }
  return out;
}

/** Splits a bowler's overs, in order, into spells. */
export function spellsOf(overs: readonly BowlerOver[], gap = SPELL_GAP): Spell[] {
  const spells: Spell[] = [];
  for (const o of overs) {
    const last = spells[spells.length - 1];
    if (last && o.over - last.to <= gap + 1) { last.overs.push(o); last.to = o.over; } else spells.push({ from: o.over, to: o.over, overs: [o], figures: noFigures() });
  }
  for (const s of spells) s.figures = figuresOf(s.overs);
  return spells;
}

/**
 * Every bowler of an innings with each over they bowled, their spells and their figures, in the order they first bowled. A bowler's wickets are the dismissals credited to them on the card (not
 * run outs), found by the delivery number. An over split between two bowlers counts for each with the balls they bowled.
 */
export function bowlingOf(f: BallFile, inn: InningsCard, ballsPerOver = 6): Bowling[] {
  const credited = new Map<number, string>();
  for (const c of inn.batters) if (c.out && creditedToBowler(c.out.type)) credited.set(c.out.delivery, c.out.bowlerId ?? c.out.bowler ?? '');
  const byBowler = new Map<number, Map<number, BowlerOver>>();
  const firstBall = new Map<number, number>();
  for (let i = 0; i < f.d.length; i++) {
    const b = f.bo[i]!;
    if (b < 0) continue;
    if (!firstBall.has(b)) firstBall.set(b, i);
    let overs = byBowler.get(b);
    if (!overs) { overs = new Map(); byBowler.set(b, overs); }
    const over = f.ov[i]!;
    let o = overs.get(over);
    if (!o) { o = { over, runs: 0, balls: 0, wickets: 0, maiden: false }; overs.set(over, o); }
    o.runs += chargedOf(f, i);
    o.balls += f.lg[i] === 1 ? 1 : 0;
    if (f.w[i]! > 0 && credited.has(f.d[i]!)) o.wickets += 1;
  }
  const rows: Bowling[] = [];
  for (const [b, overs] of byBowler) {
    const list = [...overs.values()].sort((a, z) => a.over - z.over);
    for (const o of list) o.maiden = o.balls >= ballsPerOver && o.runs === 0;
    const [name, id] = f.pl[b]!;
    rows.push({ name, id, overs: list, spells: spellsOf(list), figures: figuresOf(list), first: firstBall.get(b)! });
  }
  return rows.sort((a, z) => a.first - z.first);
}

/** "3.2" for 20 legal balls in an over of six: whole overs, a dot and the balls over. In The Hundred the balls alone. */
export function oversText(balls: number, perOver = 6): string {
  const whole = Math.floor(balls / perOver), rest = balls % perOver;
  return rest === 0 ? String(whole) : `${whole}.${rest}`;
}

/** The figures as a scorecard writes them: overs-maidens-runs-wickets. */
export const figureLine = (fig: Figures, perOver = 6, hundred = false): string => (hundred ? `${fig.balls}-${fig.runs}-${fig.wickets}` : `${oversText(fig.balls, perOver)}-${fig.maidens}-${fig.runs}-${fig.wickets}`);

/** One batter against one bowler. `out` counts dismissals credited to the bowler. */
export interface Matchup { batter: string; batterId: string | null; bowler: string; bowlerId: string | null; balls: number; runs: number; out: number; dots: number; fours: number; sixes: number }
export const SMALL_MATCHUP = 12;

/** Every pairing of an innings: the batter on strike against the bowler, over the legal balls faced and the runs off the bat. */
export function matchupsOf(f: BallFile, inn: InningsCard): Matchup[] {
  const outs = new Map<number, string>();
  for (const c of inn.batters) if (c.out && creditedToBowler(c.out.type)) outs.set(c.out.delivery, c.name);
  const map = new Map<string, Matchup>();
  for (let i = 0; i < f.d.length; i++) {
    const s = f.st[i]!, b = f.bo[i]!;
    if (s < 0 || b < 0) continue;
    const key = `${s}:${b}`;
    let m = map.get(key);
    if (!m) { const [bat, batId] = f.pl[s]!, [bowl, bowlId] = f.pl[b]!; m = { batter: bat, batterId: batId, bowler: bowl, bowlerId: bowlId, balls: 0, runs: 0, out: 0, dots: 0, fours: 0, sixes: 0 }; map.set(key, m); }
    // A wide is not a ball faced.
    if (f.wd[i]! === 0) { m.balls += 1; m.runs += f.rb[i]!; m.dots += f.rb[i]! === 0 && f.nb[i]! === 0 ? 1 : 0; m.fours += f.rb[i]! === 4 ? 1 : 0; m.sixes += f.rb[i]! === 6 ? 1 : 0; }
    if (f.w[i]! > 0 && outs.has(f.d[i]!)) m.out += 1;
  }
  return [...map.values()];
}

/** The batters (in the order they faced) and bowlers (in the order they bowled) of an innings' pairings, with the pairing for each cell. */
export interface MatchupGrid { batters: Array<{ name: string; id: string | null; balls: number }>; bowlers: Array<{ name: string; id: string | null; balls: number }>; cell: (batter: number, bowler: number) => Matchup | null }
export function matchupGrid(pairs: readonly Matchup[]): MatchupGrid {
  const batters: MatchupGrid['batters'] = [], bowlers: MatchupGrid['bowlers'] = [];
  const bi = new Map<string, number>(), wi = new Map<string, number>();
  const at = new Map<string, Matchup>();
  for (const p of pairs) {
    const bk = p.batterId ?? p.batter, wk = p.bowlerId ?? p.bowler;
    let b = bi.get(bk); if (b === undefined) { b = batters.length; bi.set(bk, b); batters.push({ name: p.batter, id: p.batterId, balls: 0 }); }
    let w = wi.get(wk); if (w === undefined) { w = bowlers.length; wi.set(wk, w); bowlers.push({ name: p.bowler, id: p.bowlerId, balls: 0 }); }
    batters[b]!.balls += p.balls; bowlers[w]!.balls += p.balls;
    const prev = at.get(`${b}:${w}`);
    if (prev) { prev.balls += p.balls; prev.runs += p.runs; prev.out += p.out; prev.dots += p.dots; prev.fours += p.fours; prev.sixes += p.sixes; } else at.set(`${b}:${w}`, { ...p });
  }
  return { batters, bowlers, cell: (b, w) => at.get(`${b}:${w}`) ?? null };
}

/** The bowlers of an innings card, for a check against the figures. */
export const cardFigures = (c: BowlerCard): { balls: number; runs: number; wickets: number } => ({ balls: c.balls, runs: c.runs, wickets: c.wkts });
