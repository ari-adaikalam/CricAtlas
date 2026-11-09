import { describe, expect, it } from 'vitest';
import { applyFilters, defaultFilters, editionOptions, editionResults, filtersFromParams, filtersToParams, indexInnings, marginOf, normaliseFilters, stageOptions, titleRows, type TInnings, type TMatch } from '../tournament';

let next = 1;
const match = (o: Partial<TMatch> = {}): TMatch => ({
  id: next++, date: '2024-04-01', season: '2024', edition: 't|2024|male', format: 'T20', stageClass: null, stageName: null, group: null, number: null, venue: 'G1', city: 'C', country: 'X',
  team1: 'A', team1Id: 'a', team2: 'B', team2Id: 'b', tossWinnerId: 'a', tossDecision: 'bat', batFirstId: 'a', winnerId: 'a', outcome: null, byRuns: 10, byWkts: null, byInnings: false, method: null,
  overs: 20, ballsPerOver: 6, revisedOvers: 20, potmId: null, potm: null, ...o,
});
const inn = (matchId: number, n: number, batId: string, runs: number, o: Partial<TInnings> = {}): TInnings => ({ matchId, inn: n, batId, bowlId: batId === 'a' ? 'b' : 'a', superOver: false, runs, wkts: 5, balls: 120, fours: 0, sixes: 0, declared: false, ...o });

describe('scope', () => {
  const ms = [
    match({ edition: 't|2023|male', date: '2023-04-01' }),
    match({ edition: 't|2024|male', date: '2024-04-01' }),
    match({ edition: 't|2024|male', date: '2024-05-01', stageClass: 'knockout', stageName: 'Final' }),
    match({ edition: 't|2024|male', date: '2024-04-20', format: 'ODI' }),
  ];
  it('opens on the format with most matches and its latest edition', () => {
    expect(defaultFilters(ms)).toMatchObject({ format: 'T20', edition: 't|2024|male', stage: 'all' });
  });
  it('lists editions newest first and only those with matches in the format', () => {
    expect(editionOptions(ms, 'T20').map((e) => e.label)).toEqual(['2024', '2023']);
    expect(editionOptions(ms, 'ODI').map((e) => e.label)).toEqual(['2024']);
  });
  it('filters by format, edition and stage together', () => {
    const f = { ...defaultFilters(ms)!, stage: 'knockouts' };
    expect(applyFilters(ms, f)).toHaveLength(1);
    expect(applyFilters(ms, { ...f, stage: 'league' })).toHaveLength(1);
  });
  it('drops a stage the edition did not use', () => {
    const n = normaliseFilters(ms, { format: 'T20', stage: 'Final', edition: 't|2023|male', team: null, venue: null })!;
    expect(n.stage).toBe('all');
  });
  it('lists stages in the order played', () => {
    expect(stageOptions(ms, 'T20', 't|2024|male').map((s) => s.label)).toEqual(['All stages', 'League stage', 'Knockouts', 'Final']);
  });
  it('round-trips through the address', () => {
    const f = { format: 'ODI' as const, stage: 'knockouts', edition: null, team: 'a', venue: null };
    expect(filtersFromParams(filtersToParams(f))).toMatchObject({ format: 'ODI', stage: 'knockouts', edition: null, team: 'a' });
  });
});

describe('champions', () => {
  it('takes the winner of the Final, and with a best of three the side with more wins', () => {
    const f1 = match({ edition: 't|2022|male', date: '2022-05-01', stageClass: 'knockout', stageName: 'Final', winnerId: 'a' });
    const f2 = match({ edition: 't|2022|male', date: '2022-05-03', stageClass: 'knockout', stageName: 'Final', winnerId: 'b' });
    const f3 = match({ edition: 't|2022|male', date: '2022-05-05', stageClass: 'knockout', stageName: 'Final', winnerId: 'b' });
    const [e] = editionResults([f1, f2, f3]);
    expect(e).toMatchObject({ championId: 'b', runnerUpId: 'a' });
  });
  it('has no champion for a tied or abandoned Final, nor for an edition with no Final', () => {
    const tied = match({ edition: 't|2021|male', stageClass: 'knockout', stageName: 'Final', winnerId: null, outcome: 'no result' });
    const none = match({ edition: 't|2020|male', date: '2020-04-01' });
    const rs = editionResults([tied, none]);
    expect(rs.every((r) => r.championId === null)).toBe(true);
  });
  it('counts titles and finals by team, most titles first', () => {
    const mk = (y: string, w: string) => match({ edition: `t|${y}|male`, date: `${y}-05-01`, stageClass: 'knockout', stageName: 'Final', winnerId: w });
    const rows = titleRows(editionResults([mk('2022', 'a'), mk('2023', 'a'), mk('2024', 'b')]), new Map([['a', 'A'], ['b', 'B']]));
    expect(rows[0]).toMatchObject({ id: 'a', titles: 2, finals: 3, years: ['2023', '2022'] });
    expect(rows[1]).toMatchObject({ id: 'b', titles: 1, finals: 3 });
  });
});

describe('margin', () => {
  it('words runs, wickets with balls left, an innings, ties and no results', () => {
    const m = match({ byRuns: 1 });
    expect(marginOf(m, new Map())).toBe('by 1 run');
    const c = match({ winnerId: 'b', byRuns: null, byWkts: 5 });
    const idx = indexInnings([inn(c.id, 1, 'a', 150), inn(c.id, 2, 'b', 151, { balls: 110 })]);
    expect(marginOf(c, idx)).toBe('by 5 wickets (10 balls left)');
    expect(marginOf(match({ winnerId: null, outcome: 'no result' }), new Map())).toBe('no result');
    expect(marginOf(match({ byRuns: 40, byInnings: true, format: 'TEST' }), new Map())).toBe('by an innings and 40 runs');
  });
});
