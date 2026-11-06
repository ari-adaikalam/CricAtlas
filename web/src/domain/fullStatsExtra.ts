// Full stats: the tables that are not the standard columns of the career table. Each is built from counts, with a title, a head and rows; a column that adds up has a total.

import type { StatBat } from './fullStats';
import { ringBands } from './ring';
import type { Shot } from './shots';
import { boundaryFraction, insideRing, zoneName, zoneOf, type Hand } from './wagon';
import { summariseReviews, type ReviewGroup } from './reviews';

export interface CustomTable {
  title: string;
  head: string[];
  /** The first cell is the row's name, the rest numbers or text. */
  rows: Array<Array<string | number>>;
  /** For each column after the name, true when the column is a count that adds up (a Total row is shown for it). */
  sum?: boolean[];
}

const pct = (part: number, whole: number): string => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : '-');
const fixed = (n: number, d: number): string => n.toFixed(d);

/** The name of a format for tables that group by it: Tests, ODIs, T20Is and the T20 leagues. */
export function formatName(format: string, type: string): string {
  if (format === 'TEST') return 'Tests';
  if (format === 'ODI') return 'ODIs';
  if (format === 'T20') return type === 'Intl' ? 'T20Is' : 'T20 leagues';
  return format;
}
const FORMAT_ORDER = ['Tests', 'ODIs', 'T20Is', 'T20 leagues'];
const orderOfFormat = (name: string): number => { const i = FORMAT_ORDER.indexOf(name); return i < 0 ? 9 : i; };

// ---- Dismissed for: how many runs and balls the batter had when out ----
const SCORE_BANDS_LIMITED: ReadonlyArray<readonly [string, number, number]> = [['0 (duck)', 0, 0], ['1 to 9', 1, 9], ['10 to 19', 10, 19], ['20 to 29', 20, 29], ['30 to 39', 30, 39], ['40 to 49', 40, 49], ['50 to 99', 50, 99], ['100 or more', 100, Infinity]];
const SCORE_BANDS_TEST: ReadonlyArray<readonly [string, number, number]> = [['0 (duck)', 0, 0], ['1 to 9', 1, 9], ['10 to 19', 10, 19], ['20 to 29', 20, 29], ['30 to 49', 30, 49], ['50 to 99', 50, 99], ['100 to 199', 100, 199], ['200 or more', 200, Infinity]];
const BALL_BANDS_LIMITED: ReadonlyArray<readonly [string, number, number]> = [['0 to 5', 0, 5], ['6 to 11', 6, 11], ['12 to 23', 12, 23], ['24 to 35', 24, 35], ['36 to 59', 36, 59], ['60 or more', 60, Infinity]];
const BALL_BANDS_TEST: ReadonlyArray<readonly [string, number, number]> = [['0 to 19', 0, 19], ['20 to 39', 20, 39], ['40 to 79', 40, 79], ['80 to 119', 80, 119], ['120 to 199', 120, 199], ['200 or more', 200, Infinity]];

function bandTable(title: string, head: string, bands: ReadonlyArray<readonly [string, number, number]>, values: readonly number[]): CustomTable {
  const total = values.length;
  return { title, head: [head, 'Times', 'Share'], rows: bands.map(([label, lo, hi]) => { const n = values.filter((v) => v >= lo && v <= hi).length; return [label, n, pct(n, total)]; }), sum: [true, false] };
}

/** The scores and the balls faced when the batter was dismissed. Bands for Tests are wider, and are used only when every innings was a Test. */
export function dismissedFor(rows: readonly StatBat[]): CustomTable[] {
  const out = rows.filter((r) => r.is_out);
  const tests = out.length > 0 && out.every((r) => r.format === 'TEST');
  return [
    bandTable('Score when dismissed', 'Score', tests ? SCORE_BANDS_TEST : SCORE_BANDS_LIMITED, out.map((r) => r.runs)),
    bandTable('Balls faced when dismissed', 'Balls', tests ? BALL_BANDS_TEST : BALL_BANDS_LIMITED, out.map((r) => r.balls)),
  ];
}

// ---- Awards: Player of the match ----
export interface PlayedRow { match_id: number; format: string; type: string; date: string; opponent: string; potm: boolean }

