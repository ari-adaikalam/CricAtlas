import { describe, expect, it } from 'vitest';
import { inRing, inShotChoice, sentence, shotOptions, topLabels } from '../shotFilter';
import type { Shot } from '../shots';

const shot = (label: string | null, x = 180, y = 165): Shot => ({ x, y, runs: 1, out: false, shot: label, bowler: null, over: 0, ballInOver: 1 });

describe('the Shot select', () => {
  it('lists the most common labels by balls, then breaks ties alphabetically', () => {
    const counts = [{ shot: 'flick', balls: 50 }, { shot: 'defended', balls: 90 }, { shot: 'cut shot', balls: 50 }];
    expect(topLabels(counts)).toEqual(['defended', 'cut shot', 'flick']);
    expect(topLabels(Array.from({ length: 12 }, (_, i) => ({ shot: `s${i}`, balls: 100 - i })))).toHaveLength(9);
  });
  it('lists All shots, the labels in sentence case, then Other shots, with counts from the chart', () => {
    const shots = [shot('pull'), shot('pull'), shot('cover drive'), shot('slog shot'), shot(null)];
    const o = shotOptions(['defended', 'pull', 'cover drive'], shots);
    expect(o.map((x) => x.label)).toEqual(['All shots', 'Defended', 'Pull', 'Cover drive', 'Other shots']);
    expect(o.map((x) => x.count)).toEqual([5, 0, 2, 1, 1]);
    expect(sentence('on drive')).toBe('On drive');
  });
  it('keeps the shots of a label, or of the rest, and everything for All shots', () => {
    const shots = [shot('pull'), shot('cover drive'), shot('slog shot'), shot(null)];
    const top = ['pull', 'cover drive'];
    expect(inShotChoice(shots, 's:pull', top)).toHaveLength(1);
    expect(inShotChoice(shots, 'other', top).map((s) => s.shot)).toEqual(['slog shot']);
    expect(inShotChoice(shots, '', top)).toHaveLength(4);
  });
  it('filters by where the ball went', () => {
    const near = shot('a', 180, 165), far = shot('b', 5, 5);
    expect(inRing([near, far], 'inside')).toEqual([near]);
    expect(inRing([near, far], 'outside')).toEqual([far]);
    expect(inRing([near, far], 'any')).toHaveLength(2);
  });
});
