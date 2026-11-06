import { describe, expect, it } from 'vitest';
import { applyFilters, batFirstSplit, chooseCompetition, counts, currentRun, defaultFilters, editions, formatOptions, indexInnings, keyNumbers, knockoutGroups, longestRun, normaliseFilters, opponentRows, seasonRows, sortOpponents, tossSummary, trophyRows, type Result, type TeamInnings, type TeamMatch } from '../team';
import { groupMatches, tallyText } from '../teamMatches';
import { bestFigures, fielders, leaderLists, minMatches, squad, usedGrid, usedRows } from '../teamPlayers';
import { extrasConceded, fieldingKey, phaseCards, reviewSummary, styleSplit, wicketWays } from '../teamBBF';
import type { TeamPlayerRow } from '../team';

let next = 1;
const match = (o: Partial<TeamMatch> = {}): TeamMatch => ({
  id: next++, date: '2024-01-01', season: '2023/24', year: 2024, format: 'ODI', kind: 'odi', tk: null, tname: null, tkind: 'bilateral', league: false, event: 'A tour of B', edition: null,
  stageClass: null, stageName: null, venue: 'G1', city: 'C', country: 'Country B', opp: 'B', oppId: 'b|intl|male', tossWon: true, tossDecision: 'bat', result: 'won', tied: false, byRuns: 10, byWkts: null, byInnings: false,
  scheduledOvers: 50, batFirst: true, potmId: null, potm: null, tracked: 0, trackedOf: 100, dropped: 0, ...o,
});
const inn = (matchId: number, side: 'for' | 'against', runs: number, o: Partial<TeamInnings> = {}): TeamInnings => ({
  matchId, inn: side === 'for' ? 1 : 2, side, superOver: false, runs, wkts: 10, balls: 300, wides: 0, noballs: 0, byes: 0, legbyes: 0, penalty: 0, fours: 0, sixes: 0, declared: false, ...o,
});
const results = (list: Result[], o: Partial<TeamMatch> = {}): TeamMatch[] => list.map((result, i) => match({ result, date: `2024-01-${String(i + 1).padStart(2, '0')}`, ...o }));

