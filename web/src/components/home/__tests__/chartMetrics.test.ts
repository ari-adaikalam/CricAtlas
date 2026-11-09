import { describe, expect, it } from 'vitest';
import { chartMetrics } from '../heroCanvas';

describe('chartMetrics', () => {
  it('leaves the designed chart as it was', () => {
    for (const h of [120, 150, 190, 260]) expect(chartMetrics(h)).toMatchObject({ top: 30, bottom: 34, compact: false });
    expect(chartMetrics(190).rows).toBe(5);
  });
  it('tightens the margins and keeps a plot in a short chart', () => {
    const m = chartMetrics(79);
    expect(m).toMatchObject({ top: 24, bottom: 20, compact: true });
    expect(79 - m.top - m.bottom).toBeGreaterThanOrEqual(30);
  });
  it('keeps the lines of the left axis at least 16 px apart where the plot is tall enough for two, and never fewer than two lines or more than five', () => {
    for (let h = 60; h <= 300; h += 7) {
      const m = chartMetrics(h), plot = h - m.top - m.bottom;
      expect(m.rows).toBeGreaterThanOrEqual(2);
      expect(m.rows).toBeLessThanOrEqual(5);
      if (plot >= 32) expect(plot / m.rows).toBeGreaterThanOrEqual(16);
    }
  });
});
