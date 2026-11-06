import { describe, expect, it } from 'vitest';
import { ballsLeft, sides, inningsBatters, inningsBowlers, inningsLabel, daysText, titleText, datesText, bannerLines, dlsTip, potm, resultText, tossOf, followOn, bowledText, placeLine, stripContext, stripLink, formatTag, subMarks, subMarkOf, scoreText, superOverLines, teamScore, winningSide, type BatterCard, type BowlerCard, type InningsCard, type MatchBundle } from '../match';
import { matchIdFromSlug, matchSlug } from '../slug';

const bat = (name: string, runs: number, balls: number, out = true, id: string | null = null): BatterCard => ({ id, name, runs, balls, fours: 0, sixes: 0, out: out ? { type: 'caught', bowler: 'X', bowlerId: null, fielders: [], delivery: 1, wicketNumber: 1, over: 0, ball: 1, ballText: '0.1' } : null });
const bowl = (name: string, wkts: number, runs: number, balls = 24, id: string | null = null): BowlerCard => ({ id, name, balls, maidens: 0, runs, wkts, dots: 0, wd: 0, nb: 0 });
const inn = (n: number, team: string, runs: number, wkts: number, extra: Partial<InningsCard> = {}): InningsCard => ({
  n, team, teamId: team, runs, wkts, balls: 120, deliveries: 124, overs: '20.0', super: false, declared: false, extras: { wd: 0, nb: 0, b: 0, lb: 0, pen: 0 },
  targetRuns: null, targetOvers: null, penaltyPre: 0, penaltyPost: 0, batters: [], bowlers: [], didNotBat: [], ...extra,
});
function make(over: Partial<MatchBundle['match']> = {}, innings: InningsCard[] = [inn(1, 'A', 178, 10), inn(2, 'B', 179, 6, { balls: 116, targetRuns: 179, targetOvers: 20 })]): MatchBundle {
  return {
    v: 1,
    match: {
      id: 1, date: '2024-03-12', endDate: null, season: '2024', gender: 'male', format: 'T20', type: 'Intl', kind: 't20', tournament: { key: null, name: 'Illustrative T20', kind: 'league' },
      stage: { name: null, cls: null, group: null }, number: 34, venue: 'V', city: 'C', country: 'K', ballsPerOver: 6, scheduledOvers: 20, teams: [{ name: 'A', id: 'a' }, { name: 'B', id: 'b' }],
      toss: { winner: 'A', decision: 'bat' }, result: { winner: 'B', winnerId: 'b', runs: null, wickets: 4, outcome: null, method: null, eliminator: null, byInnings: false }, potm: [], officials: {}, ...over,
    },
    innings, coverage: { balls: 0, winProb: 0, projected: 0, tracked: 0, positioned: 0, reviews: 0 }, replacements: [],
  };
}

describe('score text', () => {
  it('shows the runs alone when all out, the wickets otherwise, and a declaration', () => {
    expect(scoreText(inn(1, 'A', 178, 10))).toBe('178');
    expect(scoreText(inn(1, 'A', 177, 6))).toBe('177/6');
    expect(scoreText(inn(1, 'A', 312, 6, { declared: true }))).toBe('312/6d');
  });
  it('joins a Test side\'s innings', () => {
    const b = make({ kind: 'test' }, [inn(1, 'A', 312, 6, { declared: true }), inn(2, 'B', 245, 10), inn(3, 'A', 168, 3, { declared: true }), inn(4, 'B', 207, 10)]);
    expect(teamScore(b, 'A')).toBe('312/6d & 168/3d');
    expect(teamScore(b, 'B')).toBe('245 & 207');
  });
});

describe('sides', () => {
  it('puts the side that batted first on the left', () => {
    expect(sides(make())).toEqual(['A', 'B']);
    expect(sides(make({}, [inn(1, 'B', 100, 10), inn(2, 'A', 101, 3)]))).toEqual(['B', 'A']);
  });
  it('keeps the data order when there are no innings', () => {
    expect(sides(make({}, []))).toEqual(['A', 'B']);
  });
});

