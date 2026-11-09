import { describe, expect, it } from 'vitest';
import { DEFAULT_BALL_FILTERS } from '../ballFilters';
import { FLAG_NONSTRIKER, FLAG_OUT, FLAG_POSITION, FLAG_WIDE, emptyPointSet, type PointSet } from '../pointFile';
import { bowlShotsOf, controlRowsOf, dismissalMapOf, falseShotInningsOf, locatedOf, pitchOf, selectPoints, shotsOf } from '../pointFilter';

// Four balls: an ODI four in the powerplay (not out), an ODI dot in the middle, a Test six with two wickets down, and a T20 league wide that was a stumping. The same rules are checked
// against the SQL on real players by scripts/verify-points.ts.
function set(): PointSet {
  const s = emptyPointSet();
  const col = <T extends ArrayLike<number>>(ctor: new (a: number[]) => T, values: number[]): T => new ctor(values);
  Object.assign(s, {
    n: 4,
    x: col(Int16Array, [300, 100, 50, 10]), y: col(Int16Array, [90, 200, 40, 20]), runs: col(Uint8Array, [4, 0, 6, 0]), flags: col(Uint8Array, [FLAG_POSITION, FLAG_POSITION, FLAG_POSITION, FLAG_OUT | FLAG_WIDE | FLAG_POSITION]),
    length: col(Uint8Array, [4, 4, 6, 0]), line: col(Uint8Array, [3, 3, 4, 0]), control: col(Uint8Array, [1, 2, 1, 0]), match: col(Int32Array, [7, 7, 8, 8]), date: col(Int32Array, [20200105, 20200105, 20200301, 20200301]), opponent: col(Uint16Array, [0, 0, 1, 1]),
    over: col(Uint16Array, [3, 25, 60, 12]), ball: col(Uint8Array, [1, 2, 3, 4]), innings: col(Uint8Array, [1, 1, 2, 2]), wickets: col(Uint8Array, [0, 4, 2, 7]),
    phase: col(Uint8Array, [1, 2, 0, 3]), result: col(Uint8Array, [1, 2, 3, 0]), superOver: col(Uint8Array, [0, 0, 0, 0]), format: col(Uint8Array, [1, 1, 0, 2]), international: col(Uint8Array, [1, 1, 1, 0]),
    tournament: col(Uint16Array, [65535, 65535, 65535, 0]), season: col(Uint16Array, [0, 0, 1, 1]), bowler: col(Uint16Array, [0, 0, 1, 1]), name: col(Uint16Array, [0, 0, 1, 2]),
    shot: col(Uint8Array, [0, 255, 1, 255]), style: col(Uint8Array, [0, 1, 255, 1]),
    tournaments: ['ipl'], seasons: ['2019', '2020'], bowlers: [['aaaaaaaa', 'right-arm fast'], ['bbbbbbbb', null]], names: ['A Bowler', 'B Bowler', 'B Bowler (2)'], opponents: ['India', 'Australia'], shots: ['drive', 'pull'], styles: ['right-arm fast', 'legbreak'],
  });
  return s;
}
const all = { format: 'INTERNATIONAL' as const, competition: null, season: null };

