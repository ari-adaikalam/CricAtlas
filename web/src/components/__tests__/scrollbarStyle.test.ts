import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Safari and Chrome ignore the always-drawn ::-webkit-scrollbar once an area sets scrollbar-width or scrollbar-color, and then use their overlay bar, which fades when idle
// (Ari, 2026-10-24: the Compare table had no visible bar in Safari). Only `none` (hidden rows) and the Firefox block are allowed.
describe('scroll bar style', () => {
  it('no stylesheet sets a scrollbar width or colour except none', () => {
    const dir = join(__dirname, '../../styles');
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
      readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/scrollbar-(width|color)\s*:\s*([^;}]+)/g)) if (m[1] === 'color' || m[2]!.trim() !== 'none') bad.push(`${f}:${i + 1} ${m[0]}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
