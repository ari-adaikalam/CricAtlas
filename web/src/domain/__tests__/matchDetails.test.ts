import { describe, expect, it } from 'vitest';
import type { BatterCard, BowlerCard, Dismissal, InningsCard, MatchBundle, PhaseRow } from '../match';
import { inningsName, dismissalShot, fowAxis, fowRows, ordinal, standRows, standScale, standTip, standTipParts, awardText, ballLabel, decisionText, dotShare, economy, extrasText, fieldingTables, figureHeaders, figureRows, howOut, inningsCardLines, inningsNote, matchFacts, officialRows, phaseName, phaseRange, phasesOf, potmLines, replacementLines, reviewSummary, reviewTables, roundLabels, rounds, runRate, strikeRate, totalText } from '../matchDetails';

const out = (type: string, over: Partial<Dismissal> = {}): Dismissal => ({ type, bowler: 'Bowl X', bowlerId: null, fielders: [], delivery: 1, wicketNumber: 1, over: 0, ball: 1, ballText: '0.1', ...over });
const bat = (name: string, runs: number, balls: number, o: Dismissal | null = null, fours = 0, sixes = 0, id: string | null = null): BatterCard => ({ id, name, runs, balls, fours, sixes, out: o });
const bowl = (name: string, balls: number, runs: number, wkts: number, extra: Partial<BowlerCard> = {}): BowlerCard => ({ id: null, name, balls, maidens: 0, runs, wkts, dots: 0, wd: 0, nb: 0, ...extra });
const inn = (n: number, team: string, runs: number, wkts: number, extra: Partial<InningsCard> = {}): InningsCard => ({
  n, team, teamId: team, runs, wkts, balls: 120, deliveries: 124, overs: '20.0', super: false, declared: false, extras: { wd: 1, nb: 0, b: 0, lb: 2, pen: 0 }, targetRuns: null, targetOvers: null, penaltyPre: 0, penaltyPost: 0,
  batters: [], bowlers: [], didNotBat: [], ...extra,
});
function make(over: Partial<MatchBundle['match']> = {}, innings: InningsCard[] = [inn(1, 'A', 178, 10), inn(2, 'B', 179, 6, { balls: 116, targetRuns: 179, targetOvers: 20 })]): MatchBundle {
  return {
    v: 1,
    match: { id: 1, date: '2024-03-12', endDate: null, season: '2024', gender: 'male', format: 'T20', type: 'Intl', kind: 't20', tournament: { key: 'x', name: 'League', kind: 'league' }, stage: { name: null, cls: null, group: null },
      number: 34, venue: 'Ground X', city: 'City Y', country: 'K', ballsPerOver: 6, scheduledOvers: 20, teams: [{ name: 'A', id: 'a' }, { name: 'B', id: 'b' }], toss: { winner: 'A', decision: 'bat' },
      result: { winner: 'B', winnerId: 'b', runs: null, wickets: 4, outcome: null, method: null, eliminator: null, byInnings: false }, potm: [], officials: {}, ...over },
    innings, coverage: { balls: 0, winProb: 0, projected: 0, tracked: 0, positioned: 0, reviews: 0 }, replacements: [],
  };
}

