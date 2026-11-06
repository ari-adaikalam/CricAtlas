import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pageExtensions } from '../pageExtensions';

describe('development only routes', () => {
  it('are routes in development and not in a production build', () => {
    expect(pageExtensions('development')).toContain('dev.tsx');
    expect(pageExtensions('development')).toContain('dev.ts');
    expect(pageExtensions('production')).not.toContain('dev.tsx');
    expect(pageExtensions('production')).not.toContain('dev.ts');
    expect(pageExtensions('production')).toContain('tsx');
  });

  it('every page under /dev is a .dev file, so a production build has none of them', () => {
    const dir = join(__dirname, '../../app/dev');
    if (!existsSync(dir)) return;
    const files: string[] = [];
    const walk = (d: string): void => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
    walk(dir);
    const routes = files.filter((f) => /(^|\/)(page|route|layout)\.(tsx|ts|jsx|js)$/.test(f));
    expect(routes).toEqual([]);
  });
});
