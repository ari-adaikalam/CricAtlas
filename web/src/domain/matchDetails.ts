import { bowledText, followOn, mainInnings, scoreText, type BatterCard, type BowlerCard, type Dismissal, type FielderRow, type FowEntry, type InningsCard, type MatchBundle, type PhaseRow, type ReviewRow } from './match';
import { dateText } from './dates';

/**
 * The wording and grouping of the Match details parts: the scorecards, bowling figures, extras and phases by phase, fielding, reviews and the match record. Pure functions
 * over the bundle (tools/match_files.py), tested once here. The numbers are the bundle's; nothing is worked out again except rates, shown at a stated precision.
 */

/** Which innings a Test part shows: the first round is the 1st and 2nd innings, the second round the 3rd and 4th. Every other format has one round, both innings. */
export function rounds(b: MatchBundle): InningsCard[][] {
  const inn = mainInnings(b);
  if (b.match.kind !== 'test') return [inn];
  return [inn.slice(0, 2), inn.slice(2, 4)].filter((r) => r.length > 0);
}

const ORD = ['', '1st', '2nd', '3rd', '4th'];
/** The text of each button of a Test's round switch: "1st and 2nd innings", "3rd and 4th innings", or "3rd innings" when the 4th was never batted (Ari, 2026-10-22). */
export function roundLabels(b: MatchBundle): string[] {
  const all = mainInnings(b);
  return rounds(b).map((r) => `${r.map((i) => ORD[all.indexOf(i) + 1] ?? '').join(' and ')} innings`);
}
/** "1st innings", or "3rd innings (f/o)" for a side that followed on, for the heading of a Test round or one side of it. */
export function inningsName(b: MatchBundle, i: InningsCard): string {
  const place = mainInnings(b).indexOf(i) + 1;
  return `${ORD[place] ?? ''} innings${place === 3 && followOn(b) === i.team ? ' (f/o)' : ''}`.trim();
}

const HOW: Record<string, string> = { 'retired hurt': 'retired hurt', 'retired not out': 'retired not out', 'retired out': 'retired out', 'obstructing the field': 'obstructing the field', 'timed out': 'timed out', 'handled the ball': 'handled the ball', 'hit the ball twice': 'hit the ball twice' };

const fielderName = (f: string): string => f.replace(/ \(sub\)$/, ' (sub)');

/** "c Batter B8 b Bowler 7", "b Bowler 8", "lbw b Bowler 9", "run out (Batter B5)", "st Batter B1 b Bowler 11", "c & b Bowler 7", "not out". */
export function howOut(out: Dismissal | null): string {
  if (!out) return 'not out';
  const t = out.type, bowler = out.bowler ?? '', fielders = out.fielders.filter((f): f is string => typeof f === 'string').map(fielderName);
  switch (t) {
    case 'bowled': return `b ${bowler}`;
    case 'lbw': return `lbw b ${bowler}`;
    case 'caught': return fielders.length ? `c ${fielders[0]} b ${bowler}` : `c b ${bowler}`;
    case 'caught and bowled': return `c & b ${bowler}`;
    case 'stumped': return fielders.length ? `st ${fielders[0]} b ${bowler}` : `st b ${bowler}`;
    case 'run out': return fielders.length ? `run out (${fielders.join(' / ')})` : 'run out';
    case 'hit wicket': return `hit wicket b ${bowler}`;
    default: return HOW[t] ?? t;
  }
}

/** The same wording as `howOut`, in pieces: plain text, and the names of the players in it, so a page can make each name a link. */
export function howOutParts(out: Dismissal | null): Array<string | { name: string }> {
  if (!out) return ['not out'];
  const t = out.type, bowler = out.bowler ?? '', fielders = out.fielders.filter((f): f is string => typeof f === 'string').map(fielderName);
  const name = (n: string): { name: string } => ({ name: n });
  switch (t) {
    case 'bowled': return ['b ', name(bowler)];
    case 'lbw': return ['lbw b ', name(bowler)];
    case 'caught': return fielders.length ? ['c ', name(fielders[0]!), ' b ', name(bowler)] : ['c b ', name(bowler)];
    case 'caught and bowled': return ['c & b ', name(bowler)];
    case 'stumped': return fielders.length ? ['st ', name(fielders[0]!), ' b ', name(bowler)] : ['st b ', name(bowler)];
    case 'run out': return fielders.length ? ['run out (', ...fielders.flatMap((f, k) => (k ? [' / ', name(f)] : [name(f)])), ')'] : ['run out'];
    case 'hit wicket': return ['hit wicket b ', name(bowler)];
    default: return [HOW[t] ?? t];
  }
}