describe('result text', () => {
  it('names a chase win with the balls left', () => {
    expect(resultText(make())).toBe('B won by 4 wickets, with 4 balls left');
  });
  it('does not claim balls left for a side that batted first', () => {
    expect(resultText(make({ result: { winner: 'A', winnerId: 'a', runs: 28, wickets: null, outcome: null, method: null, eliminator: null, byInnings: false } }))).toBe('A won by 28 runs');
  });
  it('counts balls left in The Hundred from 100 balls', () => {
    const b = make({ kind: 'hundred', ballsPerOver: 5, scheduledOvers: 20 }, [inn(1, 'A', 156, 7, { balls: 100 }), inn(2, 'B', 157, 6, { balls: 96, targetOvers: 20 })]);
    expect(ballsLeft(b)).toBe(4);
    expect(resultText(b)).toBe('B won by 4 wickets, with 4 balls left');
  });
  it('uses the revised overs of a chase', () => {
    const b = make({ result: { winner: 'B', winnerId: 'b', runs: null, wickets: 3, outcome: null, method: 'D/L', eliminator: null, byInnings: false } },
      [inn(1, 'A', 287, 6, { balls: 300 }), inn(2, 'B', 251, 7, { balls: 240, targetOvers: 42 })]);
    expect(ballsLeft(b)).toBe(12);
    expect(resultText(b)).toContain('(DLS method)');
  });
  it('says the singular', () => {
    expect(resultText(make({ result: { winner: 'A', winnerId: 'a', runs: 1, wickets: null, outcome: null, method: null, eliminator: null, byInnings: false } }))).toBe('A won by 1 run');
    expect(resultText(make({ result: { winner: 'B', winnerId: 'b', runs: null, wickets: 1, outcome: null, method: null, eliminator: null, byInnings: false } }, [inn(1, 'A', 100, 10), inn(2, 'B', 101, 9, { balls: 120, targetOvers: 20 })]))).toBe('B won by 1 wicket');
  });
  it('covers an innings win, a draw, a tie with a Super Over, no result and an award', () => {
    expect(resultText(make({ kind: 'test', result: { winner: 'A', winnerId: 'a', runs: 63, wickets: null, outcome: null, method: null, eliminator: null, byInnings: true } }))).toBe('A won by an innings and 63 runs');
    expect(resultText(make({ result: { winner: null, winnerId: null, runs: null, wickets: null, outcome: 'draw', method: null, eliminator: null, byInnings: false } }))).toBe('Match drawn');
    const tied = make({ result: { winner: null, winnerId: null, runs: null, wickets: null, outcome: 'tie', method: null, eliminator: 'B', byInnings: false } }, [inn(1, 'A', 178, 10), inn(2, 'B', 178, 7), inn(3, 'B', 20, 0, { super: true })]);
    expect(resultText(tied)).toBe('Match tied. B won the Super Over');
    expect(winningSide(tied)).toBe('B');
    expect(resultText(make({ result: { winner: null, winnerId: null, runs: null, wickets: null, outcome: 'no result', method: null, eliminator: null, byInnings: false } }))).toBe('No result');
    expect(resultText(make({ result: { winner: 'A', winnerId: 'a', runs: null, wickets: null, outcome: null, method: 'Awarded', eliminator: null, byInnings: false } }))).toBe('A awarded the match');
  });
  it('says eliminator when a tie had no Super Over innings', () => {
    expect(resultText(make({ result: { winner: null, winnerId: null, runs: null, wickets: null, outcome: 'tie', method: null, eliminator: 'B', byInnings: false } }))).toBe('Match tied. B won the eliminator');
  });
});

