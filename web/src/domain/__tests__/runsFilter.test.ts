import { describe, expect, it } from 'vitest';
import { inRuns, isPitchRuns, WAGON_RUNS_DEFAULT, WAGON_RUNS_OPTIONS } from '../runsFilter';
import type { Shot } from '../shots';

const shot = (runs: number, out = false): Shot => ({ x: 1, y: 1, runs, out, shot: null, bowler: null, over: 0, ballInOver: 1 });
const shots = [shot(1), shot(2), shot(3), shot(4), shot(6), shot(0, true), shot(1, true), shot(5)];

describe('Runs filter on the wagon wheel', () => {
  it('opens on fours', () => expect(WAGON_RUNS_DEFAULT).toBe('4'));
  it('keeps the shots of one run value', () => {
    expect(inRuns(shots, '1')).toHaveLength(1);
    expect(inRuns(shots, '4')).toHaveLength(1);
    expect(inRuns(shots, '6')).toHaveLength(1);
  });
  it('groups 1 to 3 and leaves a dismissal to Out only', () => {
    expect(inRuns(shots, '13').map((s) => s.runs)).toEqual([1, 2, 3]);
    expect(inRuns(shots, 'out')).toHaveLength(2);
  });
  it('shows everything for All runs, five included', () => expect(inRuns(shots, 'all')).toHaveLength(8));
  it('has an option for every choice the legend can set', () => {
    expect(WAGON_RUNS_OPTIONS.map((o) => o.value)).toEqual(expect.arrayContaining(['13', '4', '6', 'out']));
    expect(isPitchRuns('dot')).toBe(true);
    expect(isPitchRuns('x')).toBe(false);
  });
});
