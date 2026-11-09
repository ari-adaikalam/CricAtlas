import { OPPONENT_ID, type BallFilters } from './ballFilters';
import { PACE_STYLES, SPIN_STYLES, TYPE_LABELS } from './bowlerType';
import type { PlayerFilters } from './filters';
import { FALSE_SHOT_INNINGS, type ControlRow, type FalseShotInnings } from './control';
import { FLAG_CAUGHT, FLAG_NONSTRIKER, FLAG_OUT, FLAG_POSITION, FLAG_WIDE, LENGTH_NAMES, LINE_NAMES, NONE16, NONE8, type PointSet } from './pointFile';
import type { PitchRuns } from './runsFilter';
import type { PitchRow } from './pitch';
import type { Shot } from './shots';

// The Format, Competition, Season and ball filters of the batting tiles, applied in JavaScript to a point file. They are the rules of data/scope.ts (FORMAT_WHERE, ballWhere, sliceWhere), written
// a second time, so web/scripts/verify-points.ts compares the two on real players and any change to a rule has to be made in both.

const FORMAT = { TEST: 0, ODI: 1, T20: 2 } as const;
const PHASE = { powerplay: 1, middle: 2, death: 3, rest: 4 } as const;
const RESULT = { won: 1, lost: 2, draw: 3 } as const;

/** The balls of the batter that pass the filters, as indexes into the set, in the order of the file (start date, match, innings, delivery). */
export function selectPoints(set: PointSet, filters: PlayerFilters, ball: BallFilters, view: 'bat' | 'bowl' = 'bat'): number[] {
  const test = filters.format === 'TEST';
  const tournament = filters.competition ? set.tournaments.indexOf(filters.competition) : -2;
  const season = filters.season ? set.seasons.indexOf(filters.season) : -2;
  if (tournament === -1 || season === -1) return [];

  // The Bowler type, as the set of style codes it allows (null for any).
  let styles: Set<number> | null = null;
  if (view === 'bat' && (ball.type === 'pace' || ball.type === 'spin')) {
    const list: readonly string[] = ball.type === 'pace' ? PACE_STYLES : SPIN_STYLES;
    styles = new Set(set.styles.flatMap((name, code) => (list.includes(name) ? [code] : [])));
  } else if (view === 'bat' && ball.type.startsWith('s:') && TYPE_LABELS.includes(ball.type.slice(2))) {
    const code = set.styles.indexOf(ball.type.slice(2));
    styles = new Set(code < 0 ? [] : [code]);
  }
  // The opponent, as the codes of that bowler.
  const opponent = OPPONENT_ID.test(ball.opponent) ? set.bowlers.findIndex((b) => b[0] === ball.opponent) : -2;
  if (opponent === -1) return [];

  const band = /^band([0-4])$/.exec(ball.phase);
  const bandLow = test && band ? Number(band[1]) * 20 : -1;
  const bandHigh = test && band && Number(band[1]) < 4 ? (Number(band[1]) + 1) * 20 : Infinity;
  const phase = !test && ball.phase in PHASE ? PHASE[ball.phase as keyof typeof PHASE] : 0;
  const innings = /^[1-4]$/.test(ball.innings) ? Number(ball.innings) : 0;
  const result = ball.result in RESULT ? RESULT[ball.result as keyof typeof RESULT] : 0;

  // The Batter hand of the Bowling view: 1 right, 2 left.
  const hand = view === 'bowl' ? (ball.hand === 'right' ? 1 : ball.hand === 'left' ? 2 : 0) : 0;
  const picked: number[] = [];
  for (let i = 0; i < set.n; i++) {
    switch (filters.format) {
      case 'TEST': if (set.format[i] !== FORMAT.TEST) continue; break;
      case 'ODI': if (set.format[i] !== FORMAT.ODI) continue; break;
      case 'T20I': if (set.format[i] !== FORMAT.T20 || !set.international[i]) continue; break;
      case 'T20S': if (set.format[i] !== FORMAT.T20) continue; break;
      case 'LEAGUE': if (set.international[i]) continue; break;
      case 'INTERNATIONAL': if (!set.international[i]) continue; break;
    }
    if (tournament >= 0 && set.tournament[i] !== tournament) continue;
    if (season >= 0 && set.season[i] !== season) continue;
    if (styles && !styles.has(set.style[i]!)) continue;
    if (hand && set.hand[i] !== hand) continue;
    if (opponent >= 0 && set.bowler[i] !== opponent) continue;
    if (bandLow >= 0 && (set.over[i]! < bandLow || set.over[i]! >= bandHigh)) continue;
    if (phase && set.phase[i] !== phase) continue;
    if (!test) { if (ball.superOvers === 'excluded' && set.superOver[i]) continue; if (ball.superOvers === 'only' && !set.superOver[i]) continue; }
    if (innings && set.innings[i] !== innings) continue;
    if (ball.wickets === 'low' && set.wickets[i]! > 2) continue;
    if (ball.wickets === 'mid' && (set.wickets[i]! < 3 || set.wickets[i]! > 5)) continue;
    if (ball.wickets === 'high' && set.wickets[i]! < 6) continue;
    if (result && set.result[i] !== result) continue;
    picked.push(i);
  }
  return picked;
}