export function awardTables(played: readonly PlayedRow[]): CustomTable[] {
  const byFormat = new Map<string, { mat: number; awards: number }>();
  for (const m of played) {
    const name = formatName(m.format, m.type);
    const v = byFormat.get(name) ?? { mat: 0, awards: 0 };
    v.mat += 1; if (m.potm) v.awards += 1;
    byFormat.set(name, v);
  }
  const formats = [...byFormat.entries()].sort((a, b) => orderOfFormat(a[0]) - orderOfFormat(b[0]));
  const won = played.filter((m) => m.potm);
  const countBy = (key: (m: PlayedRow) => string): Array<[string, number]> => {
    const map = new Map<string, number>();
    for (const m of won) map.set(key(m), (map.get(key(m)) ?? 0) + 1);
    return [...map.entries()];
  };
  const years = countBy((m) => m.date.slice(0, 4)).sort((a, b) => Number(b[0]) - Number(a[0]));
  const opponents = countBy((m) => m.opponent).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  return [
    { title: 'Player of the match awards by format', head: ['Format', 'Awards', 'Mat', 'Award rate'], rows: formats.map(([f, v]) => [f, v.awards, v.mat, pct(v.awards, v.mat)]), sum: [true, true, false] },
    { title: 'By year', head: ['Year', 'Awards'], rows: years.map(([y, n]) => [y, n]), sum: [true] },
    { title: 'By opposition', head: ['Opponent', 'Awards'], rows: opponents.map(([o, n]) => [o, n]), sum: [true] },
  ];
}

// ---- Fielding ----
export interface FieldingCount { /** The calendar year, for the by-year chart. */ year?: number; format: string; type: string; kind: 'catch' | 'caught_and_bowled' | 'stumping' | 'run_out_direct' | 'run_out_shared'; n: number }

export function fieldingTables(credits: readonly FieldingCount[], played: readonly PlayedRow[]): CustomTable[] {
  const mat = new Map<string, Set<number>>();
  for (const m of played) { const k = formatName(m.format, m.type); (mat.get(k) ?? mat.set(k, new Set()).get(k)!).add(m.match_id); }
  const by = new Map<string, { catches: number; stumpings: number; runOuts: number }>();
  for (const c of credits) {
    const k = formatName(c.format, c.type);
    const v = by.get(k) ?? { catches: 0, stumpings: 0, runOuts: 0 };
    if (c.kind === 'catch' || c.kind === 'caught_and_bowled') v.catches += c.n; else if (c.kind === 'stumping') v.stumpings += c.n; else v.runOuts += c.n;
    by.set(k, v);
  }
  const formats = [...new Set([...mat.keys(), ...by.keys()])].sort((a, b) => orderOfFormat(a) - orderOfFormat(b));
  const kind = (k: FieldingCount['kind']): number => credits.filter((c) => c.kind === k).reduce((s, c) => s + c.n, 0);
  const all = kind('catch') + kind('caught_and_bowled') + kind('stumping') + kind('run_out_direct') + kind('run_out_shared');
  return [
    {
      title: 'Catches, stumpings and run outs by format', head: ['Format', 'Mat', 'Catches', 'Stumpings', 'Run outs', 'Total', 'Per match'],
      rows: formats.map((f) => {
        const v = by.get(f) ?? { catches: 0, stumpings: 0, runOuts: 0 }, m = mat.get(f)?.size ?? 0, t = v.catches + v.stumpings + v.runOuts;
        return [f, m, v.catches, v.stumpings, v.runOuts, t, m > 0 ? fixed(t / m, 2) : '-'];
      }),
      sum: [false, true, true, true, true, false],
    },
    {
      title: 'By how the dismissal came', head: ['Type', 'Count', 'Share'],
      rows: ([['Caught in the field', kind('catch')], ['Caught and bowled', kind('caught_and_bowled')], ['Stumped', kind('stumping')], ['Run outs, direct hit', kind('run_out_direct')], ['Run outs, shared', kind('run_out_shared')]] as Array<[string, number]>).map(([l, n]) => [l, n, pct(n, all)]),
      sum: [true, false],
    },
  ];
}

