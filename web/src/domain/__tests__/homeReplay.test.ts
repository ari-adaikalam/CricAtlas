import { describe, expect, it } from 'vitest';
import type { BallFile } from '../ballByBall';
import type { InningsCard, MatchBundle } from '../match';
import { buildReplay, kickerOf, needText, resultInPanel, oversText, scoreText } from '../homeReplay';

// Six balls: a dot, a single and a four by the hero, a wide, a bye (the partner faces) and a wicket for the team on the last ball.
const n = (...v: number[]) => v;
const file = {
  v: 1, d: n(1, 2, 3, 4, 5, 6), ov: n(0, 0, 0, 0, 0, 0), sb: [0.1, 0.2, 0.3, 0.3, 0.4, 0.5], lg: n(1, 1, 1, 0, 1, 1),
  st: n(0, 0, 0, 0, 1, 0), bo: n(2, 2, 2, 2, 2, 2), rb: n(0, 1, 4, 0, 0, 0), wd: n(0, 0, 0, 1, 0, 0), nb: n(0, 0, 0, 0, 0, 0),
  by: n(0, 0, 0, 0, 2, 0), lb: n(0, 0, 0, 0, 0, 0), pe: n(0, 0, 0, 0, 0, 0), w: n(0, 0, 0, 0, 0, 1),
  sh: n(-1, -1, -1, -1, -1, -1), ln: n(-1, -1, -1, -1, -1, -1), le: n(-1, -1, -1, -1, -1, -1), ct: n(-1, -1, -1, -1, -1, -1), wp: n(-1, -1, -1, -1, -1, -1),
  wx: n(-1, 180, 300, -1, -1, -1), wy: n(-1, 60, 165, -1, -1, -1), ev: {},
  pl: [['A Hero', 'h1'], ['B Partner', 'p1'], ['C Bowler', 'b1']], ph: ['L', '', ''], shots: [], lines: [], lens: [], tags: [],
} as unknown as BallFile;
const card = (out: InningsCard['batters'][number]['out']) => ({ id: 'h1', name: 'A Hero', out }) as InningsCard['batters'][number];
const inn = (out: InningsCard['batters'][number]['out']) => ({ n: 2, team: 'India', targetRuns: 12, batters: [card(out)] }) as unknown as InningsCard;
const bundle = {
  match: {
    id: 7, date: '2011-04-02', ballsPerOver: 6, scheduledOvers: 20, venue: 'Wankhede Stadium', tournament: { name: "Men's Cricket World Cup" }, stage: { name: 'Final' },
    teams: [{ name: 'India' }, { name: 'Sri Lanka' }], result: { winner: 'India', runs: null, wickets: 4, outcome: null, method: null, eliminator: null, byInnings: false },
  }, innings: [],
} as unknown as MatchBundle;

describe('buildReplay', () => {
  it('keeps the innings state after each ball', () => {
    const r = buildReplay(bundle, inn(null), file, 'h1')!;
    expect(r.points.map((p) => p.team)).toEqual([0, 1, 5, 6, 8, 8]);
    expect(r.points.map((p) => p.hero)).toEqual([0, 1, 5, 5, 5, 5]);
    expect(r.points.map((p) => p.legal)).toEqual([1, 2, 3, 3, 4, 5]);
    expect(r.points.map((p) => p.wkts)).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it('does not count a wide, or a ball the partner faced, as a ball faced', () => {
    const r = buildReplay(bundle, inn(null), file, 'h1')!;
    expect(r.points.map((p) => p.faced)).toEqual([1, 2, 3, 3, 3, 4]);
    expect(r.heroBalls).toBe(4);
  });

  it('marks the hero out only on the ball of the hero\'s own dismissal', () => {
    expect(buildReplay(bundle, inn(null), file, 'h1')!.heroOut).toBe(false);
    const out = { type: 'bowled', delivery: 6 } as InningsCard['batters'][number]['out'];
    const r = buildReplay(bundle, inn(out), file, 'h1')!;
    expect(r.points.map((p) => p.out)).toEqual([false, false, false, false, false, true]);
    expect(r.heroOut).toBe(true);
  });

  it('does not treat a retirement as being out', () => {
    const r = buildReplay(bundle, inn({ type: 'retired hurt', delivery: 6 } as InningsCard['batters'][number]['out']), file, 'h1')!;
    expect(r.heroOut).toBe(false);
  });

  it('flags fours and sixes of the hero', () => {
    const r = buildReplay(bundle, inn(null), file, 'h1')!;
    expect(r.points.map((p) => p.boundary)).toEqual([0, 0, 4, 0, 0, 0]);
  });

  it('keeps the balls the hero faced that were placed on the ground, and how many have happened after each ball', () => {
    const r = buildReplay(bundle, inn(null), file, 'h1')!;
    expect(r.shots.map((s) => [s.x, s.y, s.runs])).toEqual([[180, 60, 1], [300, 165, 4]]);
    expect(r.shotCount).toEqual([0, 1, 2, 2, 2, 2]);
  });

  it('reads the facts of the match from the bundle', () => {
    const r = buildReplay(bundle, inn(null), file, 'h1')!;
    expect([r.batting, r.bowling, r.target, r.scheduledOvers, r.hero.hand]).toEqual(['India', 'Sri Lanka', 12, 20, 'L']);
    expect(r.result).toBe('India won by 4 wickets');
    expect(kickerOf(bundle)).toBe("Men's Cricket World Cup, Final, 2 Apr 2011");
  });

  it('has no shots when the innings has no recorded positions', () => {
    const bare = { ...file, wx: undefined, wy: undefined } as BallFile;
    expect(buildReplay(bundle, inn(null), bare, 'h1')!.shots).toEqual([]);
  });

  it('returns null for a batter who is not in the innings', () => {
    expect(buildReplay(bundle, inn(null), file, 'zzz')).toBeNull();
  });
});

describe('replay helpers', () => {
  it('writes overs as whole overs and the balls into the next', () => {
    expect(oversText(82, 6)).toBe('13.4');
    expect(oversText(100, 5)).toBe('20.0');
  });
  it('marks a score that is not out', () => {
    expect(scoreText(82, false)).toBe('82*');
    expect(scoreText(264, true)).toBe('264');
  });
});

describe('needText', () => {
  const r = { target: 12, scheduledOvers: 1, ballsPerOver: 6, points: [{ team: 0, legal: 1 }, { team: 11, legal: 5 }, { team: 12, legal: 6 }] } as unknown as Parameters<typeof needText>[0];
  it('says what a chase needs and from how many balls', () => {
    expect(needText(r, 0)).toBe('Need 12 from 5 balls');
    expect(needText(r, 1)).toBe('Need 1 from 1 ball');
  });
  it('says nothing once the target is met, the balls are gone, or it is not a chase', () => {
    expect(needText(r, 2)).toBeNull();
    expect(needText({ ...r, target: null }, 0)).toBeNull();
  });
});

describe('resultInPanel', () => {
  it("drops the batting side's own name from its win, and keeps any other result whole", () => {
    expect(resultInPanel({ batting: 'India', result: 'India won by 8 wickets, with 39 balls left' })).toBe('Won by 8 wickets, with 39 balls left');
    expect(resultInPanel({ batting: 'India', result: 'Pakistan won by 12 runs' })).toBe('Pakistan won by 12 runs');
    expect(resultInPanel({ batting: 'India', result: 'Match tied' })).toBe('Match tied');
  });
});