describe('scorecard wording', () => {
  it('writes how a batter was out', () => {
    expect(howOut(null)).toBe('not out');
    expect(howOut(out('bowled'))).toBe('b Bowl X');
    expect(howOut(out('lbw'))).toBe('lbw b Bowl X');
    expect(howOut(out('caught', { fielders: ['Fld Y'] }))).toBe('c Fld Y b Bowl X');
    expect(howOut(out('caught', { fielders: ['Sub Z (sub)'] }))).toBe('c Sub Z (sub) b Bowl X');
    expect(howOut(out('caught and bowled'))).toBe('c & b Bowl X');
    // A substitute the data lists without a name used to break the scorecard.
    expect(howOut(out('caught', { fielders: [null as unknown as string] }))).toBe('c b Bowl X');
    expect(howOut(out('stumped', { fielders: ['Keeper'] }))).toBe('st Keeper b Bowl X');
    expect(howOut(out('run out', { fielders: ['A', 'B'], bowler: null }))).toBe('run out (A / B)');
    expect(howOut(out('run out', { fielders: [], bowler: null }))).toBe('run out');
    expect(howOut(out('hit wicket'))).toBe('hit wicket b Bowl X');
    expect(howOut(out('retired hurt', { bowler: null }))).toBe('retired hurt');
    expect(howOut(out('timed out', { bowler: null }))).toBe('timed out');
  });
  it('gives a strike rate to a whole number and nothing for no balls', () => {
    expect(strikeRate(41, 28)).toBe(146);
    expect(strikeRate(0, 0)).toBeNull();
  });
  it('writes the extras and the total', () => {
    expect(extrasText(inn(1, 'A', 1, 1))).toBe('b 0, lb 2, w 1, nb 0');
    expect(extrasText(inn(1, 'A', 1, 1, { extras: { wd: 1, nb: 2, b: 3, lb: 4, pen: 5 } }))).toBe('b 3, lb 4, w 1, nb 2, pen 5');
    const b = make();
    expect(totalText(b, b.innings[0]!)).toBe('178 all out');
    expect(totalText(b, b.innings[1]!)).toBe('179/6');
    const t = make({ kind: 'test', result: { winner: null, winnerId: null, runs: null, wickets: null, outcome: 'draw', method: null, eliminator: null, byInnings: false } }, [inn(1, 'A', 312, 6, { declared: true }), inn(2, 'B', 205, 5)]);
    expect(totalText(t, t.innings[0]!)).toBe('312/6 declared');
    expect(totalText(t, t.innings[1]!)).toBe('205/5 at stumps');
  });
});

describe('rounds of a Test', () => {
  it('shows the 1st and 2nd innings together, then the 3rd and 4th, and one round when it is not a Test', () => {
    const t = make({ kind: 'test' }, [inn(1, 'A', 1, 1), inn(2, 'B', 1, 1), inn(3, 'A', 1, 1)]);
    expect(rounds(t).map((r) => r.map((i) => i.n))).toEqual([[1, 2], [3]]);
    expect(roundLabels(t)).toEqual(['1st and 2nd innings', '3rd innings']);
    expect(rounds(make()).map((r) => r.map((i) => i.n))).toEqual([[1, 2]]);
    expect(rounds(make({ kind: 'test' }, [inn(1, 'A', 1, 1)])).map((r) => r.map((i) => i.n))).toEqual([[1]]);
  });
});

describe('bowling figures', () => {
  it('gives overs, maidens, runs, wickets and economy, and dot balls in The Hundred', () => {
    const i = inn(1, 'A', 1, 1, { bowlers: [bowl('Q', 20, 31, 2, { maidens: 1, dots: 9, wd: 1 })] });
    const b = make({}, [i]);
    expect(figureRows(b, i)[0]).toMatchObject({ name: 'Q', balls: '3.2', extra: '1', runs: 31, wkts: 2, econ: '9.3', wd: 1 });
    expect(figureHeaders(b)).toEqual(['Bowler', 'O', 'M', 'R', 'W', 'Econ', 'Wd', 'NB']);
    const h = make({ kind: 'hundred', ballsPerOver: 5 }, [i]);
    expect(figureRows(h, i)[0]).toMatchObject({ balls: '20', extra: '9', econ: '7.8' });
    expect(figureHeaders(h)[2]).toBe('Dots');
    expect(economy(b, bowl('N', 0, 4, 0))).toBe('-');
  });
});

