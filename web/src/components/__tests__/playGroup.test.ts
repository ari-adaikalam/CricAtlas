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
  it('plays every map of the pair in the longest draw time', () => {
    const group = new PlayGroup();
    const a = Symbol('a'), b = Symbol('b');
    group.join(a); group.join(b);
    group.state(a, true, true); group.state(b, true, true);
    group.plan(a, 0.7); group.plan(b, 1.3);
    const playA = vi.fn(), playB = vi.fn();
    group.arrive(a, playA); group.arrive(b, playB);
    vi.advanceTimersByTime(100);
    expect(playA).toHaveBeenCalledWith(1.3);
    expect(playB).toHaveBeenCalledWith(1.3);
  });

  it('a Replay asked for by one map plays both, in the longest draw time', () => {
    const group = new PlayGroup();
    const a = Symbol('a'), b = Symbol('b');
    group.join(a); group.join(b);
    group.state(a, true, true); group.state(b, true, true);
    group.plan(a, 1.1); group.plan(b, 0.8);
    const replayA = vi.fn(), replayB = vi.fn();
    group.register(a, replayA); group.register(b, replayB);
    group.replayAll();
    expect(replayA).toHaveBeenCalledWith(1.1);
    expect(replayB).toHaveBeenCalledWith(1.1);
  });

  it('leaves a map with nothing to show out of the shared time', () => {
    const group = new PlayGroup();
    const a = Symbol('a'), b = Symbol('b');
    group.join(a); group.join(b);
    group.state(a, true, true); group.state(b, false, false);
    group.plan(a, 0.9); group.plan(b, 1.6);
    const replayA = vi.fn(), replayB = vi.fn();
    group.register(a, replayA); group.register(b, replayB);
    group.replayAll();
    expect(replayA).toHaveBeenCalledWith(0.9);
    expect(replayB).not.toHaveBeenCalled();
  });
});