/** The id of every player named in the match's scorecards, by name (batters, bowlers, fielders), so a name in a sentence can lead to its player. A "(sub)" is left off the name. */
export function playerIdsByName(b: MatchBundle): Map<string, string> {
  const map = new Map<string, string>();
  for (const i of b.innings) {
    for (const x of i.batters) if (x.id) map.set(x.name, x.id);
    for (const x of i.bowlers) if (x.id) map.set(x.name, x.id);
    for (const x of i.fielding ?? []) if (x.id) map.set(x.name, x.id);
  }
  return map;
}

/** A batter's strike rate to a whole number, or null when no ball was faced. */
export const strikeRate = (runs: number, balls: number): number | null => (balls > 0 ? Math.round((runs / balls) * 100) : null);

/** "b 0, lb 1, w 1, nb 0", with penalty runs added when there were any. */
export function extrasText(i: InningsCard): string {
  const e = i.extras;
  return `b ${e.b}, lb ${e.lb}, w ${e.wd}, nb ${e.nb}${e.pen ? `, pen ${e.pen}` : ''}`;
}
export const extrasTotal = (i: InningsCard): number => i.extras.wd + i.extras.nb + i.extras.b + i.extras.lb + i.extras.pen;

/** The Total row's score: "178 all out", "177/6", "312/6 declared", and for an innings that stopped at the close of a drawn match "205/5 at stumps". */
export function totalText(b: MatchBundle, i: InningsCard): string {
  if (i.declared) return `${i.runs}/${i.wkts} declared`;
  if (i.wkts >= 10) return `${i.runs} all out`;
  const last = mainInnings(b).at(-1) === i;
  return b.match.kind === 'test' && last && b.match.result.outcome === 'draw' ? `${i.runs}/${i.wkts} at stumps` : scoreText(i);
}

/** "19.2 overs", or "98 balls" in The Hundred. */
export const oversWord = (b: MatchBundle, i: InningsCard): string => (b.match.kind === 'hundred' ? `${i.balls} balls` : `${i.overs} overs`);

export interface FigureRow { name: string; id: string | null; balls: string; extra: string; runs: number; wkts: number; econ: string; wd: number; nb: number }

/** Economy: runs per over, or per 5 balls in The Hundred. "-" when no legal ball was bowled. */
export function economy(b: MatchBundle, c: BowlerCard): string {
  const per = b.match.kind === 'hundred' ? 5 : b.match.ballsPerOver || 6;
  return c.balls > 0 ? (c.runs / (c.balls / per)).toFixed(1) : '-';
}

/** The bowling figures of one innings in the order the bowlers first bowled. The second column is maidens, or the dot balls in The Hundred, which has no maidens. */
export function figureRows(b: MatchBundle, i: InningsCard): FigureRow[] {
  const hundred = b.match.kind === 'hundred';
  return i.bowlers.map((c) => ({ name: c.name, id: c.id, balls: bowledText(b, c.balls), extra: String(hundred ? c.dots : c.maidens), runs: c.runs, wkts: c.wkts, econ: economy(b, c), wd: c.wd, nb: c.nb }));
}
export const figureHeaders = (b: MatchBundle): readonly string[] => (b.match.kind === 'hundred' ? ['Bowler', 'B', 'Dots', 'R', 'W', 'Econ (5)', 'Wd', 'NB'] : ['Bowler', 'O', 'M', 'R', 'W', 'Econ', 'Wd', 'NB']);

const PHASE_NAME: Record<string, string> = { powerplay: 'Powerplay', middle: 'Middle', death: 'Death', rest: 'Rest of innings' };
const PHASE_ORDER = ['powerplay', 'middle', 'death', 'rest'];