describe('phases', () => {
  const ph = (key: string, first: number, last: number, runs = 10, balls = 6): PhaseRow => ({ key, firstOver: first, lastOver: last, runs, balls, wkts: 0, dots: 2, fours: 1, sixes: 0, extras: { wd: 0, nb: 0, b: 0, lb: 0, pen: 0 } });
  it('names the phases and their overs', () => {
    const b = make();
    const i = inn(1, 'A', 1, 1, { phases: [ph('death', 15, 19), ph('powerplay', 0, 5), ph('middle', 6, 14)] });
    expect(phasesOf(i).map((p) => phaseName(b, p))).toEqual(['Powerplay', 'Middle', 'Death']);
    expect(phaseRange(b, i, phasesOf(i)[2]!)).toBe('Overs 16 to 20');
    const t = make({ kind: 'test' });
    expect(phaseName(t, ph('band1', 20, 39))).toBe('Overs 21 to 40');
  });
  it('counts balls in The Hundred and caps the last range at the innings', () => {
    const h = make({ kind: 'hundred', ballsPerOver: 5 });
    const i = inn(1, 'A', 1, 1, { balls: 98, phases: [ph('powerplay', 0, 4), ph('rest', 5, 19)] });
    expect(phaseRange(h, i, i.phases![0]!)).toBe('Balls 1 to 25');
    expect(phaseRange(h, i, i.phases![1]!)).toBe('Balls 26 to 98');
    expect(runRate(h, { runs: 50, balls: 25 })).toBe('10.0');
    expect(runRate(make(), { runs: 48, balls: 36 })).toBe('8.0');
    expect(runRate(make(), { runs: 0, balls: 0 })).toBe('-');
    expect(dotShare({ dots: 12, balls: 36 })).toBe('33%');
  });
});

describe('fielding and reviews', () => {
  it('groups fielding by the side that was fielding and adds a fielder across innings', () => {
    const t = make({ kind: 'test' }, [
      inn(1, 'A', 1, 1, { fielding: [{ id: 'k', name: 'Keeper', sub: false, c: 2, st: 1, ro: 0 }, { id: 'f', name: 'Fielder', sub: false, c: 1, st: 0, ro: 0 }] }),
      inn(2, 'B', 1, 1, { fielding: [{ id: 'x', name: 'XB', sub: false, c: 0, st: 0, ro: 1 }] }),
      inn(3, 'A', 1, 1, { fielding: [{ id: 'k', name: 'Keeper', sub: false, c: 1, st: 0, ro: 0 }] }),
    ]);
    const tables = fieldingTables(t, t.innings);
    const bField = tables.find((x) => x.team === 'B')!, aField = tables.find((x) => x.team === 'A')!;
    expect(bField.rows.map((r) => [r.name, r.c, r.st])).toEqual([['Keeper', 3, 1], ['Fielder', 1, 0]]);
    expect(bField.total).toBe(5);
    expect(aField.total).toBe(1);
  });
  it('groups reviews by the side that asked and summarises them', () => {
    const r = (team: string, decision: string, umpiresCall: boolean) => ({ ballText: 4.5, over: 4, team, batter: 'P', batterId: null, decision, umpiresCall, type: null });
    const i = inn(1, 'A', 1, 1, { reviews: [r('B', 'struck down', false), r('A', 'upheld', true), r('B', 'upheld', true)] });
    const b = make({}, [i]);
    const tables = reviewTables(b, b.innings);
    expect(tables.map((t) => t.team)).toEqual(['A', 'B']);
    expect(reviewSummary(tables[1]!)).toBe('2 reviews, 1 struck down, 1 on umpires call');
    expect(decisionText(r('B', 'struck down', false))).toBe('Struck down');
    expect(ballLabel(b, 4, 4.5)).toBe('4.5');
    expect(ballLabel(make({ kind: 'hundred', ballsPerOver: 5 }), 5, 5.3)).toBe('28');
  });
});

