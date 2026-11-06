import { describe, expect, it } from 'vitest';
import { phaseColumns, runSources, type PhaseCounts } from '../phases';

const row = (key: string, balls: number, runs: number, over: Partial<PhaseCounts> = {}): PhaseCounts => ({ key, balls, runs, dots: Math.round(balls / 2), boundaries: Math.round(balls / 10), dismissals: 2, ones: 0, twos: 0, threes: 0, fours: 0, sixes: 0, ...over });

describe('phase columns', () => {
  const rows = [row('death', 100, 180), row('powerplay', 200, 240), row('middle', 300, 300)];
  const cols = phaseColumns(rows, 't20');
  it('are in phase order with the usual overs', () => {
    expect(cols.map((c) => c.name)).toEqual(['Powerplay', 'Middle overs', 'Death overs']);
    expect(cols.map((c) => c.overs)).toEqual(['Overs 1 to 6', 'Overs 7 to 15', 'Overs 16 to 20']);
  });
  it('work the strike rate out from runs and balls, and compare it with the whole slice', () => {
    expect(cols.map((c) => Math.round(c.strikeRate ?? 0))).toEqual([120, 100, 180]);
    // the whole slice: 720 runs from 600 balls is 120
    expect(cols.map((c) => c.difference)).toEqual([0, -20, 60]);
  });
  it('give average, dot and boundary shares from the counts', () => {
    expect(cols[0]).toMatchObject({ average: 120, dotShare: 50, boundaryShare: 10, balls: 200 });
  });
  it('leave an average empty with no dismissals, and drop a phase with no balls', () => {
    const out = phaseColumns([row('powerplay', 60, 50, { dismissals: 0 }), row('death', 0, 0)], 'odi');
    expect(out).toHaveLength(1);
    expect(out[0]?.average).toBeNull();
    expect(out[0]?.overs).toBe('Overs 1 to 10');
  });
  it('name the overs bands in Tests and the Hundred powerplay in balls', () => {
    expect(phaseColumns([row('band4', 50, 40), row('band0', 50, 30)], 'test').map((c) => c.name)).toEqual(['Overs 1 to 20', 'Overs 81 or more']);
    expect(phaseColumns([row('powerplay', 25, 30), row('rest', 75, 90)], 't20', true).map((c) => c.overs)).toEqual(['Balls 1 to 25', 'Balls 26 to 100']);
  });
});

describe('run sources', () => {
  const rows = [
    row('powerplay', 100, 0, { ones: 20, twos: 5, threes: 1, fours: 10, sixes: 2 }),
    row('death', 50, 0, { ones: 10, twos: 3, threes: 0, fours: 5, sixes: 5 }),
  ];
  it('start with Overall and add a row for each phase with runs, in phase order', () => {
    const out = runSources(rows, 't20');
    expect(out.map((r) => r.name)).toEqual(['Overall', 'Powerplay', 'Death overs']);
  });
  it('split runs, not balls: a six is worth six', () => {
    const pp = runSources(rows, 't20')[1]!;
    // 20 + 10 + 3 + 40 + 12 = 85 runs
    expect(pp.runs).toBe(85);
    expect(pp.segments.map((s) => s.runs)).toEqual([20, 10, 3, 40, 12]);
    expect(pp.segments[3]?.share).toBeCloseTo(40 / 85);
    expect(pp.segments.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1);
  });
  it('sums the phases for Overall', () => {
    const all = runSources(rows, 't20')[0]!;
    expect(all.segments.map((s) => s.balls)).toEqual([30, 8, 1, 15, 7]);
  });
  it('has no rows when no runs were scored', () => expect(runSources([row('powerplay', 20, 0)], 'odi')).toEqual([]));
});