/** The name of a phase row: Powerplay, Middle, Death, Rest of innings, or for a Test the 20 over block ("Overs 21 to 40"). */
export function phaseName(b: MatchBundle, p: PhaseRow): string {
  if (p.key.startsWith('band')) { const k = Number(p.key.slice(4)); return b.match.kind === 'hundred' ? `Balls ${k * 100 + 1} to ${(k + 1) * 100}` : `Overs ${k * 20 + 1} to ${(k + 1) * 20}`; }
  return PHASE_NAME[p.key] ?? p.key;
}

/** "Overs 1 to 6", or "Balls 1 to 25" in The Hundred (sets of 5 balls), from the first and last over the phase held. */
export function phaseRange(b: MatchBundle, i: InningsCard, p: PhaseRow): string {
  if (b.match.kind === 'hundred') return `Balls ${p.firstOver * 5 + 1} to ${Math.min(i.balls, (p.lastOver + 1) * 5)}`;
  return p.firstOver === p.lastOver ? `Over ${p.firstOver + 1}` : `Overs ${p.firstOver + 1} to ${p.lastOver + 1}`;
}

/** The phases of an innings in the order they were played. */
export function phasesOf(i: InningsCard): PhaseRow[] {
  return [...(i.phases ?? [])].sort((x, y) => x.firstOver - y.firstOver || PHASE_ORDER.indexOf(x.key) - PHASE_ORDER.indexOf(y.key));
}

/** Runs per over, or per 5 balls in The Hundred. "-" with no legal ball. */
export function runRate(b: MatchBundle, p: { runs: number; balls: number }): string {
  const per = b.match.kind === 'hundred' ? 5 : b.match.ballsPerOver || 6;
  return p.balls > 0 ? (p.runs / (p.balls / per)).toFixed(1) : '-';
}
export const dotShare = (p: { dots: number; balls: number }): string => (p.balls > 0 ? `${Math.round((p.dots / p.balls) * 100)}%` : '-');

export interface FieldingTable { team: string; rows: FielderRow[]; total: number }

/** The fielding of the innings given, grouped by the side that was fielding (the side that was not batting). A fielder who appears in two innings is added up. */
export function fieldingTables(b: MatchBundle, innings: InningsCard[]): FieldingTable[] {
  const [a, z] = [b.match.teams[0]!.name, b.match.teams[1]!.name];
  const by = new Map<string, Map<string, FielderRow>>();
  for (const i of innings) {
    const team = i.team === a ? z : a;
    const m = by.get(team) ?? new Map<string, FielderRow>();
    for (const f of i.fielding ?? []) {
      const k = f.id ?? `n:${f.name}`;
      const have = m.get(k);
      m.set(k, have ? { ...have, c: have.c + f.c, st: have.st + f.st, ro: have.ro + f.ro, sub: have.sub && f.sub } : { ...f });
    }
    by.set(team, m);
  }
  return [...by.entries()].map(([team, m]) => {
    const rows = [...m.values()].sort((x, y) => (y.c + y.st + y.ro) - (x.c + x.st + x.ro) || x.name.localeCompare(y.name));
    return { team, rows, total: rows.reduce((s, r) => s + r.c + r.st + r.ro, 0) };
  });
}

export interface ReviewTable { team: string; rows: Array<ReviewRow & { innings: number }>; struck: number; onUmpiresCall: number }

/** The reviews in the innings given, grouped by the side that asked for them. */
export function reviewTables(b: MatchBundle, innings: InningsCard[]): ReviewTable[] {
  const by = new Map<string, ReviewTable>();
  for (const i of innings) for (const r of i.reviews ?? []) {
    const t = by.get(r.team) ?? { team: r.team, rows: [], struck: 0, onUmpiresCall: 0 };
    t.rows.push({ ...r, innings: i.n });
    if (r.decision === 'struck down') t.struck += 1;
    if (r.umpiresCall) t.onUmpiresCall += 1;
    by.set(r.team, t);
  }
  const order = b.match.teams.map((t) => t.name);
  return [...by.values()].sort((x, y) => order.indexOf(x.team) - order.indexOf(y.team));
}
/** "3 reviews, 2 struck down, 1 on umpires call". */
export const reviewSummary = (t: ReviewTable): string => `${t.rows.length} ${t.rows.length === 1 ? 'review' : 'reviews'}, ${t.struck} struck down, ${t.onUmpiresCall} on umpires call`;
export const decisionText = (r: ReviewRow): string => (r.decision === 'struck down' ? 'Struck down' : r.decision === 'upheld' ? 'Upheld' : r.decision.charAt(0).toUpperCase() + r.decision.slice(1));