describe('results', () => {
  it('win rate is wins over matches with a result; a no result is left out, a draw is not a win', () => {
    const c = counts(results(['won', 'won', 'lost', 'draw', 'nr', 'tie']));
    expect(c).toMatchObject({ played: 6, won: 2, lost: 1, draw: 1, tie: 1, nr: 1, other: 3 });
    expect(c.rate).toBeCloseTo(2 / 5, 6);
    expect(counts([]).rate).toBeNull();
  });
  it('runs: the one at the end and the longest', () => {
    const ms = results(['won', 'won', 'won', 'lost', 'lost']);
    expect(currentRun(ms)).toEqual({ result: 'lost', length: 2 });
    expect(longestRun(ms, 'won')).toBe(3);
    expect(currentRun([])).toBeNull();
  });
  it('seasons for a national team are calendar years', () => {
    const rows = seasonRows([match({ year: 2023, season: '2022/23' }), match({ year: 2024 }), match({ year: 2024, result: 'lost' })], true);
    expect(rows.map((r) => [r.season, r.played, r.won, r.lost])).toEqual([['2023', 1, 1, 0], ['2024', 2, 1, 1]]);
    expect(seasonRows([match({ season: '2022/23' })], false)[0]!.season).toBe('2022/23');
  });
  it('key numbers: biggest wins, highest and the lowest all-out total', () => {
    const a = match({ byRuns: 120 }), b = match({ byRuns: null, byWkts: 9 }), c = match({ result: 'lost', byRuns: 5 });
    const innings = indexInnings([inn(a.id, 'for', 320), inn(b.id, 'for', 150, { wkts: 1 }), inn(c.id, 'for', 80)]);
    const k = keyNumbers([a, b, c], innings, 2);
    expect(k.highest).toMatchObject({ runs: 320, matchId: a.id });
    expect(k.lowest).toMatchObject({ runs: 80, matchId: c.id });
    expect(k.bigRuns?.text).toBe('120 runs');
    expect(k.bigWkts?.text).toBe('9 wickets');
    expect(k.titles).toBe(2);
  });
  it('bat first or chase: limited overs split the results, a Test has draws', () => {
    const w = match({ batFirst: true }), l = match({ batFirst: false, result: 'lost' });
    const t = match({ kind: 'test', format: 'TEST', batFirst: true, result: 'draw' });
    const innings = indexInnings([inn(w.id, 'for', 300), inn(l.id, 'for', 200), inn(t.id, 'for', 400)]);
    const s = batFirstSplit([w, l, t], innings);
    expect(s.limited.map((r) => [r.label, r.played, r.won, r.lost])).toEqual([['Batting first', 1, 1, 0], ['Chasing', 1, 0, 1]]);
    expect(s.limited[0]!.avgScore).toBe(300);
    expect(s.tests[0]).toMatchObject({ label: 'Batted first', played: 1, draw: 1 });
  });
  it('toss: four cases, and a match with no toss record is left out', () => {
    const ms = [match({ tossWon: true, tossDecision: 'bat' }), match({ tossWon: true, tossDecision: 'field', result: 'lost' }), match({ tossWon: false, batFirst: true }), match({ tossWon: false, batFirst: false }), match({ tossWon: null })];
    const t = tossSummary(ms, indexInnings([]));
    expect(t.tosses).toBe(4);
    expect(t.won).toBe(2);
    expect(t.batShare).toBe(0.5);
    expect(t.cases.map((c) => c.played)).toEqual([1, 1, 1, 1]);
  });
  it('opponents: sorted by matches, small samples marked', () => {
    const ms = [...results(['won', 'lost', 'won', 'won', 'won', 'won'], { opp: 'X', oppId: 'x' }), match({ opp: 'Y', oppId: 'y' })];
    const rows = sortOpponents(opponentRows(ms));
    expect(rows.map((r) => [r.name, r.played, r.small])).toEqual([['X', 6, false], ['Y', 1, true]]);
    expect(sortOpponents(opponentRows(ms), { key: 'name', dir: 1 })[0]!.name).toBe('X');
  });
});

describe('scope', () => {
  const intl = [match({ format: 'TEST', kind: 'test' }), match({ format: 'TEST', kind: 'test' }), match({}), match({ format: 'T20', kind: 't20' })];
  const league = [match({ format: 'T20', kind: 't20', league: true, tk: 'ipl', tname: 'IPL', tkind: 'league', edition: 'ipl|2024|male' }), match({ format: 'T20', kind: 't20', league: true, tk: 'ipl', tname: 'IPL', tkind: 'league', edition: 'ipl|2024|male' })];
  it('opens a national team on its busiest format, a league team on its league', () => {
    expect(defaultFilters(intl)?.format).toBe('TEST');
    expect(defaultFilters(league)).toMatchObject({ format: 'LEAGUE', competition: 'ipl' });
    expect(defaultFilters([])).toBeNull();
  });
  it('lists International with two formats, and League only as a disabled choice', () => {
    expect(formatOptions(intl, 'TEST').map((o) => o.format)).toEqual(['INTERNATIONAL', 'TEST', 'ODI', 'T20I']);
    expect(formatOptions(league, 'LEAGUE').map((o) => [o.format, o.disabled])).toEqual([['LEAGUE', true]]);
  });
  it('filters by format, opponent and venue, and drops a choice with no matches', () => {
    const f = { format: 'TEST' as const, competition: null, season: null, opponent: null, venue: null };
    expect(applyFilters(intl, f, true)).toHaveLength(2);
    expect(normaliseFilters(intl, { ...f, opponent: 'nobody' }, true)?.opponent).toBeNull();
    expect(normaliseFilters(intl, { ...f, venue: 'G1' }, true)?.venue).toBe('G1');
  });
  it('choosing a league competition sets League', () => {
    expect(chooseCompetition([...intl, ...league], { format: 'TEST', competition: null, season: '2024', opponent: null, venue: null }, 'ipl')).toMatchObject({ format: 'LEAGUE', competition: 'ipl', season: null });
  });
});