describe('the line under the strip', () => {
  it('names the format in the short form', () => {
    expect(formatTag(make({ type: 'Fran(IPL)' }))).toBe('T20');
    expect(formatTag(make({ type: 'Intl' }))).toBe('T20I');
    expect(formatTag(make({ kind: 'test' }))).toBe('Test');
    expect(formatTag(make({ kind: 'odi' }))).toBe('ODI');
    expect(formatTag(make({ kind: 'hundred' }))).toBe('The Hundred');
  });
  it('says the competition, match, format, ground and date, and the format once', () => {
    const m = make({ venue: 'Narendra Modi Stadium', city: 'Ahmedabad', date: '2023-05-29' });
    expect(stripContext(m)).toBe('Illustrative T20, match 34 \u00A0|\u00A0 T20I \u00A0|\u00A0 Narendra Modi Stadium, Ahmedabad, 29 May 2023');
    const bare = make({ number: null, tournament: { key: null, name: null, kind: null }, venue: 'Ground', city: 'Ground', date: '2023-05-29' });
    expect(stripContext(bare)).toBe('T20 International \u00A0|\u00A0 Ground, 29 May 2023');
    const hundred = make({ kind: 'hundred', tournament: { key: 'h', name: 'The Hundred', kind: 'league' }, number: 5, venue: 'Ground', city: 'Ground', date: '2023-05-29' });
    expect(stripContext(hundred)).toBe('The Hundred, match 5 \u00A0|\u00A0 Ground, 29 May 2023');
  });
  it('splits the strip at the competition name only when the competition has a page', () => {
    const ipl = make({ tournament: { key: 'ipl', name: 'Indian Premier League', kind: 'league' }, number: 1, venue: 'Ground', city: 'Ground', date: '2023-05-29' });
    const link = stripLink(ipl)!;
    expect(link.key).toBe('ipl');
    expect(link.name + link.rest).toBe(stripContext(ipl));
    // a small event with no page, and a match with no competition, stay one piece of text
    expect(stripLink(make({ tournament: { key: 'some-tri-series', name: 'A tri-series', kind: 'bilateral' } }))).toBeNull();
    expect(stripLink(make({ tournament: { key: null, name: null, kind: null } }))).toBeNull();
  });
});