/** The ball of an event, "4.5", or "Ball 26" in The Hundred (sets of 5, counted from 1). */
export function ballLabel(b: MatchBundle, over: number, ballText: number | null): string {
  if (b.match.kind === 'hundred') { const k = ballText === null ? 0 : Math.round((ballText - Math.floor(ballText)) * 10); return String(over * 5 + k); }
  return ballText === null ? String(over + 1) : ballText.toFixed(1);
}

// ---- Match info ----

const ORDINAL_WORDS = ['', 'First', 'Second', 'Third'];
function ordinalWord(n: number): string {
  if (n >= 1 && n <= 3) return ORDINAL_WORDS[n]!;
  const tens = n % 100, one = n % 10;
  return `${n}${tens >= 11 && tens <= 13 ? 'th' : one === 1 ? 'st' : one === 2 ? 'nd' : one === 3 ? 'rd' : 'th'}`;
}

/** "Third award this season", or "Second award this series" when the match is not in a competition. Empty when the data has no count. */
export function awardText(b: MatchBundle, index = 0): string {
  const a = b.match.potm[index]?.award;
  return a ? `${ordinalWord(a.n)} award ${a.series ? 'this series' : 'this season'}` : '';
}

/** "41 off 28 balls, 4 fours and 2 sixes" and "2 for 30 from 4 overs" for the player of the match, each innings of theirs joined with "and". */
export function potmLines(b: MatchBundle, index = 0): string[] {
  const p = b.match.potm[index];
  if (!p) return [];
  const same = (c: { id: string | null; name: string }): boolean => (p.id ? c.id === p.id : c.name === p.name);
  const lines: string[] = [];
  const bat = mainInnings(b).flatMap((i) => i.batters.filter((c: BatterCard) => same(c) && (c.balls > 0 || c.runs > 0)));
  if (bat.length) {
    const word = (c: BatterCard): string => { const out = c.out !== null && c.out.type !== 'retired hurt' && c.out.type !== 'retired not out'; return `${c.runs}${out ? '' : '*'} off ${c.balls} balls`; };
    const detail = bat.length === 1 ? `, ${bat[0]!.fours} ${bat[0]!.fours === 1 ? 'four' : 'fours'} and ${bat[0]!.sixes} ${bat[0]!.sixes === 1 ? 'six' : 'sixes'}` : '';
    lines.push(`${bat.map(word).join(' and ')}${detail}`);
  }
  const bowl = mainInnings(b).flatMap((i) => i.bowlers.filter((c: BowlerCard) => same(c) && c.balls > 0));
  if (bowl.length) lines.push(bowl.map((c) => `${c.wkts} for ${c.runs} from ${bowledText(b, c.balls)} ${b.match.kind === 'hundred' ? 'balls' : c.balls === b.match.ballsPerOver ? 'over' : 'overs'}`).join(' and '));
  return lines;
}

/** The facts of the Match block: label and value. A fact the data does not have is left out. */
export function matchFacts(b: MatchBundle): Array<[string, string]> {
  const m = b.match;
  const facts: Array<[string, string | null]> = [
    ['Competition', [m.tournament.name, m.stage.name].filter(Boolean).join(', ') || null],
    ['Match', m.number !== null ? String(m.number) : null],
    ['Venue', [m.venue, m.city && m.venue && !m.venue.toLowerCase().includes(m.city.toLowerCase()) ? m.city : null].filter(Boolean).join(', ') || null],
    ['Date', m.endDate && m.endDate !== m.date ? `${dateText(m.date)} to ${dateText(m.endDate)}` : dateText(m.date)],
    ['Toss', m.toss.winner && m.toss.decision ? `${m.toss.winner} won the toss and chose to ${m.toss.decision}` : null],
  ];
  return facts.filter((f): f is [string, string] => f[1] !== null);
}

