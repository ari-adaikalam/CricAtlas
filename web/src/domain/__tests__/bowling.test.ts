import { describe, expect, it } from 'vitest';
import type { SummaryRow } from '../batting';
import { bowlingTotals, roleKind } from '../bowling';

const row = (over: Partial<SummaryRow>): SummaryRow => ({
  player_id: 'p', format: 'T20', tournament_key: null, tournament_name: null, season: '2024', gender: 'male', matches: 1, innings: null, runs: null, balls_faced: null, fours: null, sixes: null,
  fifties: null, hundreds: null, ducks: null, dismissals: null, high_score: null, bowling_matches: 1, balls_bowled: 24, runs_conceded: 30, wickets: 2, dot_balls: 8, ...over,
});

describe('bowling totals', () => {
  it('adds balls, runs and wickets and computes the average from the totals', () => {
    const t = bowlingTotals([row({}), row({ balls_bowled: 12, runs_conceded: 20, wickets: 3 })]);
    expect(t).toEqual({ balls: 36, runs: 50, wickets: 5, average: 10 });
  });
  it('has no average without wickets', () => {
    expect(bowlingTotals([row({ wickets: 0 })]).average).toBeNull();
    expect(bowlingTotals([]).balls).toBe(0);
  });
});

describe('role', () => {
  it('maps the playing role to a view', () => {
    expect(roleKind('top-order batter')).toBe('bat');
    expect(roleKind('bowler')).toBe('bowl');
    expect(roleKind('bowling allrounder')).toBe('all');
    expect(roleKind('wicketkeeper batter')).toBe('bat');
    expect(roleKind(null)).toBe('bat');
  });
});

import { bestFigures, bowlingRates, oversOf, type BowlingSlice } from '../bowling';

const slice = (over: Partial<BowlingSlice> = {}): BowlingSlice => ({ balls: 240, conceded: 300, wickets: 12, dots: 100, boundaries: 24, extras: 9, innings: 10, perInnings: [{ wickets: 5, runs: 30 }, { wickets: 5, runs: 25 }, { wickets: 0, runs: 10 }, { wickets: 2, runs: 40 }], letOffs: 0, letOffRuns: 0, ...over });

describe('bowling rates', () => {
  it('works rates out from the totals', () => {
    const r = bowlingRates(slice());
    expect(r.average).toBe(25);
    expect(r.economy).toBe(7.5);
    expect(r.ballsPerWicket).toBe(20);
    expect(r.dotShare).toBe(42);
    expect(r.boundaryShare).toBe(10);
  });
  it('uses runs per five-ball over for The Hundred', () => expect(bowlingRates(slice(), 5).economy).toBe(6.25));
  it('leaves rates empty without wickets or balls', () => {
    const r = bowlingRates(slice({ wickets: 0, balls: 0 }));
    expect(r.average).toBeNull();
    expect(r.economy).toBeNull();
    expect(r.ballsPerWicket).toBeNull();
    expect(r.dotShare).toBeNull();
  });
  it('picks the best figures by wickets, then fewest runs, and counts five-wicket hauls', () => {
    const r = bowlingRates(slice());
    expect(r.best).toEqual({ wickets: 5, runs: 25 });
    expect(r.fiveWickets).toBe(2);
    expect(bestFigures([{ wickets: 0, runs: 8 }])).toBeNull();
  });
  it('writes overs in cricket notation', () => {
    expect(oversOf(25)).toBe('4.1');
    expect(oversOf(24)).toBe('4');
    expect(oversOf(0)).toBe('0');
  });
});

import { bowlPhaseColumns } from '../bowling';

describe('bowling phases', () => {
  const rows = [
    { key: 'death', balls: 60, conceded: 100, wickets: 5, dots: 20, boundaries: 12 },
    { key: 'powerplay', balls: 120, conceded: 120, wickets: 3, dots: 60, boundaries: 12 },
    { key: 'middle', balls: 0, conceded: 0, wickets: 0, dots: 0, boundaries: 0 },
  ];
  it('orders the phases, drops empty ones and works out economy and shares', () => {
    const cols = bowlPhaseColumns(rows, 't20');
    expect(cols.map((c) => c.key)).toEqual(['powerplay', 'death']);
    expect(cols[0]).toMatchObject({ name: 'Powerplay', overs: 'Overs 1 to 6', economy: 6, wickets: 3, dotShare: 50, boundaryShare: 10 });
    expect(cols[1]?.economy).toBeCloseTo(10);
  });
  it('compares with the whole slice, negative being better', () => {
    const cols = bowlPhaseColumns(rows, 't20');
    expect(cols[0]?.difference).toBeCloseTo(6 - 7.33, 2);
    expect(cols[1]?.difference).toBeCloseTo(10 - 7.33, 2);
  });
  it('uses five-ball overs in The Hundred', () => {
    expect(bowlPhaseColumns([{ key: 'powerplay', balls: 25, conceded: 30, wickets: 1, dots: 5, boundaries: 4 }], 't20', true)[0]).toMatchObject({ economy: 6, overs: 'Balls 1 to 25' });
  });
  it('uses overs bands in Tests', () => expect(bowlPhaseColumns([{ key: 'band1', balls: 6, conceded: 3, wickets: 0, dots: 4, boundaries: 0 }], 'test')[0]?.name).toBe('Overs 21 to 40'));
});