describe('legend and card', () => {
  it('writes the title of the match', () => {
    expect(titleText(make())).toBe('Illustrative T20, match 34');
    const bare = make({ number: null, toss: { winner: null, decision: null }, tournament: { key: null, name: null, kind: null } });
    expect(titleText(bare)).toBe('T20 International');
    expect(titleText({ ...bare, match: { ...bare.match, kind: 'test' } })).toBe('Test match');
    expect(titleText({ ...bare, match: { ...bare.match, type: 'Fran(BBL)' } })).toBe('T20 match');
    expect(titleText({ ...bare, match: { ...bare.match, number: 3, kind: 'odi' } })).toBe('One Day International, match 3');
    expect(tossOf(bare)).toBeNull();
  });
  it('names the side that won the toss', () => {
    expect(tossOf(make())).toEqual({ team: 'A', decision: 'bat' });
  });
  it('marks who came in and who went out, by id then by name, and skips a role change', () => {
    const b = make();
    b.replacements = [
      { kind: 'match', reason: 'impact_player', team: 'A', role: null, innings: 2, delivery: 1, playerIn: 'In Man', playerInId: 'i1', playerOut: 'Out Man', playerOutId: 'o1' },
      { kind: 'match', reason: 'supersub', team: 'B', role: null, innings: 1, delivery: 5, playerIn: 'Sub B', playerInId: null, playerOut: 'Gone B', playerOutId: null },
      { kind: 'role', reason: 'injury', team: null, role: 'bowler', innings: 1, delivery: 9, playerIn: 'Cover', playerInId: 'c1', playerOut: 'Hurt', playerOutId: 'h1' },
    ];
    const marks = subMarks(b);
    expect(subMarkOf(marks, 'i1', 'x')).toEqual({ dir: 'in', title: 'Came in for Out Man (impact player)' });
    expect(subMarkOf(marks, 'o1', 'x')).toEqual({ dir: 'out', title: 'Replaced by In Man (impact player)' });
    expect(subMarkOf(marks, null, 'Sub B')?.dir).toBe('in');
    expect(subMarkOf(marks, null, 'Gone B')?.title).toBe('Replaced by Sub B (supersub)');
    expect(subMarkOf(marks, 'c1', 'Cover')).toBeUndefined();
  });
  it('gives the days of a Test', () => {
    expect(daysText({ ...make().match, date: '2024-03-12', endDate: '2024-03-16' })).toBe('Five days');
    expect(daysText({ ...make().match, endDate: null })).toBe('');
  });
  it('labels an innings with its overs, its balls in The Hundred, or its place in a Test', () => {
    const h = make({ kind: 'hundred' }, [inn(1, 'A', 1, 1, { balls: 98 }), inn(2, 'B', 1, 1)]);
    expect(inningsLabel(h, h.innings[0]!)).toBe('98 balls');
    expect(inningsLabel(make(), make().innings[0]!)).toBe('20.0 ov');
    const t = make({ kind: 'test' }, [inn(1, 'A', 1, 1), inn(2, 'B', 1, 1), inn(3, 'A', 1, 1)]);
    expect(inningsLabel(t, t.innings[2]!)).toBe('3rd Innings, 20.0 ov');
  });
  it('says when a side followed on', () => {
    const t = make({ kind: 'test' }, [inn(1, 'A', 450, 8), inn(2, 'B', 190, 10), inn(3, 'B', 270, 10), inn(4, 'A', 11, 0)]);
    expect(followOn(t)).toBe('B');
    expect(inningsLabel(t, t.innings[2]!)).toBe('3rd Innings (f/o), 20.0 ov');
    expect(inningsLabel(t, t.innings[1]!)).toBe('2nd Innings, 20.0 ov');
    const plain = make({ kind: 'test' }, [inn(1, 'A', 450, 8), inn(2, 'B', 190, 10), inn(3, 'A', 200, 3), inn(4, 'B', 100, 10)]);
    expect(followOn(plain)).toBeNull();
    expect(inningsLabel(plain, plain.innings[2]!)).toBe('3rd Innings, 20.0 ov');
    expect(followOn(make())).toBeNull();
  });
  it('tags the revised chase with DLS', () => {
    const b = make({ result: { winner: 'B', winnerId: 'b', runs: null, wickets: 3, outcome: null, method: 'D/L', eliminator: null, byInnings: false } }, [inn(1, 'A', 287, 6), inn(2, 'B', 251, 7)]);
    expect(inningsLabel(b, b.innings[1]!)).toBe('20.0 ov, DLS');
    expect(inningsLabel(b, b.innings[0]!)).toBe('20.0 ov');
  });
  it('lists each Super Over round', () => {
    const b = make({}, [inn(1, 'A', 1, 1), inn(2, 'B', 1, 1), inn(3, 'B', 15, 1, { super: true }), inn(4, 'A', 16, 0, { super: true }), inn(5, 'A', 8, 2, { super: true }), inn(6, 'B', 9, 0, { super: true })]);
    expect(superOverLines(b)).toEqual(['B 15/1, A 16/0', 'A 8/2, B 9/0']);
    expect(superOverLines(make())).toEqual([]);
  });
});

describe('top performers', () => {
  const first = inn(1, 'A', 178, 10, { batters: [bat('a1', 30, 20), bat('a2', 64, 41), bat('a3', 64, 38, false), bat('a4', 0, 0, false), bat('a5', 5, 5)], bowlers: [bowl('b1w', 2, 30), bowl('b2w', 3, 34), bowl('b3w', 3, 20, 18)] });
  it('ranks the batters of an innings by runs then fewer balls, and keeps not outs', () => {
    expect(inningsBatters(first, 3)).toEqual([{ id: null, name: 'a3', runs: 64, balls: 38, notOut: true }, { id: null, name: 'a2', runs: 64, balls: 41, notOut: false }, { id: null, name: 'a1', runs: 30, balls: 20, notOut: false }]);
  });
  it('ranks the bowlers of an innings by wickets, then fewer runs', () => {
    expect(inningsBowlers(first, 2)).toEqual([{ id: null, name: 'b3w', wkts: 3, runs: 20, balls: 18 }, { id: null, name: 'b2w', wkts: 3, runs: 34, balls: 24 }]);
  });
  it('writes the player of the match with their own figures', () => {
    const c = make({ potm: [{ name: 'a3 name', id: 'p3' }] }, [inn(1, 'A', 1, 1, { batters: [{ ...bat('a3 name', 64, 38, false), id: 'p3' }], bowlers: [] }), inn(2, 'B', 1, 1, { batters: [], bowlers: [{ ...bowl('a3 name', 2, 30), id: 'p3' }] })]);
    expect(potm(c)).toEqual({ names: 'a3 name', figures: '64* off 38; 2-30' });
    expect(potm(make())).toBeNull();
  });
});

