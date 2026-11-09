import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A tile title is a short name and the tip is a sentence (a tile without a title of its own, the Compare teams form, has the tip as its fourth argument and is not looked at). An edit that set a tip in the title's place showed a whole sentence as a heading (Team page, Reviews, 2026-10-25).
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : []; });

describe('tile titles', () => {
  it('are short names, never a sentence', () => {
    const long: string[] = [];
    for (const f of files(join(__dirname, '..'))) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/\{ id: '([^']+)', label: '([^']+)', group: '[^']+', title: '([^']+)'/g)) if (m[3]!.length > 40) long.push(`${f}: ${m[1]} "${m[3]}"`);
      for (const m of s.matchAll(/tile\('([a-z0-9]+)', '([^']+)', (?:'[^']*'|[^,]+), '((?:[^'\\]|\\.)+)', (?=['`])/g)) if (m[3]!.length > 40) long.push(`${f}: ${m[1]} "${m[3]}"`);
    }
    expect(long).toEqual([]);
  });
});