describe('trophies and knockouts', () => {
  const ed = 't20-world-cup-male|2024|male';
  const t = (o: Partial<TeamMatch>): TeamMatch => match({ tk: 't20-world-cup-male', tname: 'T20 World Cup', tkind: 'tournament', edition: ed, format: 'T20', kind: 't20', ...o });
  it('the champion is the winner of the Final, the runner-up its loser', () => {
    const won = editions([t({ date: '2024-06-01' }), t({ stageClass: 'knockout', stageName: 'Semi Final', date: '2024-06-20' }), t({ stageClass: 'knockout', stageName: 'Final', date: '2024-06-29' })]);
    expect(won[0]).toMatchObject({ result: 'champion', stage: 'Final' });
    const lost = editions([t({ stageClass: 'knockout', stageName: 'Final', result: 'lost' })]);
    expect(lost[0]!.result).toBe('runner-up');
    const out = editions([t({}), t({ stageClass: 'knockout', stageName: 'Semi Final', result: 'lost' })]);
    expect(out[0]).toMatchObject({ result: 'other', stage: 'Semi Final' });
  });
  it('bilateral series and small events are not trophies', () => {
    expect(editions([match({}), t({ tkind: 'small' })])).toHaveLength(0);
  });
  it('trophy rows count titles and lost finals', () => {
    const eds = editions([t({ stageClass: 'knockout', stageName: 'Final' }), t({ edition: 'x|2022|male', stageClass: 'knockout', stageName: 'Final', result: 'lost', season: '2022' })]);
    const rows = trophyRows(eds);
    expect(rows[0]).toMatchObject({ titles: 1, finalsLost: 1 });
  });
  it('knockout groups are newest first with the outcome of the edition', () => {
    const g = knockoutGroups([t({ stageClass: 'knockout', stageName: 'Semi Final', date: '2024-06-20' }), t({ stageClass: 'knockout', stageName: 'Final', date: '2024-06-29' })]);
    expect(g).toHaveLength(1);
    expect(g[0]!.outcome).toBe('Champion');
    expect(g[0]!.matches.map((m) => m.stageName)).toEqual(['Semi Final', 'Final']);
  });
});

describe('the Matches tile', () => {
  it('splits a tour by format and tallies the series', () => {
    const tests = results(['won', 'won', 'lost'], { format: 'TEST', kind: 'test', event: 'B tour of A', date: '2024-02-01' });
    const odis = results(['won', 'lost'], { event: 'B tour of A', date: '2024-03-01' });
    const g = groupMatches([...tests, ...odis], 'A', true);
    expect(g).toHaveLength(1);
    expect(g[0]!.series.map((s) => [s.subtitle, s.result])).toEqual([['2 ODIs v B', 'Series level 1-1'], ['3 Tests v B', 'A won 2-1']]);
  });
  it('a tally words draws and a single match', () => {
    expect(tallyText('India', 'England', counts(results(['won', 'draw', 'draw'])))).toBe('India won 1-0, 2 drawn');
    expect(tallyText('India', 'England', counts(results(['lost'])))).toBe('England won');
  });
  it('a league team has one line for a season', () => {
    const ms = results(['won', 'lost', 'won'], { league: true, tk: 'ipl', tname: 'IPL', tkind: 'league', edition: 'ipl|2024|male', season: '2024', format: 'T20', kind: 't20' });
    const g = groupMatches(ms, 'MI', false);
    expect(g[0]!.series).toHaveLength(1);
    expect(g[0]!.series[0]).toMatchObject({ kind: 'league', tournament: 'ipl' });
  });
});

const prow = (o: Partial<TeamPlayerRow>): TeamPlayerRow => ({
  matchId: 1, date: '2024-01-01', id: 'p1', name: 'P One', named: true, batInns: 0, runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0, high: 0, fifties: 0, hundreds: 0, ducks: 0,
  bowlInns: 0, bowlBalls: 0, conceded: 0, wkts: 0, maidens: 0, fivefers: 0, bestWkts: 0, bestRuns: 0, catches: 0, stumpings: 0, runOuts: 0, potm: false, ...o,
});