/** The officials, by role, in the order the mockup lists them. */
export function officialRows(b: MatchBundle): Array<[string, string]> {
  const o = b.match.officials;
  const rows: Array<[string, string[] | undefined]> = [['Umpires', o.umpire], ['TV umpire', o.tv_umpire], ['Match referee', o.match_referee], ['Reserve umpire', o.reserve_umpire]];
  return rows.filter((r): r is [string, string[]] => !!r[1]?.length).map(([k, v]) => [k, v.join(', ')]);
}

/** One line per innings for the Innings card: "178 all out, 19.2 overs", "target 179 from 20 overs, 177/6 in 19.2 overs", with a declaration and penalty runs noted. */
export function inningsCardLines(b: MatchBundle): Array<{ team: string; text: string; extra: string }> {
  return mainInnings(b).map((i) => {
    const target = i.targetRuns !== null ? `target ${i.targetRuns}${i.targetOvers !== null ? ` from ${b.match.kind === 'hundred' ? Math.round(i.targetOvers * 5) : i.targetOvers} ${b.match.kind === 'hundred' ? 'balls' : 'overs'}` : ''}, ` : '';
    const notes = [i.declared ? 'declared' : '', i.penaltyPre || i.penaltyPost ? `${i.penaltyPre + i.penaltyPost} penalty runs` : ''].filter(Boolean).join(', ');
    return { team: i.team, text: `${target}${totalText(b, i)}${b.match.kind === 'test' ? '' : `, ${oversWord(b, i)}`}`, extra: notes };
  });
}