// ---- Shot placement: where a batter's tracked balls went, by zone and by distance ----
/** `balls` are the tracked balls with a position (dot balls included). A batter's zones are named for their hand, so a left-hander's are mirrored. */
export function placementTables(balls: readonly Shot[], hand: Hand): CustomTable[] {
  const zones = new Map<number, { balls: number; runs: number; inRing: number; distance: number }>();
  for (const b of balls) {
    const z = zoneOf(b.x, b.y);
    const v = zones.get(z) ?? { balls: 0, runs: 0, inRing: 0, distance: 0 };
    v.balls += 1; v.runs += b.runs; if (insideRing(b.x, b.y)) v.inRing += 1; v.distance += boundaryFraction(b.x, b.y);
    zones.set(z, v);
  }
  const rate = (runs: number, n: number): string => (n > 0 ? String(Math.round((100 * runs) / n)) : '-');
  const byZone = [...zones.entries()].sort((a, b) => a[0] - b[0]).map(([z, v]) => [zoneName(z, hand), v.balls, v.runs, rate(v.runs, v.balls), pct(v.inRing, v.balls), fixed(v.distance / v.balls, 2)]);
  const { bands } = ringBands(balls as Shot[]);
  return [
    { title: 'By zone', head: ['Zone', 'Balls', 'Runs', 'SR', 'Inside the ring', 'Average distance'], rows: byZone, sum: [true, true, false, false, false] },
    { title: 'By distance', head: ['Distance', 'Balls', 'Runs', 'SR'], rows: bands.map((b) => [b.label, b.balls, b.runs, b.strikeRate === null ? '-' : String(Math.round(b.strikeRate))]), sum: [true, true, false] },
  ];
}

// ---- Super Overs ----
export interface SuperBatCount { format: string; type: string; innings: number; balls: number; runs: number; outs: number; boundaries: number }
export interface SuperBowlCount { format: string; type: string; innings: number; balls: number; runs: number; wickets: number }

export function superOverTables(bat: readonly SuperBatCount[], bowl: readonly SuperBowlCount[], kind: 'bat' | 'bowl'): CustomTable[] {
  if (kind === 'bat') {
    const rows = [...bat].sort((a, b) => orderOfFormat(formatName(a.format, a.type)) - orderOfFormat(formatName(b.format, b.type)));
    return [{ title: 'Super Overs, batting', head: ['Format', 'Super Overs', 'Balls', 'Runs', 'SR', 'Out', 'Boundaries'],
      rows: rows.map((r) => [formatName(r.format, r.type), r.innings, r.balls, r.runs, r.balls > 0 ? String(Math.round((100 * r.runs) / r.balls)) : '-', r.outs, r.boundaries]), sum: [true, true, true, false, true, true] }];
  }
  const rows = [...bowl].sort((a, b) => orderOfFormat(formatName(a.format, a.type)) - orderOfFormat(formatName(b.format, b.type)));
  return [{ title: 'Super Overs, bowling', head: ['Format', 'Super Overs', 'Balls', 'Runs conceded', 'Wickets'],
    rows: rows.map((r) => [formatName(r.format, r.type), r.innings, r.balls, r.runs, r.wickets]), sum: [true, true, true, true] }];
}

// ---- Reviews that involved the player ----
export function reviewTables(all: ReadonlyArray<{ format: string; type: string; groups: ReviewGroup[] }>, kind: 'bat' | 'bowl'): CustomTable[] {
  const groups = all.flatMap((f) => f.groups);
  const summary = summariseReviews(groups);
  const label = (side: 'bowling' | 'batting'): string => (kind === 'bat' ? (side === 'bowling' ? 'Asked by the bowling side' : 'Asked by the batter\'s side') : (side === 'bowling' ? 'Asked by the bowler\'s side' : 'Asked by the batting side'));
  const rows = summary.rows.map((r) => [label(r.side), r.total, r.struckDown + r.umpiresCall, r.upheld, r.umpiresCall]);
  const byFormat = [...all].sort((a, b) => orderOfFormat(formatName(a.format, a.type)) - orderOfFormat(formatName(b.format, b.type))).map((f) => {
    const s = summariseReviews(f.groups);
    const total = s.rows[0].total + s.rows[1].total, struck = s.rows[0].struckDown + s.rows[0].umpiresCall + s.rows[1].struckDown + s.rows[1].umpiresCall;
    return [formatName(f.format, f.type), total, struck, s.rows[0].upheld + s.rows[1].upheld];
  });
  return [
    { title: kind === 'bat' ? 'Reviews on the balls the batter faced' : 'Reviews on the bowler\'s deliveries', head: ['Who asked', 'Reviews', 'Struck down', 'Upheld', 'Umpire\'s call'], rows, sum: [true, true, true, true] },
    { title: 'By format', head: ['Format', 'Reviews', 'Struck down', 'Upheld'], rows: byFormat, sum: [true, true, true] },
  ];
}


