import { describe, expect, it } from 'vitest';
import { CHAR_PX, fitLabels } from '../legendFit';

const width = (labels: string[], fixed: number[]): number => labels.reduce((a, l, i) => a + fixed[i]! + l.length * CHAR_PX + 10, 0);

describe('fitLabels', () => {
  it('leaves labels alone when they fit', () => {
    expect(fitLabels(['India', 'Par'], [28, 28], 400)).toEqual(['India', 'Par']);
  });
  it('shortens the longest label first, with an ellipsis, until the row fits', () => {
    const labels = ['Royal Challengers Bengaluru', 'Par', 'Middle half', 'Projected'];
    const fixed = [28, 28, 28, 28];
    const out = fitLabels(labels, fixed, 280);
    expect(width(out, fixed)).toBeLessThanOrEqual(280);
    expect(out[0]!.endsWith('…')).toBe(true);
    expect(out[1]).toBe('Par');
  });
  it('never goes below a few letters, even when nothing can fit', () => {
    const out = fitLabels(['Chennai Super Kings', 'Royal Challengers Bengaluru'], [28, 28], 10);
    expect(out.every((l) => l.length >= 5)).toBe(true);
  });
  it('keeps a label that is already short as it is', () => {
    expect(fitLabels(['Par'], [28], 20)).toEqual(['Par']);
  });
});
