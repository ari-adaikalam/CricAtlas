import type { InningsCard, MatchBundle } from './match';
import { ballLabel, howOut, ordinal } from './matchDetails';

/**
 * The wording and grouping of the Ball by ball part of Match details. A ball file (tools/ball_files.py) holds one innings as arrays, one entry for each delivery.
 * Everything the part shows that is not stored (the running score, the totals of an over, the bowler of an over, the change in win chance) is worked out here, once.
 */

export interface BallFile {
  v: number;
  d: number[]; ov: number[]; sb: Array<number | null>; lg: number[]; st: number[]; bo: number[];
  rb: number[]; wd: number[]; nb: number[]; by: number[]; lb: number[]; pe: number[]; w: number[];
  sh: number[]; ln: number[]; le: number[]; ct: number[]; wp: number[];
  /** Where the ball was placed on the ground, -1 when it was not (the Analysis wagon wheel and Ring). Absent in a file built before they were added. */
  wx?: number[]; wy?: number[];
  /** The projected final score after each ball, -1 when there is none. Absent in a file built before it was added. */
  ps?: number[];
  ev: Record<string, number[]>;
  pl: Array<[string, string | null]>; /** The batting hand of each name in `pl`: R, L, or empty. */ ph?: string[]; shots: string[]; lines: string[]; lens: string[]; tags: string[];
}

export type ChipKind = 'dot' | 'one' | 'two' | 'four' | 'six' | 'runs' | 'wicket' | 'extra';

export interface BallRow {
  index: number;
  /** "5.3", or the ball of the match in The Hundred. */
  label: string;
  batter: { name: string; id: string | null } | null;
  bowler: { name: string; id: string | null } | null;
  chip: { text: string; kind: ChipKind };
  /** What the ball was: the scorecard wording of a dismissal, the shot otherwise ("no tracking" is the part's to say). */
  wicketText: string;
  shot: string;
  line: string;
  control: 'in control' | 'not in control' | null;
  /** The batting side's chance of winning after the ball, 0 to 100, or null. */
  win: number | null;
  /** The change from the ball before, in points, or null on the first ball or where either is missing. */
  change: number | null;
  score: string;
  tracked: boolean;
  tags: string[];
  /** The tooltip of the result chip, one line each: what the ball was in words, who and how, and where in the innings. */
  tip: string[];
  /** The tip as one sentence, for screen readers. */
  summary: string;
}

export interface OverRow {
  over: number;
  /** Over 4, or Balls 16 to 20 in The Hundred. */
  title: string;
  bowler: { name: string; id: string | null } | null;
  runs: number;
  wickets: number;
  end: string;
  tracked: number;
  balls: number;
  first: number;
  last: number;
}

/** Short text for the Result chip. Bat runs are a number, an extra is its tag with the runs it gave: Wd, 5 Wd, Nb, 4 Nb, 2 B, 1 LB, 5 Pen. */
export function chipFor(rb: number, wd: number, nb: number, by: number, lb: number, pe: number, wicket: boolean): { text: string; kind: ChipKind } {
  if (wicket) return { text: 'W', kind: 'wicket' };
  if (wd > 0) return { text: wd === 1 ? 'Wd' : `${wd} Wd`, kind: 'extra' };
  if (nb > 0) return { text: rb > 0 ? `${rb} Nb` : 'Nb', kind: 'extra' };
  if (by > 0) return { text: `${by} B`, kind: 'extra' };
  if (lb > 0) return { text: `${lb} LB`, kind: 'extra' };
  if (pe > 0) return { text: `${pe} Pen`, kind: 'extra' };
  return { text: rb === 0 ? '•' : String(rb), kind: rb === 0 ? 'dot' : rb === 1 ? 'one' : rb === 2 ? 'two' : rb === 4 ? 'four' : rb === 6 ? 'six' : 'runs' };
}

const who = (f: BallFile, k: number): { name: string; id: string | null } | null => (k < 0 || !f.pl[k] ? null : { name: f.pl[k]![0], id: f.pl[k]![1] });

/** What the ball was, in words: "Dot ball", "Four", "No ball, 4 off the bat", "2 byes". */
export function resultWords(rb: number, wd: number, nb: number, by: number, lb: number, pe: number, wicket: boolean): string {
  if (wicket) return 'Wicket';
  if (wd > 0) return wd === 1 ? 'Wide' : `Wide, ${wd} runs`;
  if (nb > 0) return rb > 0 ? `No ball, ${rb} off the bat` : 'No ball';
  if (by > 0) return `${by} ${by === 1 ? 'bye' : 'byes'}`;
  if (lb > 0) return `${lb} leg ${lb === 1 ? 'bye' : 'byes'}`;
  if (pe > 0) return `${pe} penalty runs`;
  return rb === 0 ? 'Dot ball' : rb === 4 ? 'Four' : rb === 6 ? 'Six' : `${rb} ${rb === 1 ? 'run' : 'runs'}`;
}

