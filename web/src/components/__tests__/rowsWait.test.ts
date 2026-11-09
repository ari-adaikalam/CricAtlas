import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A row that waits for its tile to play must stay hidden until it plays. These tests read the stylesheet and
// hold the rules that make that true: the 3 second fallback of globals.css (rowsUnstick) must not apply to a tile nobody has seen, and the rows that animate must be among the rows that are hidden while they wait.

const css = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');

/** The row classes in the `:is(...)` list of the first rule whose selector starts with `start`, or null. */
function rowClasses(start: string): string[] | null {
  const at = css.indexOf(start);
  if (at < 0) return null;
  const list = /:is\(([^)]*)\)/.exec(css.slice(at, at + 400));
  return list ? list[1]!.split(',').map((x) => x.trim()) : null;
}

describe('rows waiting for their tile', () => {
  const waiting = rowClasses(".pgx [data-rows='wait'] :is(");
  const playing = rowClasses(".pgx [data-rows='play'] :is(");

  it('hides every kind of row that animates while it waits', () => {
    expect(waiting).not.toBeNull();
    expect(playing).not.toBeNull();
    for (const c of playing!) expect(waiting, `${c} animates but is not hidden while waiting`).toContain(c);
  });

  it('shows no row of a tile nobody has seen through the 3 second fallback', () => {
    const fallback = /\.pgx \[data-rows='wait'\] :is\(([^)]*)\) \{ animation: rowsUnstick/.exec(css);
    expect(fallback, 'the fallback rule moved or was renamed: update this test with it').not.toBeNull();
    const guard = /\.pgx \.tile:not\(\[data-seen\]\) \[data-rows='wait'\] :is\(([^)]*)\) \{ animation: none; \}/.exec(css);
    expect(guard, 'a tile not yet seen must not run the rowsUnstick fallback').not.toBeNull();
    const covered = guard![1]!.split(',').map((x) => x.trim());
    for (const c of fallback![1]!.split(',').map((x) => x.trim())) expect(covered, `${c} would show before its tile is seen`).toContain(c);
  });

  it('puts the guard after the fallback, so it wins at equal strength', () => {
    expect(css.indexOf('animation: none; }', css.indexOf('rowsUnstick 0.01s 3s forwards'))).toBeGreaterThan(css.indexOf('rowsUnstick 0.01s 3s forwards'));
    expect(css.indexOf(".pgx .tile:not([data-seen]) [data-rows='wait']")).toBeGreaterThan(css.indexOf('rowsUnstick 0.01s 3s forwards'));
  });
});