describe('players', () => {
  it('a named player is used when the side named eleven or fewer, or when they took part', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => prow({ id: `a${i}` }));
    expect([...usedRows(eleven).values()].every(Boolean)).toBe(true);
    const twelve = [...eleven, prow({ id: 'sub' }), prow({ id: 'bat', batInns: 1 })];
    const u = usedRows(twelve);
    expect(u.get('1|sub')).toBe(false);
    expect(u.get('1|bat')).toBe(true);
  });
  it('squad totals, a substitute fielder is not a player used but is a fielder', () => {
    const ms = [match({ id: 100 })];
    const rows = [prow({ matchId: 100, id: 'x', batInns: 1, runs: 50, balls: 40, outs: 1, high: 50, catches: 1 }), prow({ matchId: 100, id: 's', named: false, catches: 2 })];
    const s = squad(rows, ms);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: 'x', runs: 50, average: 50, strikeRate: 125, catches: 1 });
    expect(fielders(rows, ms).map((f) => [f.id, f.total])).toEqual([['x', 1], ['s', 2]]);
  });
  it('the qualifying line is a tenth of the matches, never under five and never above the matches there are', () => {
    expect(minMatches(219)).toBe(22);
    expect(minMatches(291)).toBe(30);
    expect(minMatches(30)).toBe(5);
    expect(minMatches(3)).toBe(3);
    expect(minMatches(0)).toBe(0);
  });
  it('leaders: lower is better for economy and bowling average', () => {
    const ms = [match({ id: 7, kind: 't20', format: 'T20' })];
    const rows = [
      prow({ matchId: 7, id: 'a', name: 'A', bowlInns: 1, bowlBalls: 120, conceded: 120, wkts: 4 }),
      prow({ matchId: 7, id: 'b', name: 'B', bowlInns: 1, bowlBalls: 120, conceded: 180, wkts: 6 }),
    ];
    const l = leaderLists(squad(rows, ms), ms);
    expect(l.economy.map((x) => x.id)).toEqual(['a', 'b']);
    expect(l.wickets.map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('best figures keep the runs of the best innings', () => {
    const ms = [match({ id: 9 })];
    expect(bestFigures([prow({ matchId: 9, bestWkts: 5, bestRuns: 23 })], ms)[0]!.text).toBe('5/23');
  });
  it('the grid counts matches used in each season, with debuts', () => {
    const ms = [match({ id: 1, year: 2023 }), match({ id: 2, year: 2024 })];
    const rows = [prow({ matchId: 1, id: 'a' }), prow({ matchId: 2, id: 'a' }), prow({ matchId: 2, id: 'b', name: 'B' })];
    const g = usedGrid(rows, ms, true);
    expect(g.seasons).toEqual(['2023', '2024']);
    expect(g.rows[0]).toMatchObject({ id: 'a', total: 2, cells: [1, 1] });
    expect(g.perSeason).toEqual([1, 2]);
    expect(g.debuts).toEqual([1, 1]);
  });
});

describe('bat, bowl and field', () => {
  const ms = [match({ id: 1, kind: 't20', format: 'T20', gender: undefined } as Partial<TeamMatch>)];
  it('phase cards: strike rate, economy and the average side off the same balls', () => {
    const rows = [{ matchId: 1, inn: 1, side: 'for' as const, phase: 'powerplay', runs: 60, balls: 36, wkts: 1, boundaries: 8, dots: 12 }, { matchId: 1, inn: 2, side: 'against' as const, phase: 'powerplay', runs: 30, balls: 36, wkts: 2, boundaries: 3, dots: 20 }];
    const avgs = [{ kind: 't20' as const, league: false, gender: 'male' as const, phase: 'powerplay', runs: 120, balls: 100, wkts: 5, boundaries: 15, dots: 40 }];
    const bat = phaseCards(rows, ms, 'for', avgs, 'male')[0]!;
    expect(bat.rate).toBeCloseTo(166.67, 1);
    expect(bat.average).toBeCloseTo(120, 6);
    expect(bat.boundaryShare).toBeCloseTo(8 / 36, 6);
    const bowl = phaseCards(rows, ms, 'against', avgs, 'male')[0]!;
    expect(bowl.rate).toBeCloseTo(5, 6);
    expect(bowl.name).toBe('Powerplay');
    expect(phaseCards(rows, [], 'for', avgs, 'male')).toEqual([]);
  });
  it('pace and spin split', () => {
    const s = styleSplit([{ matchId: 1, group: 'pace', balls: 60, conceded: 60, wkts: 2 }, { matchId: 1, group: 'spin', balls: 60, conceded: 90, wkts: 1 }], ms);
    expect(s.map((x) => [x.group, x.share, x.economy])).toEqual([['pace', 0.5, 6], ['spin', 0.5, 9]]);
  });
  it('wickets taken and lost by way, caught and bowled joins caught', () => {
    const w = wicketWays([{ matchId: 1, inn: 1, side: 'for', type: 'caught', n: 3 }, { matchId: 1, inn: 1, side: 'for', type: 'caught and bowled', n: 1 }, { matchId: 1, inn: 1, side: 'against', type: 'hit wicket', n: 1 }], ms);
    expect(w.ways.find((x) => x.key === 'caught')!.taken).toBe(4);
    expect(w.ways.find((x) => x.key === 'other')!.lost).toBe(1);
    expect(w.taken).toBe(4);
  });
  it('dropped catches are hidden when tracking covers under 30% of the matches', () => {
    const tracked = match({ id: 5, trackedOf: 100, tracked: 90, dropped: 2 }), plain = match({ id: 6, trackedOf: 100, tracked: 0 });
    const field = [{ matchId: 5, catches: 3, stumpings: 0, runOuts: 1 }, { matchId: 6, catches: 2, stumpings: 1, runOuts: 0 }];
    const few = fieldingKey(field, [], [tracked, plain, match({ id: 7 }), match({ id: 8 })]);
    expect(few.dropped).toBeNull();
    const many = fieldingKey(field, [{ matchId: 5, inn: 1, side: 'for', type: 'caught', n: 4 }], [tracked, plain]);
    expect(many.dropped).toBe(2);
    expect(many.droppedShare).toBeCloseTo(2 / 5, 6);
    expect(many.involved).toBeCloseTo(7 / 4, 6);
  });
  it('reviews: the team\'s own, split by batting and fielding, upheld is a success', () => {
    const rv = [
      { matchId: 1, inn: 1, ball: 4, byTeam: true, batting: false, decision: 'upheld', type: null, umpiresCall: false },
      { matchId: 1, inn: 1, ball: 9, byTeam: true, batting: false, decision: 'struck down', type: null, umpiresCall: true },
      { matchId: 1, inn: 2, ball: 2, byTeam: false, batting: false, decision: 'upheld', type: null, umpiresCall: null },
    ];
    const r = reviewSummary(rv, [match({ id: 1 }), match({ id: 2 })]);
    expect(r.matchesWithData).toBe(1);
    expect(r.fielding).toMatchObject({ taken: 2, successful: 1, umpiresCall: 1, rate: 0.5 });
    expect(r.batting.taken).toBe(0);
    expect(r.against).toBe(1);
  });
  it('extras conceded come from the other side\'s innings, Super Overs left out', () => {
    const m = match({ id: 1, year: 2024 });
    const innings = indexInnings([inn(1, 'against', 200, { wides: 5, noballs: 1, byes: 2, legbyes: 3 }), inn(1, 'against', 10, { superOver: true, wides: 9 }), inn(1, 'for', 250, { wides: 20 })]);
    const e = extrasConceded(innings, [m], true);
    expect(e.all).toMatchObject({ innings: 1, wides: 5, noballs: 1, byes: 2, legbyes: 3, total: 11 });
    expect(e.seasons[0]!.season).toBe('2024');
  });
});

import { competitionChips, findTeams, INTERNATIONAL, type TeamHit } from '../teamSearch';

describe('team search chips', () => {
  const t = (name: string, gender: 'male' | 'female', national: boolean, league: string | null, matches = 10): TeamHit => ({ id: `${name}|x|${gender}`, name, gender, national, matches, firstYear: 2000, lastYear: 2026, league });
  const teams = [t('India', 'male', true, null, 900), t('India', 'female', true, null, 300), t('Mumbai Indians', 'male', false, 'IPL'), t('Delhi Capitals', 'female', false, 'WPL'), t('Delhi Capitals', 'male', false, 'IPL'), t('Sydney Sixers', 'male', false, 'BBL')];
  it('chips: International first, then leagues by how many teams, dimmed when the gender has none', () => {
    const all = competitionChips(teams, 'all');
    expect(all.map((c) => c.name)).toEqual([INTERNATIONAL, 'IPL', 'BBL', 'WPL']);
    const women = competitionChips(teams, 'women');
    expect(women.find((c) => c.name === 'IPL')!.shown).toBe(0);
    expect(women.find((c) => c.name === 'WPL')!.shown).toBe(1);
  });
  it('a chip narrows the list, with the gender and the typed text', () => {
    expect(findTeams('', teams, 'all', 'IPL').map((x) => x.name)).toEqual(['Delhi Capitals', 'Mumbai Indians']);
    expect(findTeams('', teams, 'all', INTERNATIONAL)).toHaveLength(2);
    expect(findTeams('', teams, 'women', 'IPL')).toHaveLength(0);
    expect(findTeams('delhi', teams, 'men', null).map((x) => x.league)).toEqual(['IPL']);
  });
});

import { resultLine } from '../team';
describe('result line', () => {
  it('names draws, ties and no results, and leaves out the ones that did not happen', () => {
    expect(resultLine({ won: 8, lost: 3, draw: 2, tie: 0, nr: 1 })).toBe('8 won, 3 lost, 2 drawn, 1 no result');
    expect(resultLine({ won: 5, lost: 5, draw: 0, tie: 1, nr: 0 })).toBe('5 won, 5 lost, 1 tied');
    expect(resultLine({ won: 1, lost: 0, draw: 0, tie: 0, nr: 0 })).toBe('1 won, 0 lost');
  });
});

describe('outcomes of small events', () => {
  it('a tri-series Final won is Champion and lost is Runner-up, even though it is not a trophy tournament', () => {
    const tri = (o: Partial<TeamMatch>): TeamMatch => match({ tk: 'tri-x', tname: 'A Tri-Series', tkind: 'small', edition: 'tri-x|2014|male', stageClass: 'knockout', stageName: 'Final', ...o });
    expect(knockoutGroups([tri({ result: 'won' })])[0]!.outcome).toBe('Champion');
    expect(knockoutGroups([tri({ result: 'lost' })])[0]!.outcome).toBe('Runner-up');
    const semi = tri({ stageName: 'Semi Final', result: 'lost' });
    expect(knockoutGroups([semi])[0]!.outcome).toBe('Out in the semi final');
  });
  it('a Final with no winner says so', () => {
    const nr = match({ tk: 'tri-x', tname: 'A Tri-Series', tkind: 'small', edition: 'tri-x|2014|male', stageClass: 'knockout', stageName: 'Final', result: 'nr' });
    expect(knockoutGroups([nr])[0]!.outcome).toBe('Final with no winner');
  });
  it('a filter that hides the Final does not change the outcome', () => {
    const final = match({ tk: 'k', tname: 'K', tkind: 'tournament', edition: 'k|2020|male', stageClass: 'knockout', stageName: 'Final', result: 'won', opp: 'Z', oppId: 'z' });
    const semi = match({ tk: 'k', tname: 'K', tkind: 'tournament', edition: 'k|2020|male', stageClass: 'knockout', stageName: 'Semi Final', result: 'won', opp: 'Y', oppId: 'y' });
    expect(knockoutGroups([semi], [semi, final])[0]!.outcome).toBe('Champion');
  });
});