// ---- The four cards above the tables of a custom option (as in the mockup): the most, the fewest and the total of the first numeric column, and the most of the next ----
const numberOf = (v: string | number): number | null => { if (typeof v === 'number') return v; const x = Number.parseFloat(String(v).replace(/,|%|\*/g, '')); return Number.isNaN(x) ? null : x; };

export function customCards(table: CustomTable | undefined): Array<{ label: string; name: string; value: string }> {
  if (!table || table.rows.length < 2) return [];
  const column = table.head.findIndex((_, i) => i > 0 && table.rows.every((r) => numberOf(r[i]!) !== null));
  if (column < 0) return [];
  const pick = (i: number, most: boolean): (string | number)[] => table.rows.reduce((a, r) => ((most ? numberOf(r[i]!)! > numberOf(a[i]!)! : numberOf(r[i]!)! < numberOf(a[i]!)!) ? r : a));
  const show = (v: string | number): string => (typeof v === 'number' ? v.toLocaleString('en') : v);
  const total = table.rows.reduce((s, r) => s + numberOf(r[column]!)!, 0);
  const next = table.head.findIndex((_, i) => i > column && table.rows.every((r) => numberOf(r[i]!) !== null));
  const cards = [
    { label: `Most ${table.head[column]}`, name: String(pick(column, true)[0]), value: show(pick(column, true)[column]!) },
    { label: `Fewest ${table.head[column]}`, name: String(pick(column, false)[0]), value: show(pick(column, false)[column]!) },
    { label: `Total ${table.head[column]}`, name: table.title, value: total.toLocaleString('en') },
  ];
  cards.push(next > 0 ? { label: `Most ${table.head[next]}`, name: String(pick(next, true)[0]), value: show(pick(next, true)[next]!) } : { label: 'Rows', name: table.title, value: String(table.rows.length) });
  return cards;
}

// ---- Bars for the charts of the Dismissals and Fielding tiles ----
export interface BarRow { label: string; value: number; /** What is written beside the value, such as a share or a rate. */ note: string }
export interface BarSet { title: string; rows: BarRow[]; /** The word after a number in a tooltip: "times", "awards". */ unit: string }

const toBars = (table: CustomTable, unit: string, valueColumn = 1, noteOf?: (row: Array<string | number>) => string): BarSet => ({
  title: table.title, unit,
  rows: table.rows.map((r) => ({ label: String(r[0]), value: Number(r[valueColumn]) || 0, note: noteOf ? noteOf(r) : String(r[valueColumn + 1] ?? '') })),
});

/** The two charts of Dismissed for: the score and the balls faced when out, each as bars of the times with the share beside it. */
export function dismissedBars(rows: readonly StatBat[]): BarSet[] { return dismissedFor(rows).map((t) => toBars(t, 'times')); }

/** Fielding: the numbers for the cards, then the types of dismissal and the formats as bars. */
export function fieldingCharts(credits: readonly FieldingCount[], played: readonly PlayedRow[]): { cards: Array<{ label: string; name: string; value: string }>; types: BarSet; formats: BarSet; years: BarSet } {
  const [byFormat, byKind] = fieldingTables(credits, played);
  const total = (i: number): number => byFormat!.rows.reduce((s, r) => s + Number(r[i]), 0);
  const mat = total(1);
  const sum = total(5);
  return {
    cards: [
      { label: 'Catches', name: 'Including caught and bowled', value: total(2).toLocaleString('en') },
      { label: 'Stumpings', name: 'Keepers', value: total(3).toLocaleString('en') },
      { label: 'Run outs', name: 'Direct hit or shared', value: total(4).toLocaleString('en') },
      { label: 'Per match', name: `${sum.toLocaleString('en')} in ${mat.toLocaleString('en')} matches`, value: mat > 0 ? (sum / mat).toFixed(2) : '-' },
    ],
    types: toBars(byKind!, 'times'),
    formats: toBars(byFormat!, 'dismissals', 5, (r) => `${r[6]} a match`),
    years: { title: 'By year', unit: 'dismissals', rows: yearsOf(credits) },
  };
}