function shotAt(set: PointSet, i: number): Shot {
  const code = set.shot[i]!, name = set.name[i]!;
  return {
    x: set.x[i]!, y: set.y[i]!, runs: set.runs[i]!, out: (set.flags[i]! & FLAG_OUT) !== 0, caught: (set.flags[i]! & FLAG_CAUGHT) !== 0,
    shot: code === NONE8 ? null : set.shots[code] ?? null,
    bowler: name === NONE16 ? null : set.names[name] ?? null,
    over: set.over[i]!, ballInOver: set.ball[i]!,
  };
}

/** The shots tile's rows: the scoring balls and the balls that dismissed the batter, with a position (data/shots.ts, loadShots). */
export function shotsOf(set: PointSet, picked: readonly number[]): Shot[] {
  const out: Shot[] = [];
  for (const i of picked) {
    const f = set.flags[i]!;
    if ((f & FLAG_POSITION) !== 0 && (set.runs[i]! > 0 || (f & FLAG_OUT) !== 0)) out.push(shotAt(set, i));
  }
  return out;
}

/** Every ball faced with a position, dot balls too, wides left out (data/shots.ts, loadLocatedBalls). */
export function locatedOf(set: PointSet, picked: readonly number[]): Shot[] {
  const out: Shot[] = [];
  for (const i of picked) { const f = set.flags[i]!; if ((f & FLAG_POSITION) !== 0 && (f & FLAG_WIDE) === 0) out.push(shotAt(set, i)); }
  return out;
}

/** Balls faced with a line, a length and a control reading, grouped by line and length (data/control.ts, loadControlRows). */
export function controlRowsOf(set: PointSet, picked: readonly number[]): ControlRow[] {
  const groups = new Map<number, ControlRow>();
  for (const i of picked) {
    const f = set.flags[i]!;
    if ((f & (FLAG_NONSTRIKER | FLAG_WIDE)) !== 0 || set.length[i] === 0 || set.line[i] === 0 || set.control[i] === 0) continue;
    const key = set.length[i]! * 8 + set.line[i]!;
    let row = groups.get(key);
    if (!row) { row = { length: LENGTH_NAMES[set.length[i]! - 1]!, line: LINE_NAMES[set.line[i]! - 1]!, known: 0, inControl: 0 }; groups.set(key, row); }
    row.known += 1;
    if (set.control[i] === 1) row.inControl += 1;
  }
  return [...groups.values()];
}

const dateText = (yyyymmdd: number): string => `${String(Math.floor(yyyymmdd / 10000)).padStart(4, '0')}-${String(Math.floor(yyyymmdd / 100) % 100).padStart(2, '0')}-${String(yyyymmdd % 100).padStart(2, '0')}`;

/** The latest innings with a control reading on at least some balls, oldest first, with the false shots in each (data/control.ts, loadFalseShotInnings). */
export function falseShotInningsOf(set: PointSet, picked: readonly number[]): FalseShotInnings[] {
  const groups = new Map<string, { known: number; falseShots: number; date: number; match: number; innings: number; opponent: string }>();
  for (const i of picked) {
    if ((set.flags[i]! & (FLAG_NONSTRIKER | FLAG_WIDE)) !== 0 || set.control[i] === 0) continue;
    const key = `${set.match[i]}:${set.innings[i]}`;
    let g = groups.get(key);
    if (!g) { g = { known: 0, falseShots: 0, date: set.date[i]!, match: set.match[i]!, innings: set.innings[i]!, opponent: set.opponent[i] === NONE16 ? '' : set.opponents[set.opponent[i]!] ?? '' }; groups.set(key, g); }
    g.known += 1;
    if (set.control[i] === 2) g.falseShots += 1;
    if (set.date[i]! > g.date) g.date = set.date[i]!;
  }
  const latest = [...groups.values()].sort((a, b) => b.date - a.date || b.match - a.match || b.innings - a.innings).slice(0, FALSE_SHOT_INNINGS * 4);
  return latest.reverse().map((g) => ({ known: g.known, falseShots: g.falseShots, date: dateText(g.date), opponent: g.opponent }));
}

/** The batter's dismissals, grouped by the line and length of the delivery, and how many there were in all (data/batDismissals.ts, loadDismissalMap). */
export function dismissalMapOf(set: PointSet, picked: readonly number[]): { rows: Array<{ length: string; line: string; outs: number }>; all: number } {
  const groups = new Map<number, { length: string; line: string; outs: number }>();
  let all = 0;
  for (const i of picked) {
    const f = set.flags[i]!;
    if ((f & (FLAG_OUT | FLAG_NONSTRIKER)) === 0) continue;
    all += 1;
    if (set.length[i] === 0 || set.line[i] === 0) continue;
    const key = set.length[i]! * 8 + set.line[i]!;
    let row = groups.get(key);
    if (!row) { row = { length: LENGTH_NAMES[set.length[i]! - 1]!, line: LINE_NAMES[set.line[i]! - 1]!, outs: 0 }; groups.set(key, row); }
    row.outs += 1;
  }
  return { rows: [...groups.values()], all };
}


