import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BallFile } from '../ballByBall';
import { mainInnings, type MatchBundle } from '../match';
import { buildTimeline, completedOvers, locate, marksOf, snapshot } from '../replay';

const DATA = '../data/export/m';
const ids = ['1529228', '1544002', '1521264', '1114879'];

describe.skipIf(!existsSync(`${DATA}/bundle/1529228.json`))('the replay of exported matches', () => {
  for (const id of ids) {
    if (!existsSync(`${DATA}/bundle/${id}.json`)) continue;
    const b = JSON.parse(readFileSync(`${DATA}/bundle/${id}.json`, 'utf8')) as MatchBundle;
    const files = new Map<number, BallFile>();
    for (const i of mainInnings(b)) { const p = `${DATA}/balls/${id}_${i.n}.json`; if (existsSync(p)) files.set(i.n, JSON.parse(readFileSync(p, 'utf8')) as BallFile); }
    const t = buildTimeline(b, mainInnings(b), files);
    it(`#${id} ${b.match.kind}: the end of each innings is the scorecard, and the position map is whole`, () => {
      expect(t.total).toBe(t.innings.reduce((a, r) => a + r.file.d.length, 0));
      for (const ri of t.innings) {
        const s = snapshot(b, t, ri.start + ri.file.d.length)!;
        expect(s.score).toBe(ri.inn.runs);
        expect(s.wickets).toBe(ri.inn.wkts);
        expect(s.k).toBe(t.innings.indexOf(ri));
      }
      expect(locate(t, 0)).toEqual({ k: 0, c: 0 });
      expect(locate(t, 1)).toEqual({ k: 0, c: 1 });
      if (t.innings.length > 1) expect(locate(t, t.innings[0]!.file.d.length + 1)).toEqual({ k: 1, c: 1 });
    });
    it(`#${id}: two batters are at the crease on nearly every ball, and the striker is one of them`, () => {
      // A batter who is out on the ball is no longer at the crease, so the balls with a wicket are left out of the striker count.
      let balls = 0, two = 0, quiet = 0, striker = 0;
      for (let pos = 1; pos <= t.total; pos++) {
        const s = snapshot(b, t, pos)!;
        balls += 1;
        if (s.batters.length === 2) two += 1;
        if (s.ball && s.k >= 0 && t.innings[s.k]!.file.w[s.c - 1] === 0) { quiet += 1; if (s.batters.some((x) => x.striker)) striker += 1; }
      }
      expect(two / balls).toBeGreaterThan(0.95);
      expect(striker / quiet).toBeGreaterThan(0.99);
    });
    it(`#${id}: the last bowler's figures at the end match the scorecard, and the wickets are marked`, () => {
      for (const ri of t.innings) {
        const s = snapshot(b, t, ri.start + ri.file.d.length)!;
        const last = ri.rows[ri.rows.length - 1]!.bowler;
        const card = ri.inn.bowlers.find((x) => (x.id ?? x.name) === (last?.id ?? last?.name));
        expect(card).toBeTruthy();
        const parts = s.bowler!.line.split('-').map(Number);
        const wkts = parts[parts.length - 1]!, runs = parts[parts.length - 2]!;
        expect(wkts).toBe(card!.wkts);
        expect(runs).toBe(card!.runs);
      }
      expect(marksOf(t).filter((m) => m.kind === 'wicket').length).toBe(t.innings.reduce((a, r) => a + r.file.w.filter((x) => x > 0).length, 0));
    });
    it(`#${id}: whole overs are counted when the over ends`, () => {
      const f = t.innings[0]!.file;
      for (let c = 1; c <= f.d.length; c++) {
        const done = completedOvers(f, c);
        expect(done).toBeLessThanOrEqual(f.ov[c - 1]! + 1);
        expect(done).toBeGreaterThanOrEqual(f.ov[c - 1]!);
      }
    });
  }
});
