import { describe, expect, it } from 'vitest';
import { shotMixByPhase, shotMixRows, type ShotMixCell } from '../shotMix';

const cell = (shot: string, key: string | null, c: Partial<ShotMixCell>): ShotMixCell => ({ shot, key, balls: 0, runs: 0, outs: 0, controlKnown: 0, inControl: 0, ...c });

describe('shot mix', () => {
  const cells = [
    cell('pull', 'powerplay', { balls: 10, runs: 20, outs: 1, controlKnown: 10, inControl: 6 }),
    cell('pull', 'death', { balls: 10, runs: 30, controlKnown: 10, inControl: 8 }),
    cell('defended', 'middle', { balls: 30, runs: 3, outs: 2 }),
    cell('cut shot', null, { balls: 5, runs: 10 }),
  ];
  it('adds the phases of a shot, most balls first, with the rates from the counts', () => {
    const rows = shotMixRows(cells);
    expect(rows.map((r) => r.label)).toEqual(['Defended', 'Pull', 'Cut shot']);
    expect(rows[1]).toMatchObject({ balls: 20, runs: 50, outs: 1, strikeRate: 250, control: 70 });
    expect(rows[0]?.control).toBeNull();
  });
  it('splits by phase with the columns in innings order and leaves out the no-phase balls', () => {
    const t = shotMixByPhase(cells, 't20');
    expect(t.columns.map((c) => c.key)).toEqual(['powerplay', 'middle', 'death']);
    expect(t.rows[1]?.cells.powerplay).toMatchObject({ balls: 10, runs: 20, outs: 1, strikeRate: 200, control: 60 });
    expect(t.rows[1]?.cells.middle).toMatchObject({ balls: 0, strikeRate: null });
    expect(t.rows[2]?.cells.death?.balls).toBe(0);
  });
});