describe('point filter', () => {
  it('applies the Format choice the way the SQL does', () => {
    const s = set();
    expect(selectPoints(s, { ...all, format: 'ODI' }, DEFAULT_BALL_FILTERS)).toEqual([0, 1]);
    expect(selectPoints(s, { ...all, format: 'TEST' }, DEFAULT_BALL_FILTERS)).toEqual([2]);
    expect(selectPoints(s, { ...all, format: 'T20S' }, DEFAULT_BALL_FILTERS)).toEqual([3]);
    expect(selectPoints(s, { ...all, format: 'T20I' }, DEFAULT_BALL_FILTERS)).toEqual([]);
    expect(selectPoints(s, { ...all, format: 'LEAGUE' }, DEFAULT_BALL_FILTERS)).toEqual([3]);
    expect(selectPoints(s, all, DEFAULT_BALL_FILTERS)).toEqual([0, 1, 2]);
  });
  it('applies Competition and Season, and an unknown one leaves nothing', () => {
    const s = set();
    expect(selectPoints(s, { format: 'LEAGUE', competition: 'ipl', season: null }, DEFAULT_BALL_FILTERS)).toEqual([3]);
    expect(selectPoints(s, { ...all, season: '2020' }, DEFAULT_BALL_FILTERS)).toEqual([2]);
    expect(selectPoints(s, { ...all, season: '1999' }, DEFAULT_BALL_FILTERS)).toEqual([]);
    expect(selectPoints(s, { ...all, competition: 'nope' }, DEFAULT_BALL_FILTERS)).toEqual([]);
  });
  it('applies the ball filters', () => {
    const s = set();
    const odi = { ...all, format: 'ODI' as const };
    expect(selectPoints(s, odi, { ...DEFAULT_BALL_FILTERS, phase: 'powerplay' })).toEqual([0]);
    expect(selectPoints(s, odi, { ...DEFAULT_BALL_FILTERS, wickets: 'mid' })).toEqual([1]);
    expect(selectPoints(s, odi, { ...DEFAULT_BALL_FILTERS, result: 'lost' })).toEqual([1]);
    expect(selectPoints(s, odi, { ...DEFAULT_BALL_FILTERS, type: 'pace' })).toEqual([0]);
    expect(selectPoints(s, odi, { ...DEFAULT_BALL_FILTERS, opponent: 'bbbbbbbb' })).toEqual([]);
    expect(selectPoints(s, { ...all, format: 'TEST' }, { ...DEFAULT_BALL_FILTERS, phase: 'band3' })).toEqual([2]);
    expect(selectPoints(s, { ...all, format: 'TEST' }, { ...DEFAULT_BALL_FILTERS, phase: 'band0' })).toEqual([]);
  });
  it('returns the scoring and out balls as shots, and every ball that was not a wide as located', () => {
    const s = set();
    const picked = [0, 1, 2, 3];
    expect(shotsOf(s, picked).map((x) => [x.runs, x.out, x.shot, x.bowler])).toEqual([[4, false, 'drive', 'A Bowler'], [6, false, 'pull', 'B Bowler'], [0, true, null, 'B Bowler (2)']]);
    expect(locatedOf(s, picked)).toHaveLength(3);
    expect(FLAG_WIDE).toBe(2);
  });
  it('groups control by length and line, leaving out wides and balls with no reading', () => {
    expect(controlRowsOf(set(), [0, 1, 2, 3])).toEqual([{ length: 'good length', line: 'on the stumps', known: 2, inControl: 1 }, { length: 'short', line: 'outside offstump', known: 1, inControl: 1 }]);
  });
  it('gives the false shot innings oldest first, with the date and the opponent', () => {
    expect(falseShotInningsOf(set(), [0, 1, 2, 3])).toEqual([
      { known: 2, falseShots: 1, date: '2020-01-05', opponent: 'India' },
      { known: 1, falseShots: 0, date: '2020-03-01', opponent: 'Australia' },
    ]);
  });
  it('counts dismissals at either end, and groups only the ones with a line and a length', () => {
    const s = set();
    s.flags[0] = FLAG_NONSTRIKER; // the batter at the non-striker's end, on the first ball
    s.flags[3] = FLAG_OUT | FLAG_WIDE;
    expect(dismissalMapOf(s, [0, 1, 2, 3])).toEqual({ rows: [{ length: 'good length', line: 'on the stumps', outs: 1 }], all: 2 });
  });

  it('applies the bowling rules: the batter hand and the batter as opponent, not the bowler type', () => {
    const s = set();
    s.hand = new Uint8Array([1, 2, 1, 0]);
    expect(selectPoints(s, all, { ...DEFAULT_BALL_FILTERS, hand: 'right' }, 'bowl')).toEqual([0, 2]);
    expect(selectPoints(s, all, { ...DEFAULT_BALL_FILTERS, hand: 'left' }, 'bowl')).toEqual([1]);
    expect(selectPoints(s, all, { ...DEFAULT_BALL_FILTERS, type: 'pace' }, 'bowl')).toEqual([0, 1, 2]);
    expect(selectPoints(s, all, { ...DEFAULT_BALL_FILTERS, hand: 'right' })).toEqual([0, 1, 2]);
  });
  it('splits a bowler\'s scoring balls and wickets by hand and counts the untracked ones', () => {
    const s = set();
    s.hand = new Uint8Array([1, 2, 1, 0]);
    s.flags[1] = 0; s.runs[1] = 2; // a scoring ball with no position
    const r = bowlShotsOf(s, [0, 1, 2, 3]);
    expect(r.scoring).toBe(4);
    expect(r.right.map((x) => x.runs)).toEqual([4, 6]);
    expect(r.left).toEqual([]);
  });
  it('groups the pitch map by length and line, a wicket winning over the runs, and counts the legal balls bowled', () => {
    const s = set();
    s.flags[0] = FLAG_OUT | FLAG_POSITION; // a wicket on the four
    const all4 = pitchOf(s, [0, 1, 2, 3], 'all');
    // The fourth ball is a wicket on a delivery that was not legal: a wicket, not a ball bowled.
    expect(all4.bowled).toBe(3);
    expect(all4.tracked).toBe(3);
    expect(all4.rows.find((r) => r.length === 'good length')).toMatchObject({ balls: 2, wickets: 1, dots: 1, fours: 0, runs: 4, inControl: 1, controlKnown: 2 });
    expect(pitchOf(s, [0, 1, 2, 3], 'wicket').bowled).toBe(2);
    expect(pitchOf(s, [0, 1, 2, 3], '4').bowled).toBe(0);
    expect(pitchOf(s, [0, 1, 2, 3], '6').rows).toEqual([expect.objectContaining({ length: 'short', sixes: 1 })]);
  });
});
