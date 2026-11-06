import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The docs name each other by file name, and a session reads the ones the index points to. A doc that is renamed or moved without its links being fixed misleads the next session, so this fails first.
const root = resolve(__dirname, '../../../..');
const docsDir = join(root, 'docs');

const listing = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => join(dir, f)) : []);
// CLAUDE.md, NEXT_SESSION.md and docs/archive are in the private repo only.
const files = [...(existsSync(join(root, 'CLAUDE.md')) ? [join(root, 'CLAUDE.md')] : []), ...listing(docsDir), ...listing(join(docsDir, 'archive')), ...listing(join(docsDir, 'player'))];

// Files that live in another repo or are not ours to check.
const OUTSIDE = /^(?:docs\/internal\/|api\/|https?:|\.\.\/\.\.)/;

function exists(name: string): boolean {
  const candidates = [join(root, name), join(docsDir, name), join(docsDir, 'archive', name), join(docsDir, 'player', name), join(root, 'docs', name.replace(/^docs\//, '')), join(root, 'web', name), join(docsDir, '..', name.replace(/^\.\.\//, ''))];
  return candidates.some((p) => existsSync(p));
}

// The public copy has no docs index, because the working docs stay private, so the index check is skipped there.
const hasIndex = existsSync(join(docsDir, 'README.md'));

describe('docs', () => {
  it('every .md file a doc names exists', () => {
    const missing: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/(?<![\w/.-])((?:\.\.\/)?(?:docs\/|archive\/|web\/|internal\/)?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.md)\b/g)) {
        const name = match[1]!;
        if (OUTSIDE.test(name) || name.startsWith('internal/') || /^(README|CLAUDE|AGENTS|ONBOARDING)\.md$/.test(name)) continue;
        if (/(^|\/)NEXT_SESSION\.md$/.test(name) && !existsSync(join(docsDir, 'NEXT_SESSION.md'))) continue;
        if (!exists(name)) missing.push(`${file.replace(root + '/', '')}: ${name}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it.skipIf(!hasIndex)('the index names every doc', () => {
    const index = readFileSync(join(docsDir, 'README.md'), 'utf8');
    const unlisted = readdirSync(docsDir).filter((f) => f.endsWith('.md') && f !== 'README.md' && f !== 'NEXT_SESSION.md' && !index.includes(f));
    expect(unlisted).toEqual([]);
    expect(readdirSync(join(docsDir, 'player')).filter((f) => f.endsWith('.md') && !index.includes(f))).toEqual([]);
  });
});