describe('dates, banner and revised chase', () => {
  const test = (date: string, endDate: string | null) => make({ kind: 'test', date, endDate, venue: 'Edgbaston', city: 'Birmingham' });
  it('writes the dates of a Test as a range', () => {
    expect(datesText(test('2026-09-09', '2026-09-12').match)).toBe('9 to 12 Sep 2026');
    expect(datesText(test('2026-09-30', '2026-10-03').match)).toBe('30 Sep to 3 Oct 2026');
    expect(datesText(test('2025-12-30', '2026-01-03').match)).toBe('30 Dec 2025 to 3 Jan 2026');
    expect(datesText(test('2026-09-09', null).match)).toBe('9 Sep 2026');
  });
  it('gives the banner two lines, with the length of a Test only for a Test', () => {
    expect(bannerLines(test('2026-09-09', '2026-09-12'))).toEqual(['Illustrative T20, match 34 \u00A0|\u00A0 Four days', 'Edgbaston, Birmingham, 9 to 12 Sep 2026']);
    expect(bannerLines(make({ date: '2023-05-29', endDate: '2023-05-29', venue: 'V', city: 'C' }))).toEqual(['Illustrative T20, match 34', 'V, C, 29 May 2023']);
  });
  it('tells the revised target on the chasing side only', () => {
    const b = make({ result: { winner: 'B', winnerId: 'b', runs: null, wickets: 3, outcome: null, method: 'D/L', eliminator: null, byInnings: false } }, [inn(1, 'A', 287, 6), inn(2, 'B', 251, 7, { targetRuns: 251, targetOvers: 42 })]);
    expect(dlsTip(b, b.innings[1]!)).toBe('Target 251 from 42 overs, revised for rain (DLS)');
    expect(dlsTip(b, b.innings[0]!)).toBeNull();
    expect(dlsTip(make(), make().innings[1]!)).toBeNull();
  });
});

describe('bowled and place', () => {
  it('writes overs bowled, and balls in The Hundred', () => {
    expect(bowledText(make(), 24)).toBe('4');
    expect(bowledText(make(), 20)).toBe('3.2');
    expect(bowledText(make({ kind: 'hundred', ballsPerOver: 5 }), 20)).toBe('20');
  });
  it('writes the ground and the date, without repeating the city', () => {
    expect(placeLine(make({ venue: 'Narendra Modi Stadium', city: 'Ahmedabad', date: '2023-05-29' }))).toBe('Narendra Modi Stadium, Ahmedabad, 29 May 2023');
    expect(placeLine(make({ venue: 'Kensington Oval, Bridgetown', city: 'Bridgetown', date: '2023-05-29' }))).toBe('Kensington Oval, Bridgetown, 29 May 2023');
    expect(placeLine(make({ venue: null, city: null, date: '2023-05-29' }))).toBe('29 May 2023');
  });
});

describe('match slugs', () => {
  it('reads as the sides, the date and the id, and round-trips', () => {
    const slug = matchSlug('Royal Challengers Bengaluru', 'Kolkata Knight Riders', '2008-04-18', 335982);
    expect(slug).toBe('royal-challengers-bengaluru-v-kolkata-knight-riders-2008-04-18-335982');
    expect(matchIdFromSlug(slug)).toBe(335982);
  });
  it('accepts a bare id and rejects text', () => {
    expect(matchIdFromSlug('335982')).toBe(335982);
    expect(matchIdFromSlug('a-v-b')).toBeNull();
    expect(matchIdFromSlug('')).toBeNull();
  });
});
