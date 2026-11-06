import { describe, expect, it } from 'vitest';
import { indexInnings, type BatRow, type BowlRow, type TInnings, type TMatch } from '../tournament';
import { keyNumbers, knockouts, standings, tableSet } from '../tournamentTables';
import { bestPerformances, economy, leadersByEdition, mostRuns, mostWickets, playerAgg, potmSummary, rateLeaders } from '../tournamentPlayers';

let next = 1;
const match = (o: Partial<TMatch> = {}): TMatch => ({
  id: next++, date: '2024-04-01', season: '2024', edition: 't|2024|male', format: 'T20', stageClass: null, stageName: null, group: null, number: null, venue: 'G1', city: 'C', country: 'X',
  team1: 'A', team1Id: 'a', team2: 'B', team2Id: 'b', tossWinnerId: 'a', tossDecision: 'bat', batFirstId: 'a', winnerId: 'a', outcome: null, byRuns: 10, byWkts: null, byInnings: false, method: null,
  overs: 20, ballsPerOver: 6, revisedOvers: 20, potmId: null, potm: null, ...o,
});
const inn = (matchId: number, n: number, batId: string, runs: number, o: Partial<TInnings> = {}): TInnings => ({ matchId, inn: n, batId, bowlId: batId === 'a' ? 'b' : 'a', superOver: false, runs, wkts: 5, balls: 120, fours: 10, sixes: 5, declared: false, ...o });
const names = new Map([['a', 'A'], ['b', 'B'], ['c', 'C']]);

describe('key numbers', () => {
  it('leave a no result out of runs and averages and count a Hundred over as 100 balls', () => {
    const m1 = match(), m2 = match({ winnerId: null, outcome: 'no result' });
    const idx = indexInnings([inn(m1.id, 1, 'a', 160), inn(m1.id, 2, 'b', 150), inn(m2.id, 1, 'a', 30, { balls: 20 })]);
    const k = keyNumbers([m1, m2], idx, 'T20');
    expect(k).toMatchObject({ matches: 2, runs: 310, wickets: 10, fours: 20, sixes: 10, avgFirst: 160, avgSecond: 150 });
    expect(k.runRate).toBeCloseTo((310 / 240) * 6, 6);
    expect(k.highest).toMatchObject({ runs: 160, teamId: 'a' });
    expect(keyNumbers([m1], idx, 'HUNDRED').runRate).toBeCloseTo((310 / 240) * 100, 6);
  });
});

describe('standings', () => {
  it('gives 2 for a win, 1 for a tie with no winner or a no result, and a Super Over decides a tie', () => {
    const win = match(), tie = match({ winnerId: null, outcome: 'tie' }), nr = match({ winnerId: null, outcome: 'no result' }), so = match({ winnerId: 'b', outcome: 'tie' });
    const rows = standings([win, tie, nr, so], new Map(), 'T20', names);
    const a = rows.find((r) => r.id === 'a')!, b = rows.find((r) => r.id === 'b')!;
    expect(a).toMatchObject({ played: 4, won: 1, lost: 1, tied: 1, nr: 1, points: 2 + 1 + 1 + 0 });
    expect(b).toMatchObject({ won: 1, lost: 1, points: 0 + 1 + 1 + 2 });
  });
  it('counts a full quota for a side that was all out and a revised quota for a shortened chase', () => {
    const m = match({ winnerId: 'a', revisedOvers: 10 });
    const idx = indexInnings([inn(m.id, 1, 'a', 120, { balls: 120 }), inn(m.id, 2, 'b', 60, { wkts: 10, balls: 50 })]);
    const rows = standings([m], idx, 'T20', names);
    // B was all out, so it faced the 60 balls of its revised 10 overs: 60 runs off 60 balls against 120 off 120.
    expect(rows.find((r) => r.id === 'b')!.nrr).toBeCloseTo((60 / 60 - 120 / 120) * 6, 6);
  });
  it('orders by points, then net run rate, and uses Test points and a percentage', () => {
    const m = match({ format: 'TEST', winnerId: 'a' }), d = match({ format: 'TEST', winnerId: null, outcome: 'draw' });
    const rows = standings([m, d], new Map(), 'TEST', names);
    expect(rows[0]).toMatchObject({ id: 'a', points: 16, nrr: null });
    expect(rows[0]!.pct).toBeCloseTo((16 / 24) * 100, 6);
    expect(rows[1]).toMatchObject({ id: 'b', points: 4 });
  });
});

describe('table', () => {
  it('makes one table for each stage and group of a single edition, in the order played', () => {
    const ms = [match({ stageName: 'Super 8', group: '1', date: '2024-06-01' }), match({ stageName: 'Group stage', group: 'A', date: '2024-05-01' }), match({ stageName: 'Final', stageClass: 'knockout', date: '2024-07-01' })];
    const set = tableSet(ms, new Map(), 'T20', names, 'tournament')!;
    expect(set.groups.map((g) => g.title)).toEqual(['Group stage, Group A', 'Super 8, Group 1']);
    expect(set.title).toBe('Table, 2024');
  });
  it('combines editions into one table, and says so when only knockouts are in scope', () => {
    const ms = [match({ edition: 't|2023|male' }), match()];
    expect(tableSet(ms, new Map(), 'T20', names, 'league')!.groups).toHaveLength(1);
    expect(tableSet(ms, new Map(), 'T20', names, 'league')!.title).toBe('Table, all editions');
    expect(tableSet([match({ stageClass: 'knockout', stageName: 'Final' })], new Map(), 'T20', names, 'league')).toBeNull();
  });
});