/** The line for what the data holds about declarations, penalty runs and Super Overs when the match had none: "No declaration, no penalty runs, no Super Over". */
export function inningsNote(b: MatchBundle): string {
  const inn = mainInnings(b);
  const parts = [
    inn.some((i) => i.declared) ? '' : 'no declaration',
    inn.some((i) => i.penaltyPre || i.penaltyPost) ? '' : 'no penalty runs',
    b.innings.some((i) => i.super) ? '' : 'no Super Over',
  ].filter(Boolean);
  const text = parts.join(', ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

const REASON: Record<string, string> = { impact_player: 'Impact player', concussion_substitute: 'Concussion substitute', supersub: 'Supersub', covid_replacement: 'Covid replacement' };

/** Who came in for whom and when: "Batter A12 in for Bowler 5, 16th over". Replacements of a role inside the match are listed too, named for what they are. */
export function replacementLines(b: MatchBundle): Array<{ tag: string; /** "as batter (injury)" for a change of role inside the match, empty for a substitute that has a tag of its own. */ detail: string; team: string | null; inId: string | null; inName: string; outId: string | null; outName: string; when: string }> {
  return b.replacements.map((r) => {
    const over = r.over === null || r.over === undefined ? null : r.over + 1;
    const ord = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
    const unit = b.match.kind === 'hundred' ? 'set' : 'over';
    return { detail: r.kind === 'match' ? '' : ` as ${r.role ?? 'player'}${r.reason ? ` (${r.reason})` : ''}`, tag: r.kind === 'match' ? REASON[r.reason] ?? 'Substitute' : `Replaced as ${r.role ?? 'player'}`, team: r.team, inId: r.playerInId, inName: r.playerIn, outId: r.playerOutId, outName: r.playerOut, when: over === null ? '' : `${ord(over)} ${unit}${r.innings && b.match.kind === 'test' ? `, ${ORD[r.innings] ?? ''} innings` : ''}` };
  });
}


// ---- Partnerships and Fall of wickets ----

const ORDINAL_SHORT = ['th', 'st', 'nd', 'rd'];
/** "1st", "2nd", "11th". */
export const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ORDINAL_SHORT[n % 10 > 3 ? 0 : n % 10]}`;

export interface StandRow {
  label: string;
  a: { id: string | null; name: string; runs: number; balls: number };
  b: { id: string | null; name: string; runs: number; balls: number };
  runs: number;
  balls: number;
  /** Runs of the stand that did not come off a bat. */
  extras: number;
  /** The innings ended with this stand unbroken. */
  unbroken: boolean;
  /** A retirement or a replacement ended the stand before a wicket fell, so the next stand carries the same number. */
  split: boolean;
}

/** The stands of an innings in the order they were batted. A batter who did not face a ball has no id in the stand, so it is found from the scorecard. */
export function standRows(i: InningsCard): StandRow[] {
  const stands = i.partnerships ?? [];
  const idOf = (name: string): string | null => i.batters.find((c) => c.name === name)?.id ?? null;
  return stands.map((s, k) => ({
    label: ordinal(s.wkt),
    a: { ...s.a, id: s.a.id ?? idOf(s.a.name) },
    b: { ...s.b, id: s.b.id ?? idOf(s.b.name) },
    runs: s.runs,
    balls: s.balls,
    extras: s.runs - s.a.runs - s.b.runs,
    unbroken: s.wkt === i.wkts + 1 && k === stands.length - 1,
    split: k > 0 && stands[k - 1]!.wkt === s.wkt,
  }));
}

/** The runs of the longest bar: the best single score of any stand across the innings shown, at least 20 so a short match does not stretch a 3 to full width. */
export const standScale = (innings: InningsCard[]): number => Math.max(20, ...innings.flatMap((i) => standRows(i).flatMap((s) => [s.a.runs, s.b.runs])));

/** What a stand's tooltip says: the title, the numbers as rows, and a note for a stand split by a retirement or left unbroken. */
export function standTipParts(s: StandRow): { title: string; rows: Array<{ label: string; value: string }>; note?: string } {
  const notes = [s.split ? 'A batter retired and a new batter came in, so this stand carries the same number' : '', s.unbroken ? 'Not out at the end of the innings' : ''].filter(Boolean);
  return {
    title: `${s.label} wicket`,
    rows: [
      { label: 'Runs', value: String(s.runs) },
      { label: 'Balls', value: String(s.balls) },
      { label: s.a.name, value: `${s.a.runs} (${s.a.balls})` },
      { label: s.b.name, value: `${s.b.runs} (${s.b.balls})` },
      ...(s.extras > 0 ? [{ label: 'Extras', value: String(s.extras) }] : []),
    ],
    ...(notes.length ? { note: notes.join('. ') } : {}),
  };
}

/** The same as one sentence, for a screen reader: "1st wicket. Runs 45, Balls 30, A 20 (15), B 25 (15)." */
export function standTip(s: StandRow): string {
  const p = standTipParts(s);
  return `${p.title}. ${p.rows.map((r) => `${r.label} ${r.value}`).join(', ')}.${p.note ? ` ${p.note}.` : ''}`;
}

/** What the batter was doing when out, from the shot label (the tracked wording, empty when there is none) and a run out when no shot was played. */
export function dismissalShot(e: FowEntry): string {
  if (e.shot) return `out playing a ${e.shot}`;
  return e.type === 'run out' ? 'run out' : '';
}

export interface FowRow { n: number; runs: number; id: string | null; name: string; score: string; when: string; shot: string; retired: boolean; label: string }
/** The wickets of an innings with the retirements among them, in the order they happened. A retirement is numbered as the wicket that would fall next and marked with a star, as scorecards write "3-338*". */
export function fowRows(b: MatchBundle, i: InningsCard): FowRow[] {
  const entry = (e: FowEntry, retired: boolean): FowRow & { delivery: number } => ({
    n: e.n, runs: e.runs, id: e.id, name: e.name,
    score: `${e.batRuns} off ${e.batBalls}`,
    when: `${b.match.kind === 'hundred' ? 'ball' : 'over'} ${ballLabel(b, e.over, e.ballText)}`,
    shot: retired ? e.type : dismissalShot(e),
    retired, label: `${e.runs}-${e.n}${retired ? '*' : ''}`, delivery: e.delivery,
  });
  return [...(i.fow ?? []).map((e) => entry(e, false)), ...(i.retired ?? []).map((e) => entry(e, true))].sort((x, y) => x.delivery - y.delivery);
}

/** The right end of the runs axis: the highest score of the innings shown, rounded up to a step the axis ticks fall on. */
export function fowAxis(innings: InningsCard[]): { max: number; step: number } {
  const top = Math.max(10, ...innings.map((i) => i.runs));
  const step = top <= 60 ? 10 : top <= 180 ? 20 : top <= 360 ? 50 : 100;
  return { max: Math.ceil(top / step) * step, step };
}
