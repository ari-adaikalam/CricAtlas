// Every match bundle through the summary's wording and rules, looking for what the summary cannot show well: missing parts, odd counts, text that would read badly. Prints the kinds of match found,
// every violation with an example id, and a stratified list of ids for the browser (scripts/perf/match-fit.cjs).
// Run from web/:  npx vite-node --config vitest.config.ts scripts/match-sweep.ts
import fs from 'node:fs';
import path from 'node:path';
import { ballsLeft, bannerLines, followOn, inningsBatters, inningsBowlers, inningsLabel, mainInnings, potm, resultText, scoreText, sides, subMarks, superInnings, superOverLines, tossOf, type MatchBundle } from '../src/domain/match';

const dir = path.resolve('../data/export/m/bundle');
const bundles = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as MatchBundle);
const BAD = /NaN|undefined|Infinity|\[object|\bnull\b/;
const violations = new Map<string, number[]>();
const flag = (what: string, id: number): void => { const l = violations.get(what) ?? []; l.push(id); violations.set(what, l); };
const kinds = new Map<string, number[]>();
const kind = (what: string, id: number): void => { const l = kinds.get(what) ?? []; l.push(id); kinds.set(what, l); };

for (const b of bundles) {
  const m = b.match, id = m.id, inn = mainInnings(b);
  const texts = [resultText(b), ...bannerLines(b), ...superOverLines(b), ...inn.map((i) => `${scoreText(i)} ${inningsLabel(b, i)}`), potm(b)?.names ?? '', potm(b)?.figures ?? ''];
  if (texts.some((t) => BAD.test(t))) flag('text with NaN, undefined or null', id);
  if (!resultText(b)) flag('empty result', id);
  const [x, y] = sides(b); if (x === y) flag('both sides have the same name', id);
  if (inn.length === 0) flag('no innings', id);
  for (const i of inn) {
    if (i.batters.length === 0 && i.balls > 0) flag('an innings with balls and no batters', id);
    if (inningsBatters(i).length === 0 && i.balls > 6) flag('an innings of more than an over with no batter on the summary', id);
    if (i.bowlers.length === 0 && i.balls > 0) flag('an innings with balls and no bowlers', id);
    if (i.wkts > 10 || i.wkts < 0) flag('wickets outside 0 to 10', id);
    if (i.runs < 0) flag('negative runs', id);
    if (inningsBowlers(i).some((r) => r.balls <= 0)) kind('a bowler with no legal balls on the summary (wides only)', id);
  }
  if (ballsLeft(b) < 0) flag('negative balls left', id);
  if (!m.teams.every((t) => t.name)) flag('a team with no name', id);
  if (!m.venue) flag('no ground', id);
  if (!m.tournament.name) kind('no competition name (the banner names the format)', id);
  if (m.kind === 'test' && inn.length > 4) flag('a Test with more than four innings', id);
  if (m.kind !== 'test' && inn.length > 2) flag('limited overs with more than two innings', id);
  if (m.kind !== 'test' && followOn(b)) flag('a follow-on outside a Test', id);
  if (potm(b) === null) kind('no player of the match', id);
  if (!tossOf(b)) kind('no toss', id);
  if (superInnings(b).length) kind(`Super Over, ${superInnings(b).length / 2} round(s)`, id);
  if (subMarks(b).size) kind('substitutes marked', id);
  kind(`${m.kind}, ${m.gender}, ${inn.length} innings`, id);
  kind(`result: ${m.result.outcome ?? (m.result.method === 'Awarded' ? 'awarded' : m.result.byInnings ? 'innings win' : m.result.runs !== null ? 'runs' : m.result.wickets !== null ? 'wickets' : 'none')}${m.result.method === 'D/L' ? ' (DLS)' : ''}`, id);
  if (followOn(b)) kind('follow-on', id);
  if (inn.length === 1) kind('one innings only', id);
  if (b.coverage.tracked === 0) kind('no tracking', id);
}
console.log(`${bundles.length} matches`);
console.log('\nKinds found:'); [...kinds.entries()].sort().forEach(([k, ids]) => console.log(`  ${String(ids.length).padStart(6)}  ${k}`));
console.log(violations.size ? '\nViolations:' : '\nNo violations.'); [...violations.entries()].forEach(([k, ids]) => console.log(`  ${String(ids.length).padStart(6)}  ${k}   e.g. ${ids.slice(0, 5).join(', ')}`));
// A stratified list for the browser: up to 3 ids from every kind, the latest first.
const pick = new Set<number>(); for (const ids of kinds.values()) ids.slice().sort((a, b) => b - a).slice(0, 3).forEach((id) => pick.add(id));
for (const ids of violations.values()) ids.slice(0, 3).forEach((id) => pick.add(id));
console.log(`\nSWEEP IDS ${[...pick].join(',')}`);