describe('match info', () => {
  it('lists the facts the data has and leaves out the rest', () => {
    const b = make({ number: null, toss: { winner: null, decision: null } });
    expect(matchFacts(b).map(([k]) => k)).toEqual(['Competition', 'Venue', 'Date']);
    expect(matchFacts(make())[3]).toEqual(['Date', '12 Mar 2024']);
    expect(matchFacts(make({ kind: 'test', endDate: '2024-03-16' }))[3]).toEqual(['Date', '12 Mar 2024 to 16 Mar 2024']);
  });
  it('lists the officials by role', () => {
    expect(officialRows(make({ officials: { umpire: ['U1', 'U2'], tv_umpire: ['U3'], match_referee: ['R1'] } }))).toEqual([['Umpires', 'U1, U2'], ['TV umpire', 'U3'], ['Match referee', 'R1']]);
    expect(officialRows(make())).toEqual([]);
  });
  it('writes the award and the player of the match lines', () => {
    const i1 = inn(1, 'A', 1, 1, { batters: [bat('P', 41, 28, null, 4, 2, 'p')] }), i2 = inn(2, 'B', 1, 1, { bowlers: [bowl('P', 24, 30, 2, { id: 'p' })] });
    const b = make({ potm: [{ name: 'P', id: 'p', team: 'A', award: { n: 3, series: false } }] }, [i1, i2]);
    expect(awardText(b)).toBe('Third award this season');
    expect(awardText(make({ potm: [{ name: 'P', id: 'p', award: { n: 1, series: true } }] }))).toBe('First award this series');
    expect(awardText(make({ potm: [{ name: 'P', id: 'p', award: { n: 21, series: false } }] }))).toBe('21st award this season');
    expect(awardText(make())).toBe('');
    expect(potmLines(b)).toEqual(['41* off 28 balls, 4 fours and 2 sixes', '2 for 30 from 4 overs']);
  });
  it('writes the innings card and the note when there was nothing unusual', () => {
    const b = make();
    expect(inningsCardLines(b)).toEqual([{ team: 'A', text: '178 all out, 20.0 overs', extra: '' }, { team: 'B', text: 'target 179 from 20 overs, 179/6, 20.0 overs', extra: '' }]);
    expect(inningsNote(b)).toBe('No declaration, no penalty runs, no Super Over');
    expect(inningsNote(make({}, [inn(1, 'A', 1, 1, { declared: true }), inn(2, 'B', 1, 1, { penaltyPost: 5 })]))).toBe('No Super Over');
  });
  it('lists replacements with who came in for whom and when', () => {
    const b = make();
    b.replacements = [{ kind: 'match', reason: 'impact_player', team: 'A', role: null, innings: 2, delivery: 1, playerIn: 'In', playerInId: 'i', playerOut: 'Out', playerOutId: 'o', over: 15 }];
    expect(replacementLines(b)).toEqual([{ tag: 'Impact player', detail: '', team: 'A', inId: 'i', inName: 'In', outId: 'o', outName: 'Out', when: '16th over' }]);
    // a change of role inside the match says the role and the reason
    const role = { ...b, replacements: [{ kind: 'role', reason: 'injury', team: null, role: 'batter', innings: 1, delivery: 5, playerIn: 'In', playerInId: 'i', playerOut: 'Out', playerOutId: 'o', over: 57 }] } as never;
    expect(replacementLines(role)[0]).toMatchObject({ tag: 'Replaced as batter', detail: ' as batter (injury)' });
  });
});

