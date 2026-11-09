import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCores, coreFor } from '../coreCache';

describe('coreFor', () => {
  beforeEach(() => clearCores());

  it('runs the start once per key and gives later readers their own copy', async () => {
    const start = vi.fn(() => ({ rows: Promise.resolve([3, 1, 2]) }));
    const first = coreFor('a', start);
    const rows1 = (await first.rows) as number[];
    rows1.sort(); // a loader sorting in place
    const second = coreFor('a', start);
    const rows2 = (await second.rows) as number[];
    expect(start).toHaveBeenCalledTimes(1);
    expect(rows2).toEqual([3, 1, 2]);
    rows2.reverse();
    expect(((await coreFor('a', start).rows) as number[])).toEqual([3, 1, 2]);
  });

  it('accepts a plain value as well as a promise', async () => {
    const start = () => ({ plain: 5, later: Promise.resolve(6), none: undefined });
    coreFor('p', start);
    const again = coreFor('p', start);
    expect(await again.plain).toBe(5);
    expect(await again.later).toBe(6);
    expect(await again.none).toBeUndefined();
  });

  it('keeps combinations apart', async () => {
    const start = vi.fn((n: number) => ({ n: Promise.resolve(n) }));
    expect(await coreFor('x', () => start(1)).n).toBe(1);
    expect(await coreFor('y', () => start(2)).n).toBe(2);
    expect(await coreFor('x', () => start(9)).n).toBe(1);
  });

  it('drops a combination that failed, so the next ask tries again', async () => {
    let calls = 0;
    const start = () => ({ rows: calls++ === 0 ? Promise.reject(new Error('no')) : Promise.resolve([1]) });
    await coreFor('f', start).rows.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await coreFor('f', start).rows).toEqual([1]);
  });

  it('keeps only the newest combinations', async () => {
    const start = vi.fn(() => ({ v: Promise.resolve(1) }));
    for (let i = 0; i < 8; i++) await coreFor(`k${i}`, start).v;
    start.mockClear();
    await coreFor('k0', start).v; // pushed out by the newer ones
    expect(start).toHaveBeenCalledTimes(1);
  });
});