import { bowlRunSources } from '../bowling';

describe('runs conceded', () => {
  const row = (key: string, c: Partial<Record<'ones' | 'twos' | 'threes' | 'fours' | 'sixes' | 'extras', number>>) => ({ key, balls: 60, conceded: 0, wickets: 0, dots: 0, boundaries: 0, ones: 0, twos: 0, threes: 0, fours: 0, sixes: 0, extras: 0, ...c });
  it('splits the runs by kind with extras as the last segment', () => {
    const out = bowlRunSources([row('powerplay', { ones: 10, fours: 5, sixes: 1, extras: 4 }), row('death', { ones: 10, twos: 5, extras: 0 })], 't20');
    expect(out.map((r) => r.name)).toEqual(['Overall', 'Powerplay', 'Death overs']);
    const pp = out[1]!;
    expect(pp.runs).toBe(10 + 20 + 6 + 4);
    expect(pp.segments.map((s) => s.label)).toEqual(['Singles', 'Twos', 'Threes', 'Fours', 'Sixes', 'Extras']);
    expect(pp.segments[5]).toMatchObject({ runs: 4, share: 4 / 40 });
    expect(out[0]?.runs).toBe(40 + 20);
  });
  it('is empty when nothing was conceded', () => expect(bowlRunSources([row('powerplay', {})], 't20')).toEqual([]));
});

import { lengthByPhase } from '../bowling';

describe('length by phase', () => {
  const colours = { main: '#111111', second: '#222222' };
  const rows = [
    { key: 'death', length: 'yorker', n: 3 }, { key: 'death', length: 'good length', n: 1 },
    { key: 'powerplay', length: 'good length', n: 6 }, { key: 'powerplay', length: 'full', n: 2 },
    { key: 'middle', length: 'unknown', n: 5 },
  ];
  it('gives each phase in order and a whole innings row, with the six lengths in pitch order', () => {
    const out = lengthByPhase(rows, 't20', false, colours);
    expect(out.map((r) => r.name)).toEqual(['Powerplay', 'Death overs', 'Whole innings']);
    expect(out[0]?.segments.map((s) => s.label)).toEqual(['Full toss', 'Yorker', 'Full', 'Good length', 'Short of good', 'Short']);
    expect(out[0]?.segments[3]).toMatchObject({ balls: 6, share: 0.75 });
    expect(out[2]?.runs).toBe(12);
    expect(out[2]?.segments[3]?.share).toBeCloseTo(7 / 12);
  });
  it('uses the team pair for Full and Yorker and is empty with no lengths', () => {
    const out = lengthByPhase(rows, 't20', false, colours);
    expect(out[0]?.segments[2]?.colour).toBe('#111111');
    expect(out[0]?.segments[1]?.colour).toBe('#222222');
    expect(lengthByPhase([], 't20', false, colours)).toEqual([]);
  });
});

import { handRows, orderGroup, orderRows } from '../bowling';

describe('batters splits', () => {
  it('maps a batting position to its part of the order', () => {
    expect([1, 2, 3, 5, 6, 8, 9, 11, 12].map(orderGroup)).toEqual(['open', 'open', 'top', 'top', 'middle', 'middle', 'tail', 'tail', 'tail']);
  });
  it('keeps the order, drops empty rows and works out the rates from the counts', () => {
    const rows = handRows([{ key: 'left', balls: 12, conceded: 18, wickets: 0, dots: 6 }, { key: 'right', balls: 24, conceded: 24, wickets: 2, dots: 12 }, { key: 'unknown', balls: 0, conceded: 0, wickets: 0, dots: 0 }]);
    expect(rows.map((r) => r.name)).toEqual(['Right-handers', 'Left-handers']);
    expect(rows[0]).toMatchObject({ economy: 6, average: 12, dotShare: 50 });
    expect(rows[1]).toMatchObject({ economy: 9, average: null });
  });
  it('names the four parts of the batting order', () => expect(orderRows([{ key: 'tail', balls: 6, conceded: 3, wickets: 1, dots: 3 }]).map((r) => r.name)).toEqual(['Tail (9 to 11)']));
});