describe('partnerships and fall of wickets', () => {
  const stand = (wkt: number, a: string, ar: number, ab: number, b: string, br: number, bb: number, runs: number, balls: number) => ({ wkt, a: { id: null, name: a, runs: ar, balls: ab }, b: { id: null, name: b, runs: br, balls: bb }, runs, balls, first: 1 });
  it('writes the ordinals', () => {
    expect([1, 2, 3, 4, 10, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '10th', '11th', '12th', '13th', '21st', '22nd']);
  });
  it('labels each stand, finds ids from the scorecard and counts the extras in it', () => {
    const i = inn(1, 'A', 20, 1, { batters: [bat('P', 9, 6, null, 0, 0, 'p1'), bat('Q', 8, 5, null, 0, 0, 'q1')], partnerships: [stand(1, 'P', 9, 6, 'Q', 8, 5, 20, 12), stand(2, 'P', 0, 0, 'R', 0, 0, 0, 0)] });
    const rows = standRows(i);
    expect(rows.map((r) => r.label)).toEqual(['1st', '2nd']);
    expect(rows[0]!.a.id).toBe('p1');
    expect(rows[0]!.extras).toBe(3);
    expect(rows[0]!.unbroken).toBe(false);
    expect(rows[1]!.unbroken).toBe(true);
  });
  it('marks a stand split by a retirement and gives it the same number', () => {
    const i = inn(1, 'A', 30, 0, { partnerships: [stand(1, 'P', 10, 8, 'Q', 5, 6, 15, 14), stand(1, 'P', 5, 4, 'R', 10, 9, 15, 13)] });
    const rows = standRows(i);
    expect(rows.map((r) => [r.label, r.split])).toEqual([['1st', false], ['1st', true]]);
    expect(standTipParts(rows[1]!).note).toContain('retired');
    expect(standTip(rows[1]!)).toContain('retired');
    expect(standTipParts(rows[0]!).rows.map((r) => r.label).slice(0, 2)).toEqual(['Runs', 'Balls']);
  });
  it('scales the bars to the best single score and never below 20', () => {
    const small = inn(1, 'A', 10, 1, { partnerships: [stand(1, 'P', 3, 2, 'Q', 4, 3, 7, 5)] });
    const big = inn(2, 'B', 90, 1, { partnerships: [stand(1, 'P', 61, 40, 'Q', 22, 18, 90, 60)] });
    expect(standScale([small])).toBe(20);
    expect(standScale([small, big])).toBe(61);
  });
  it('words what the batter was doing when out', () => {
    const e = { n: 1, runs: 41, id: null, name: 'P', batRuns: 27, batBalls: 20, ballText: 5.1, over: 5, ball: 1, type: 'caught', shot: 'pull', delivery: 31 };
    expect(dismissalShot(e)).toBe('out playing a pull');
    expect(dismissalShot({ ...e, shot: null, type: 'run out' })).toBe('run out');
    expect(dismissalShot({ ...e, shot: null })).toBe('');
  });
  it('writes each fall with the over, or the ball in The Hundred', () => {
    const i = inn(1, 'A', 120, 1, { fow: [{ n: 1, runs: 41, id: 'p', name: 'P', batRuns: 27, batBalls: 20, ballText: 5.1, over: 5, ball: 1, type: 'caught', shot: 'cut shot', delivery: 31 }] });
    expect(fowRows(make(), i)[0]).toMatchObject({ score: '27 off 20', when: 'over 5.1', shot: 'out playing a cut shot', runs: 41 });
    expect(fowRows(make({ kind: 'hundred' }), i)[0]!.when).toBe('ball 26');
  });
  it('puts a retirement in the line, in order, numbered as the next wicket and starred', () => {
    const w = (n: number, runs: number, delivery: number) => ({ n, runs, id: null, name: `P${n}`, batRuns: 10, batBalls: 8, ballText: 3.1, over: 3, ball: 1, type: 'caught', shot: null, delivery });
    const i = inn(1, 'A', 150, 2, { fow: [w(1, 40, 20), w(2, 128, 116)], retired: [{ ...w(2, 62, 61), name: 'Rt', type: 'retired hurt' }] });
    const rows = fowRows(make(), i);
    expect(rows.map((r) => r.label)).toEqual(['40-1', '62-2*', '128-2']);
    expect(rows[1]).toMatchObject({ retired: true, shot: 'retired hurt', name: 'Rt' });
    expect(fowRows(make(), inn(1, 'A', 5, 0)).length).toBe(0);
  });
  it('rounds the axis up to a tick, the same for both innings', () => {
    expect(fowAxis([inn(1, 'A', 178, 10), inn(2, 'B', 172, 4)])).toEqual({ max: 180, step: 20 });
    expect(fowAxis([inn(1, 'A', 312, 6)])).toEqual({ max: 350, step: 50 });
    expect(fowAxis([inn(1, 'A', 520, 6)])).toEqual({ max: 600, step: 100 });
    expect(fowAxis([inn(1, 'A', 0, 0)])).toEqual({ max: 10, step: 10 });
  });
  it('names a follow-on innings in a Test', () => {
    const t = make({ kind: 'test' }, [inn(1, 'A', 500, 9), inn(2, 'B', 290, 10), inn(3, 'B', 429, 9)]);
    expect(t.innings.map((x) => inningsName(t, x))).toEqual(['1st innings', '2nd innings', '3rd innings (f/o)']);
    const n = make({ kind: 'test' }, [inn(1, 'A', 500, 9), inn(2, 'B', 290, 10), inn(3, 'A', 100, 2), inn(4, 'B', 5, 1)]);
    expect(n.innings.map((x) => inningsName(n, x))).toEqual(['1st innings', '2nd innings', '3rd innings', '4th innings']);
  });
});