describe('knockouts', () => {
  it('lists editions newest first and counts wins by the side batting second', () => {
    const f1 = match({ edition: 't|2023|male', date: '2023-05-01', stageClass: 'knockout', stageName: 'Final', winnerId: 'a', batFirstId: 'a' });
    const f2 = match({ edition: 't|2024|male', date: '2024-05-01', stageClass: 'knockout', stageName: 'Final', winnerId: 'b', batFirstId: 'a' });
    const s = knockouts([f1, f2, match()]);
    expect(s.editions.map((e) => e.label)).toEqual(['2024', '2023']);
    expect(s).toMatchObject({ matches: 2, chased: 1, decided: 2, finals: 2, finalsChased: 1 });
  });
});

describe('players', () => {
  const m1 = match({ potmId: 'p1', potm: 'P One' }), m2 = match({ date: '2024-04-05', winnerId: 'b', potmId: 'p3', potm: 'P Three', stageName: 'Final', stageClass: 'knockout' });
  const bat: BatRow[] = [
    { matchId: m1.id, inn: 1, id: 'p1', name: 'P One', teamId: 'a', runs: 80, balls: 40, fours: 8, sixes: 3, out: true },
    { matchId: m2.id, inn: 1, id: 'p1', name: 'P One', teamId: 'a', runs: 55, balls: 30, fours: 5, sixes: 2, out: false },
    { matchId: m1.id, inn: 2, id: 'p2', name: 'P Two', teamId: 'b', runs: 20, balls: 15, fours: 1, sixes: 1, out: true },
  ];
  const bowl: BowlRow[] = [
    { matchId: m1.id, inn: 2, id: 'p3', name: 'P Three', teamId: 'a', balls: 24, runs: 20, wkts: 3, maidens: 0 },
    { matchId: m2.id, inn: 2, id: 'p3', name: 'P Three', teamId: 'b', balls: 24, runs: 30, wkts: 2, maidens: 1 },
  ];
  const pl = playerAgg(bat, bowl, [m1, m2]);
  it('sums a player over the matches and keeps the best score with its not out mark', () => {
    const p1 = pl.find((p) => p.id === 'p1')!;
    expect(p1).toMatchObject({ matches: 2, inns: 2, runs: 135, balls: 70, outs: 1, fours: 13, sixes: 5, fifties: 2, potm: 1 });
    expect(p1.high).toEqual({ runs: 80, out: true });
    expect(pl.find((p) => p.id === 'p3')).toMatchObject({ wkts: 5, conceded: 50, teamId: 'b', best: { wkts: 3, conceded: 20 }, potm: 1 });
  });
  it('leaves a no result match out', () => {
    expect(playerAgg(bat, bowl, [match({ id: m1.id, winnerId: null, outcome: 'no result' })])).toHaveLength(0);
  });
  it('ranks runs and wickets, with fewer runs conceded breaking a tie', () => {
    expect(mostRuns(pl)[0]!.id).toBe('p1');
    expect(mostWickets(pl)[0]!.id).toBe('p3');
  });
  it('finds the best innings and figures and the counts', () => {
    const b = bestPerformances(pl, 'T20');
    expect(b.innings[0]).toMatchObject({ runs: 80, id: 'p1' });
    expect(b.figures[0]).toMatchObject({ wkts: 3 });
    expect(b).toMatchObject({ fifties: 2, hauls: 1, haulAt: 3 });
  });
  it('sums the awards, by the team the winner played for', () => {
    const s = potmSummary(pl, bat, bowl, [m1, m2]);
    expect(s).toMatchObject({ awards: 2, winners: 2, repeat: 0 });
    expect(s.byTeam).toEqual(expect.arrayContaining([{ teamId: 'a', awards: 1 }, { teamId: 'b', awards: 1 }]));
    expect(s.finals.map((m) => m.id)).toEqual([m2.id]);
  });
  it('applies the fixed qualifying line and Hundred economy per 5 balls', () => {
    expect(rateLeaders(pl, 'T20').bat).toHaveLength(0);
    expect(rateLeaders(pl, 'T20').fours[0]!.id).toBe('p1');
    const p3 = pl.find((p) => p.id === 'p3')!;
    expect(economy(p3, 'T20')).toBeCloseTo((50 / 48) * 6, 6);
    expect(economy(p3, 'HUNDRED')).toBeCloseTo((50 / 48) * 5, 6);
  });
  it('finds the top scorer and wicket taker of each edition over all its matches', () => {
    const l = leadersByEdition(bat, bowl, [m1, m2]).get('t|2024|male')!;
    expect(l.scorer!.id).toBe('p1');
    expect(l.taker!.id).toBe('p3');
  });
});
