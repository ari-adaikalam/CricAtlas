import { describe, expect, it } from 'vitest';
import type { BatterCard, InningsCard, MatchBundle } from '../match';
import { ballRows, chipFor, resultWords, coverage, overLine, overRows, type BallFile } from '../ballByBall';

const file = (over: Partial<BallFile> = {}): BallFile => ({
  v: 1,
  d: [1, 2, 3, 4, 5, 6, 7],
  ov: [0, 0, 0, 0, 0, 0, 1],
  sb: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 1.1],
  lg: [1, 1, 1, 1, 1, 1, 1],
  st: [0, 0, 1, 1, 1, 1, 0], bo: [2, 2, 2, 2, 2, 2, 3],
  rb: [0, 4, 0, 0, 0, 1, 6], wd: [0, 0, 1, 0, 0, 0, 0], nb: [0, 0, 0, 0, 0, 0, 0], by: [0, 0, 0, 0, 0, 0, 0], lb: [0, 0, 0, 0, 0, 0, 0], pe: [0, 0, 0, 0, 0, 0, 0],
  w: [0, 0, 0, 0, 1, 0, 0],
  sh: [0, 1, -1, -1, 0, 1, 1], ln: [0, 0, -1, -1, 1, 0, 0], le: [0, 1, -1, -1, 0, 0, 1], ct: [1, 0, -1, -1, 1, 1, 1],
  wp: [50, 52, 52, 51, 60, 61, 70],
  ev: { '1': [0] },
  pl: [['Bat A', 'a'], ['Bat B', 'b'], ['Bowl X', 'x'], ['Bowl Y', 'y']],
  shots: ['defended', 'cover drive'], lines: ['on the stumps', 'outside offstump'], lens: ['good length', 'full'], tags: ['Dropped catch'],
  ...over,
});
const bat = (name: string, out: BatterCard['out']): BatterCard => ({ id: null, name, runs: 0, balls: 0, fours: 0, sixes: 0, out });
const innings = (batters: BatterCard[]): InningsCard => ({ n: 1, team: 'A', teamId: 'a', runs: 12, wkts: 1, balls: 6, deliveries: 7, overs: '1.0', super: false, declared: false, extras: { wd: 1, nb: 0, b: 0, lb: 0, pen: 0 }, targetRuns: null, targetOvers: null, penaltyPre: 0, penaltyPost: 0, batters, bowlers: [], didNotBat: [] });
const match = (kind = 't20'): MatchBundle => ({ match: { kind } } as unknown as MatchBundle);

describe('result chips', () => {
  it('writes runs, a dot, a wicket and each extra', () => {
    expect(chipFor(0, 0, 0, 0, 0, 0, false)).toEqual({ text: '•', kind: 'dot' });
    expect(chipFor(4, 0, 0, 0, 0, 0, false)).toEqual({ text: '4', kind: 'four' });
    expect(chipFor(6, 0, 0, 0, 0, 0, false).kind).toBe('six');
    expect(chipFor(3, 0, 0, 0, 0, 0, false).kind).toBe('runs');
    expect(chipFor(0, 0, 0, 0, 0, 0, true)).toEqual({ text: 'W', kind: 'wicket' });
    expect(chipFor(0, 1, 0, 0, 0, 0, false).text).toBe('Wd');
    expect(chipFor(0, 5, 0, 0, 0, 0, false).text).toBe('5 Wd');
    expect(chipFor(0, 0, 1, 0, 0, 0, false).text).toBe('Nb');
    expect(chipFor(4, 0, 1, 0, 0, 0, false).text).toBe('4 Nb');
    expect(chipFor(0, 0, 0, 2, 0, 0, false).text).toBe('2 B');
    expect(chipFor(0, 0, 0, 0, 1, 0, false).text).toBe('1 LB');
    expect(chipFor(0, 0, 0, 0, 0, 5, false).text).toBe('5 Pen');
  });
});

