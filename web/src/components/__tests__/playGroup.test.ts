import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayGroup } from '../wagon/playGroup';

describe('PlayGroup', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('starts every waiting map at the same moment once all that have balls are ready', () => {
    const group = new PlayGroup();
    const a = Symbol('a'), b = Symbol('b');
    group.join(a); group.join(b);
    group.state(a, true, true); group.state(b, true, false);
    const playA = vi.fn(), playB = vi.fn();
    group.arrive(a, playA);
    vi.advanceTimersByTime(400);
    expect(playA).not.toHaveBeenCalled();
    group.state(b, true, true); group.arrive(b, playB);
    vi.advanceTimersByTime(100);
    expect(playA).toHaveBeenCalledTimes(1);
    expect(playB).toHaveBeenCalledTimes(1);
  });

  it('does not wait for a map with nothing to show', () => {
    const group = new PlayGroup();
    const a = Symbol('a'), b = Symbol('b');
    group.join(a); group.join(b);
    group.state(a, true, true); group.state(b, false, false);
    const playA = vi.fn();
    group.arrive(a, playA);
    vi.advanceTimersByTime(100);
    expect(playA).toHaveBeenCalledTimes(1);
  });

  it('lets the waiting maps play after the longest wait, so one that never comes up cannot hold the rest', () => {
    const group = new PlayGroup();
    const a = Symbol('a'), b = Symbol('b');
    group.join(a); group.join(b);
    group.state(a, true, true); group.state(b, true, false);
    const playA = vi.fn();
    group.arrive(a, playA);
    vi.advanceTimersByTime(2000);
    expect(playA).toHaveBeenCalledTimes(1);
  });

  it('plays a map that is not in the group at once', () => {
    const group = new PlayGroup();
    const play = vi.fn();
    group.arrive(Symbol('stranger'), play);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
