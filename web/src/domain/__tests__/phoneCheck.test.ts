import { describe, expect, it } from 'vitest';
import { fillRatio, isEmptyTile, passesEdge, reportFileName, reportLines, summarise, tapTooSmall } from '../phoneCheck';

describe('phone check rules', () => {
  it('tap targets are 44 px on both sides, with a pixel of rounding', () => {
    expect(tapTooSmall(44, 44)).toBe(false);
    expect(tapTooSmall(43, 44)).toBe(false);
    expect(tapTooSmall(42, 44)).toBe(true);
    expect(tapTooSmall(120, 36)).toBe(true);
  });
  it('a tile is empty when its content fills under half of it, unless it holds rows', () => {
    expect(fillRatio(100, 400, 250)).toBeCloseTo(0.375);
    expect(fillRatio(100, 400, 900)).toBe(1);
    expect(isEmptyTile(0.4, false)).toBe(true);
    expect(isEmptyTile(0.4, true)).toBe(false);
    expect(isEmptyTile(0.5, false)).toBe(false);
  });
  it('a box passes its panel by more than rounding', () => {
    const panel = { left: 0, right: 300, top: 0, bottom: 200 };
    expect(passesEdge({ left: 0, right: 301, top: 0, bottom: 200 }, panel)).toBe(false);
    expect(passesEdge({ left: 0, right: 303, top: 0, bottom: 200 }, panel)).toBe(true);
    expect(passesEdge({ left: -4, right: 100, top: 0, bottom: 100 }, panel)).toBe(true);
  });
  it('sums a walk up and names the report file safely', () => {
    const r = summarise('/players/ba607b88', [440, 956], 3, 'ua', [
      { name: 'open', issues: [{ kind: 'tap', where: 'button "x"', detail: '20x20px' }] },
      { name: 'Records', issues: [] },
    ], '2026-10-25T20:15:30.000Z');
    expect(r.pass).toBe(false);
    expect(r.counts.tap).toBe(1);
    expect(reportLines(r)[0]).toMatch(/^FAIL/);
    expect(summarise('/x', [1, 1], 1, '', [{ name: 'a', issues: [] }]).pass).toBe(true);
    // The same small button at three tile stops is one problem.
    const tap = { kind: 'tap' as const, where: 'button "Go"', detail: '20x20px' };
    expect(summarise('/x', [1, 1], 1, '', [{ name: 'a', issues: [tap] }, { name: 'b', issues: [tap] }, { name: 'c', issues: [tap] }]).counts.tap).toBe(1);
    expect(reportFileName('/players/ba607b88?x=../..', r.at)).toBe('20261025201530-players-ba607b88-x.json');
  });
});