describe('ball rows', () => {
  const b = match();
  const inn = innings([bat('Bat B', { type: 'caught', bowler: 'Bowl X', bowlerId: 'x', fielders: ['Fld Z'], delivery: 5, wicketNumber: 1, over: 0, ball: 5, ballText: '0.5' })]);
  const rows = ballRows(b, inn, file());
  it('keeps the running score and wickets', () => {
    expect(rows.map((r) => r.score)).toEqual(['0/0', '4/0', '5/0', '5/0', '5/1', '6/1', '12/1']);
  });
  it('names the batter, bowler, shot, line and control, and leaves tracking blank where there is none', () => {
    expect(rows[1]).toMatchObject({ label: '0.2', batter: { name: 'Bat A' }, bowler: { name: 'Bowl X' }, shot: 'cover drive', line: 'on the stumps, full', control: 'not in control', tracked: true, tags: ['Dropped catch'] });
    expect(rows[2]).toMatchObject({ shot: '', line: '', control: null, tracked: false });
  });
  it('writes the dismissal as the scorecard does and the change in win chance', () => {
    expect(rows[4]!.wicketText).toBe('c Fld Z b Bowl X');
    expect(rows[0]!.change).toBeNull();
    expect(rows[1]!.change).toBe(2);
    expect(rows[3]!.change).toBe(-1);
  });
  it('has no change across a ball without a value', () => {
    const r = ballRows(b, inn, file({ wp: [50, -1, 52, 51, 60, 61, 70] }));
    expect(r[1]!.win).toBeNull();
    expect(r[1]!.change).toBeNull();
    expect(r[2]!.change).toBeNull();
  });
});

describe('over rows and coverage', () => {
  const b = match();
  const inn = innings([]);
  const f = file();
  const rows = ballRows(b, inn, f);
  it('groups balls into overs with runs, wickets, the end score and tracked balls', () => {
    const o = overRows(b, f, rows);
    expect(o.map((x) => [x.title, x.runs, x.wickets, x.end, x.balls, x.tracked])).toEqual([['Over 1', 6, 1, '6/1', 6, 4], ['Over 2', 6, 0, '12/1', 1, 1]]);
    expect(o[0]!.bowler?.name).toBe('Bowl X');
    expect(overLine(o[0]!)).toBe('6 runs, 1 wicket');
  });
  it('titles a set of five balls in The Hundred', () => {
    const h = match('hundred');
    expect(overRows(h, f, ballRows(h, inn, f))[1]!.title).toBe('Balls 6 to 10');
  });
  it('draws win chance only at 90% coverage and never in a Test', () => {
    expect(coverage(b, rows)).toMatchObject({ tracked: 5, balls: 7, win: 7, winShown: true });
    const sparse = ballRows(b, inn, file({ wp: [50, -1, -1, -1, 60, 61, 70] }));
    expect(coverage(b, sparse).winShown).toBe(false);
    expect(coverage(match('test'), rows).winShown).toBe(false);
  });
});

describe('the chip tooltip', () => {
  it('says what the ball was in words', () => {
    expect([[0, 0, 0, 0, 0, 0, false], [1, 0, 0, 0, 0, 0, false], [4, 0, 0, 0, 0, 0, false], [6, 0, 0, 0, 0, 0, false], [0, 1, 0, 0, 0, 0, false], [0, 5, 0, 0, 0, 0, false], [4, 0, 1, 0, 0, 0, false], [0, 0, 0, 2, 0, 0, false], [0, 0, 0, 0, 1, 0, false], [0, 0, 0, 0, 0, 5, false], [0, 0, 0, 0, 0, 0, true]]
      .map((a) => resultWords(...(a as [number, number, number, number, number, number, boolean])))).toEqual(['Dot ball', '1 run', 'Four', 'Six', 'Wide', 'Wide, 5 runs', 'No ball, 4 off the bat', '2 byes', '1 leg bye', '5 penalty runs', 'Wicket']);
  });
  it('gives the dismissal as the scorecard words it, without the batter, and the place and score', () => {
    const inn = innings([bat('Bat B', { type: 'caught', bowler: 'Bowl X', bowlerId: 'x', fielders: ['Fld Z'], delivery: 5, wicketNumber: 1, over: 0, ball: 5, ballText: '0.5' })]);
    const r = ballRows(match(), inn, file());
    expect(r[4]!.tip).toEqual(['Wicket', 'c Fld Z b Bowl X', 'Over 0.5, score 5/1']);
    expect(r[1]!.tip).toEqual(['Four', 'Bowl X to Bat A', 'Over 0.2, score 4/0']);
  });
});