// The Bowling tiles. A bowler's file (tools/point_files.py) has every legal delivery they bowled; the opponent is the batter, flag bit 0 is a wicket credited to the bowler, and the hand is the batter's.

/** Every legal delivery of a bowler with a position, dot balls too, and a wicket credited on a delivery that was not legal (data/bowlTracking.ts, loadBowlLocated). */
export function bowlLocatedOf(set: PointSet, picked: readonly number[]): Shot[] {
  const out: Shot[] = [];
  for (const i of picked) { const f = set.flags[i]!; if ((f & FLAG_POSITION) !== 0 && ((f & FLAG_WIDE) === 0 || (f & FLAG_OUT) !== 0)) out.push(shotAt(set, i)); }
  return out;
}

/** The scoring balls and the wickets of a bowler, split by the batting hand, with their position; `scoring` counts all of them, tracked or not (data/bowlTracking.ts, loadBowlShots). */
export function bowlShotsOf(set: PointSet, picked: readonly number[]): { right: Shot[]; left: Shot[]; scoring: number } {
  const right: Shot[] = [], left: Shot[] = [];
  let scoring = 0;
  for (const i of picked) {
    const f = set.flags[i]!;
    if (set.runs[i]! === 0 && (f & FLAG_OUT) === 0) continue;
    // A delivery that was not legal counts only for its wicket (a stumping off a wide).
    if ((f & FLAG_WIDE) !== 0 && (f & FLAG_OUT) === 0) continue;
    scoring += 1;
    if ((f & FLAG_POSITION) === 0) continue;
    if (set.hand[i] === 1) right.push(shotAt(set, i)); else if (set.hand[i] === 2) left.push(shotAt(set, i));
  }
  return { right, left, scoring };
}

/** Whether a ball passes the Runs choice of the pitch map; a wicket wins over the runs on the ball (data/pitch.ts, RUNS_WHERE). */
function inRuns(set: PointSet, i: number, runs: PitchRuns): boolean {
  const wicket = (set.flags[i]! & FLAG_OUT) !== 0, r = set.runs[i]!;
  switch (runs) {
    case 'all': return true;
    case 'dot': return !wicket && r === 0;
    case '13': return !wicket && r >= 1 && r <= 3;
    case '1': return !wicket && r === 1;
    case '2': return !wicket && r === 2;
    case '3': return !wicket && r === 3;
    case '4': return !wicket && r === 4;
    case '6': return !wicket && r >= 6;
    case 'wicket': return wicket;
  }
}

/** The legal balls of a bowler grouped by length and line, how many there were in all, and how many have a length and a line (data/pitch.ts, loadPitch). */
export function pitchOf(set: PointSet, picked: readonly number[], runs: PitchRuns): { rows: PitchRow[]; bowled: number; tracked: number } {
  const groups = new Map<number, PitchRow>();
  let bowled = 0;
  for (const i of picked) {
    if (!inRuns(set, i, runs)) continue;
    const f = set.flags[i]!;
    const wicket = (f & FLAG_OUT) !== 0, legal = (f & FLAG_WIDE) === 0;
    // A wicket on a delivery that was not legal is a wicket and not a ball bowled, except when the Runs choice is Wicket, which lists the wickets themselves.
    const ball = legal || runs === 'wicket';
    if (!legal && !wicket) continue;
    if (ball) bowled += 1;
    if (set.length[i] === 0 || set.line[i] === 0) continue;
    const key = set.length[i]! * 8 + set.line[i]!;
    let row = groups.get(key);
    if (!row) { row = { length: LENGTH_NAMES[set.length[i]! - 1]!, line: LINE_NAMES[set.line[i]! - 1]!, balls: 0, dots: 0, scoring: 0, fours: 0, sixes: 0, wickets: 0, runs: 0, inControl: 0, controlKnown: 0 }; groups.set(key, row); }
    if (wicket) row.wickets += 1;
    if (!ball) continue;
    const r = set.runs[i]!;
    row.balls += 1; row.runs += r;
    if (!wicket) {
      if (r === 0) row.dots += 1;
      else if (r === 1 || r === 2 || r === 3 || r === 5) row.scoring += 1;
      else if (r === 4) row.fours += 1;
      else if (r >= 6) row.sixes += 1;
    }
    if (set.control[i] === 1) row.inControl += 1;
    if (set.control[i] !== 0) row.controlKnown += 1;
  }
  const rows = [...groups.values()].filter((r) => r.balls > 0 || r.wickets > 0);
  return { rows, bowled, tracked: rows.reduce((a, r) => a + r.balls, 0) };
}