/** The dismissal text of the ball in scorecard wording, "c Fielder b Bowler". The batter is already named in the Delivery column, so a lone dismissal does not repeat the name. A ball with two dismissals names each batter. */
function wicketTextOf(inn: InningsCard, delivery: number): string {
  const outs = inn.batters.filter((c) => c.out && c.out.delivery === delivery && !c.out.type.startsWith('retired'));
  return outs.length === 1 ? howOut(outs[0]!.out) : outs.map((c) => `${c.name} ${howOut(c.out)}`).join('; ');
}

export function ballRows(b: MatchBundle, inn: InningsCard, f: BallFile): BallRow[] {
  const rows: BallRow[] = [];
  let score = 0, wickets = 0, before: number | null = null;
  const hundred = b.match.kind === 'hundred';
  for (let i = 0; i < f.d.length; i++) {
    score += f.rb[i]! + f.wd[i]! + f.nb[i]! + f.by[i]! + f.lb[i]! + f.pe[i]!;
    const wicket = f.w[i]! > 0;
    wickets += f.w[i]!;
    const win = f.wp[i]! >= 0 ? f.wp[i]! : null;
    const change = win !== null && before !== null ? win - before : null;
    before = win;
    const tags = (f.ev[String(i)] ?? []).map((t) => f.tags[t]!).filter(Boolean);
    const shot = f.sh[i]! >= 0 ? f.shots[f.sh[i]!]! : '';
    const line = f.ln[i]! >= 0 && f.le[i]! >= 0 ? `${f.lines[f.ln[i]!]}, ${f.lens[f.le[i]!]}` : f.ln[i]! >= 0 ? f.lines[f.ln[i]!]! : f.le[i]! >= 0 ? f.lens[f.le[i]!]! : '';
    const row: BallRow = {
      index: i,
      label: ballLabel(b, f.ov[i]!, f.sb[i] ?? null),
      batter: who(f, f.st[i]!), bowler: who(f, f.bo[i]!),
      chip: chipFor(f.rb[i]!, f.wd[i]!, f.nb[i]!, f.by[i]!, f.lb[i]!, f.pe[i]!, wicket),
      wicketText: wicket ? wicketTextOf(inn, f.d[i]!) : '',
      shot, line,
      control: f.ct[i] === 1 ? 'in control' : f.ct[i] === 0 ? 'not in control' : null,
      win, change, score: `${score}/${wickets}`,
      tracked: shot !== '' || line !== '' || f.ct[i]! >= 0,
      tags, tip: [], summary: '',
    };
    const where = hundred ? `Ball ${row.label}` : `Over ${row.label}`;
    const first = resultWords(f.rb[i]!, f.wd[i]!, f.nb[i]!, f.by[i]!, f.lb[i]!, f.pe[i]!, wicket);
    const second = wicket ? row.wicketText || 'Dismissal' : `${row.bowler?.name ?? 'Unknown'} to ${row.batter?.name ?? 'unknown'}`;
    row.tip = [first, second, `${where}, score ${row.score}`];
    row.summary = row.tip.join('. ') + '.';
    rows.push(row);
  }
  return rows;
}

/** One row for each over (or set of five balls in The Hundred): who bowled it, its runs and wickets, the score at its end and how much of it has tracking. */
export function overRows(b: MatchBundle, f: BallFile, rows: BallRow[]): OverRow[] {
  const hundred = b.match.kind === 'hundred';
  const out: OverRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const ov = f.ov[i]!;
    let o = out[out.length - 1];
    if (!o || o.over !== ov) {
      o = { over: ov, title: hundred ? `Balls ${ov * 5 + 1} to ${ov * 5 + 5}` : `Over ${ov + 1}`, bowler: rows[i]!.bowler, runs: 0, wickets: 0, end: '', tracked: 0, balls: 0, first: i, last: i };
      out.push(o);
    }
    o.runs += f.rb[i]! + f.wd[i]! + f.nb[i]! + f.by[i]! + f.lb[i]! + f.pe[i]!;
    o.wickets += f.w[i]!;
    o.end = rows[i]!.score;
    o.tracked += rows[i]!.tracked ? 1 : 0;
    o.balls += 1;
    o.last = i;
  }
  return out;
}

export interface Coverage { tracked: number; balls: number; win: number; winShown: boolean }
/** How many balls have tracking, and whether the win chance column is drawn: only in a match that is not a Test and where at least 90% of the balls have the value (the rule of the win probability tile). */
export function coverage(b: MatchBundle, rows: BallRow[]): Coverage {
  const win = rows.filter((r) => r.win !== null).length;
  return { tracked: rows.filter((r) => r.tracked).length, balls: rows.length, win, winShown: b.match.kind !== 'test' && rows.length > 0 && win / rows.length >= 0.9 };
}

/** "1 over, 2 wickets": the over's line in its heading. */
export const overLine = (o: OverRow): string => `${o.runs} ${o.runs === 1 ? 'run' : 'runs'}${o.wickets ? `, ${o.wickets} ${o.wickets === 1 ? 'wicket' : 'wickets'}` : ''}`;

/** The innings button text: "1st innings" in a Test (every innings chip reads this way, the team is named in the chart), or the team alone in a limited-overs match. */
export const bbInningsLabel = (b: MatchBundle, inn: InningsCard, place: number): string => (b.match.kind === 'test' ? `${ordinal(place)} innings` : inn.team);