const yearsOf = (credits: readonly FieldingCount[]): BarRow[] => {
  const map = new Map<number, number>();
  for (const c of credits) if (c.year !== undefined) map.set(c.year, (map.get(c.year) ?? 0) + c.n);
  return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([y, n]) => ({ label: String(y), value: n, note: '' }));
};

/** Awards: bars by format (with the rate), by year and by opposition. */
export function awardCharts(played: readonly PlayedRow[]): BarSet[] {
  const [byFormat, years, opponents] = awardTables(played);
  return [toBars(byFormat!, 'awards', 1, (r) => `${r[3]} of ${r[2]} matches`), toBars(years!, 'awards', 1, () => ''), toBars(opponents!, 'awards', 1, () => '')];
}

/** One bar of the reviews chart: the reviews of a side or of a format, split by how they ended. */
export interface ReviewBar { label: string; struckDown: number; umpiresCall: number; upheld: number }
export function reviewBars(all: ReadonlyArray<{ format: string; type: string; groups: ReviewGroup[] }>, kind: 'bat' | 'bowl'): { sides: ReviewBar[]; formats: ReviewBar[] } {
  const summary = summariseReviews(all.flatMap((f) => f.groups));
  const label = (side: 'bowling' | 'batting'): string => (kind === 'bat' ? (side === 'bowling' ? 'Asked by the bowling side' : 'Asked by the batter\'s side') : (side === 'bowling' ? 'Asked by the bowler\'s side' : 'Asked by the batting side'));
  const sides = summary.rows.map((r) => ({ label: label(r.side), struckDown: r.struckDown, umpiresCall: r.umpiresCall, upheld: r.upheld }));
  const formats = [...all].sort((a, b) => orderOfFormat(formatName(a.format, a.type)) - orderOfFormat(formatName(b.format, b.type))).map((f) => {
    const s = summariseReviews(f.groups);
    return { label: formatName(f.format, f.type), struckDown: s.rows[0].struckDown + s.rows[1].struckDown, umpiresCall: s.rows[0].umpiresCall + s.rows[1].umpiresCall, upheld: s.rows[0].upheld + s.rows[1].upheld };
  });
  return { sides, formats };
}

/** The four cards of the awards view: the total, the rate, the best year and the team the player won most against. */
export function awardCards(played: readonly PlayedRow[]): Array<{ label: string; name: string; value: string }> {
  const won = played.filter((m) => m.potm);
  const top = (key: (m: PlayedRow) => string): [string, number] | null => {
    const map = new Map<string, number>();
    for (const m of won) map.set(key(m), (map.get(key(m)) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0] ?? null;
  };
  const year = top((m) => m.date.slice(0, 4)), opponent = top((m) => m.opponent);
  return [
    { label: 'Awards', name: 'Player of the match', value: won.length.toLocaleString('en') },
    { label: 'Award rate', name: `${won.length.toLocaleString('en')} in ${played.length.toLocaleString('en')} matches`, value: pct(won.length, played.length) },
    { label: 'Best year', name: year ? year[0] : '-', value: year ? String(year[1]) : '-' },
    { label: 'Most against', name: opponent ? opponent[0] : '-', value: opponent ? String(opponent[1]) : '-' },
  ];
}

/** The cards and the ring of the Reviews view: how many reviews, how they ended. */
export function reviewSummary(all: ReadonlyArray<{ groups: ReviewGroup[] }>): { cards: Array<{ label: string; name: string; value: string }>; outcome: Array<{ label: string; value: number }> } {
  const s = summariseReviews(all.flatMap((f) => f.groups));
  const struck = s.rows[0].struckDown + s.rows[1].struckDown, call = s.rows[0].umpiresCall + s.rows[1].umpiresCall, upheld = s.rows[0].upheld + s.rows[1].upheld;
  const total = struck + call + upheld;
  return {
    cards: [
      { label: 'Reviews', name: 'On the player\'s balls', value: total.toLocaleString('en') },
      { label: 'Struck down', name: pct(struck, total), value: struck.toLocaleString('en') },
      { label: 'Umpire\'s call', name: pct(call, total), value: call.toLocaleString('en') },
      { label: 'Upheld', name: pct(upheld, total), value: upheld.toLocaleString('en') },
    ],
    outcome: [{ label: 'Struck down', value: struck }, { label: 'Umpire\'s call', value: call }, { label: 'Upheld', value: upheld }],
  };
}
