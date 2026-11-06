import { describe, expect, it } from 'vitest';
import { battingLine, bestIndex, bowlingLine, finalsKind, groupBy, namerFor, sortGroups, spanOf, tournamentType, type StatBat, type StatBowl } from '../fullStats';

const base = { innings: 1, date: '2020-02-03', season: '2019/20', format: 'ODI', tournament_key: null, venue: 'Ground A', team: 'India', opponent: 'Australia', venue_country: 'India', venue_continent: 'Asia', home_away: 'home' as const,
  toss: 'won_bat' as const, result: 'won' as const, team_bat_first: true, team_innings: 1, match_number: 1, stage_class: null, stage_name: null, tournament_kind: 'bilateral', filter_section: null };
const bat = (match_id: number, runs: number, balls: number, is_out = true, o: Partial<StatBat> = {}): StatBat => ({ ...base, match_id, runs, balls, fours: 0, sixes: 0, is_out, position: 3, ...o });
const bowl = (match_id: number, wickets: number, runs: number, balls = 60, o: Partial<StatBowl> = {}): StatBowl => ({ ...base, match_id, wickets, runs, balls, ...o });

describe('batting line', () => {
  it('counts matches, innings, not outs, average and strike rate the way the profile does', () => {
    const l = battingLine([bat(1, 100, 80), bat(1, 20, 30, false, { innings: 3 }), bat(2, 0, 4), bat(3, 55, 60, true)]);
    expect(l).toMatchObject({ mat: 3, inns: 4, no: 1, runs: 175, bf: 174, hundreds: 1, fifties: 1, ducks: 1 });
    expect(l.avg).toBeCloseTo(175 / 3);
    expect(l.sr).toBeCloseTo((175 / 174) * 100);
  });
  it('marks a not out high score and prefers it to an out on the same score', () => {
    expect(battingLine([bat(1, 90, 80, true), bat(2, 90, 70, false)])).toMatchObject({ hs: 90, hsNotOut: true });
    expect(battingLine([bat(1, 91, 80, true), bat(2, 90, 70, false)])).toMatchObject({ hs: 91, hsNotOut: false });
  });
  it('has no average when never out and no rate with no balls', () => {
    const l = battingLine([bat(1, 10, 10, false)]);
    expect(l.avg).toBeNull();
    expect(battingLine([]).sr).toBeNull();
    expect(battingLine([]).hs).toBeNull();
  });
});

describe('bowling line', () => {
  it('works out the best innings, average, economy, strike rate and hauls', () => {
    const l = bowlingLine([bowl(1, 3, 30), bowl(2, 5, 40), bowl(3, 4, 25), bowl(3, 5, 35, 60, { innings: 3 })]);
    expect(l).toMatchObject({ mat: 3, inns: 4, balls: 240, runs: 130, wkts: 17, bbiW: 5, bbiR: 35, four: 1, five: 2 });
    // The best innings is five for 35 and not five for 40: the same wickets, fewer runs.
    expect(l.bbiR).toBe(35);
    expect(l.avg).toBeCloseTo(130 / 17);
    expect(l.econ).toBeCloseTo((130 / 240) * 6);
    expect(l.sr).toBeCloseTo(240 / 17);
  });
  it('counts economy per 5 balls for The Hundred and gives no average without a wicket', () => {
    const l = bowlingLine([bowl(1, 0, 20, 20)], true);
    expect(l.econ).toBeCloseTo(5);
    expect(l.avg).toBeNull();
    expect(l.sr).toBeNull();
  });
});

describe('groups', () => {
  const rows = [bat(1, 10, 10, true, { opponent: 'Pakistan', date: '2019-05-01', season: '2019' }), bat(2, 20, 10, true, { opponent: 'Pakistan', date: '2021-05-01', season: '2021' }), bat(3, 30, 10)];
  it('groups by the opposition', () => {
    const g = groupBy(rows, namerFor('team', { tests: false, kind: 'bat' }));
    expect(g.map((x) => [x.label, x.rows.length])).toEqual([['Pakistan', 2], ['Australia', 1]]);
  });
  it('orders years newest first and gives the span of a group', () => {
    const g = groupBy(rows, namerFor('yr', { tests: false, kind: 'bat' })).sort((a, b) => a.order - b.order);
    expect(g.map((x) => x.label)).toEqual(['2021', '2020', '2019']);
    expect(spanOf(rows)).toBe('2019-2021');
    expect(spanOf([rows[2]!])).toBe('2020');
    expect(spanOf([])).toBeNull();
  });
  it('puts an innings the data has nothing for in a row of its own and names the home split', () => {
    const g = groupBy([bat(1, 1, 1, true, { venue_country: null, home_away: null }), bat(2, 1, 1, true, { home_away: 'neutral' }), bat(3, 1, 1)], namerFor('ha', { tests: false, kind: 'bat' })).sort((a, b) => a.order - b.order);
    expect(g.map((x) => x.label)).toEqual(['Home', 'Neutral', 'Not known']);
    expect(groupBy([bat(1, 1, 1, true, { venue_country: null })], namerFor('ctry', { tests: false, kind: 'bat' })).map((x) => x.label)).toEqual(['Not known']);
  });
  it('splits the toss in two ways', () => {
    const r = [bat(1, 1, 1, true, { toss: 'won_field' }), bat(2, 1, 1, true, { toss: 'lost_bat' }), bat(3, 1, 1, true, { toss: null })];
    expect(groupBy(r, namerFor('toss', { tests: false, kind: 'bat' })).map((x) => x.label).sort()).toEqual(['Lost the toss', 'Not known', 'Won the toss']);
    expect(groupBy(r, namerFor('tosq', { tests: false, kind: 'bat' })).map((x) => x.label).sort()).toEqual(['Lost toss and sent in', 'Not known', 'Won toss and fielded']);
  });
  it('names result and batting sequence for limited overs and for Tests', () => {
    const r = [bat(1, 1, 1, true, { result: 'won', team_bat_first: false }), bat(2, 1, 1, true, { result: 'lost', team_bat_first: true }), bat(3, 1, 1, true, { result: 'draw', team_bat_first: true })];
    expect(groupBy(r, namerFor('rsq', { tests: false, kind: 'bat' })).map((x) => x.label).sort()).toEqual(['Lost batting first', 'Tied or no result', 'Won chasing']);
    expect(groupBy(r, namerFor('rsq', { tests: true, kind: 'bat' })).map((x) => x.label).sort()).toEqual(['Drawn or tied', 'Lost batting first', 'Won batting second']);
  });
  it('words the innings splits for a bowler', () => {
    const r = [bowl(1, 1, 1, 6, { team_innings: 2 })];
    expect(groupBy(r, namerFor('tin', { tests: true, kind: 'bowl' }))[0]!.label).toBe('2nd fielding innings');
    expect(groupBy([bat(1, 1, 1, true, { team_innings: 3 })], namerFor('tin', { tests: true, kind: 'bat' }))[0]!.label).toBe('3rd team innings');
    expect(groupBy([bat(1, 1, 1, true, { innings: 4 })], namerFor('min', { tests: true, kind: 'bat' }))[0]!.label).toBe('4th match innings');
  });
  it('classes tournaments and finals', () => {
    expect(tournamentType({ tournament_kind: 'bilateral', filter_section: null }).label).toBe('Bilateral series');
    expect(tournamentType({ tournament_kind: 'tournament', filter_section: 'World Cups and ICC events' }).label).toBe('ICC events');
    expect(tournamentType({ tournament_kind: 'league', filter_section: 'Leagues' }).label).toBe('Domestic league');
    expect(tournamentType({ tournament_kind: 'small', filter_section: 'Tri-series and regional cups' }).label).toBe('Other tournaments');
    expect(finalsKind({ stage_class: 'knockout', stage_name: 'Final' }).label).toBe('Finals');
    expect(finalsKind({ stage_class: 'knockout', stage_name: 'Semi Final' }).label).toBe('Semi finals');
    expect(finalsKind({ stage_class: 'knockout', stage_name: 'Eliminator' }).label).toBe('Other knockouts');
    expect(finalsKind({ stage_class: null, stage_name: null }).label).toBe('League matches');
  });
  it('names the match number by format and the batting position', () => {
    expect(groupBy([bat(1, 1, 1, true, { match_number: 3 })], namerFor('mno', { tests: true, kind: 'bat' }))[0]!.label).toBe('Test 3');
    expect(groupBy([bat(1, 1, 1, true, { match_number: 3 })], namerFor('mno', { tests: false, kind: 'bat' }))[0]!.label).toBe('Match 3');
    expect(groupBy([bat(1, 1, 1, true, { position: null })], namerFor('pos', { tests: false, kind: 'bat' })).map((x) => x.label)).toEqual(['Not known']);
  });
});

describe('every table adds up to the career row', () => {
  const keys = ['team', 'ctry', 'cont', 'ha', 'grd', 'yr', 'sea', 'toss', 'tosq', 'bfs', 'tin', 'min', 'res', 'rsq', 'trn', 'mno', 'fin', 'pos'] as const;
  const mixed = [bat(1, 10, 10, true, { toss: null, result: null, team_bat_first: null, team_innings: null, match_number: null, venue: null, venue_country: null, venue_continent: null, home_away: null, position: null }),
    bat(2, 20, 15), bat(3, 5, 5, false, { toss: 'lost_field', result: 'draw', match_number: 4, stage_class: 'knockout', stage_name: 'Final', position: 7 })];
  it.each(keys)('%s keeps every innings', (key) => {
    const g = groupBy(mixed, namerFor(key, { tests: false, kind: 'bat' }));
    expect(g.reduce((n, x) => n + x.rows.length, 0)).toBe(mixed.length);
    expect(g.reduce((n, x) => n + battingLine(x.rows).runs, 0)).toBe(35);
  });
});

describe('sorting and the best row', () => {
  const rows = [bat(1, 50, 50), bat(2, 200, 100), bat(3, 10, 5, false)].map((r, i) => ({ group: { label: `G${i}`, order: 0 }, line: battingLine([r]) }));
  it('draws the biggest first and sorts by a column both ways, with no values last', () => {
    expect(sortGroups(rows, null, 'bat').map((x) => x.group.label)).toEqual(['G1', 'G0', 'G2']);
    expect(sortGroups(rows, { key: 'runs', dir: 1 }, 'bat').map((x) => x.group.label)).toEqual(['G2', 'G0', 'G1']);
    expect(sortGroups(rows, { key: 'avg', dir: -1 }, 'bat').map((x) => x.group.label)).toEqual(['G1', 'G0', 'G2']);
    expect(sortGroups(rows, { key: 'avg', dir: 1 }, 'bat').map((x) => x.group.label)).toEqual(['G0', 'G1', 'G2']);
    expect(sortGroups(rows, { key: 'label', dir: -1 }, 'bat').map((x) => x.group.label)).toEqual(['G2', 'G1', 'G0']);
  });
  it('picks the best value and none when fewer than two rows can be compared', () => {
    expect(bestIndex([40, 55, 30], 'max')).toBe(1);
    expect(bestIndex([4.5, 0, 3.2], 'min')).toBe(2);
    expect(bestIndex([40, null], 'max')).toBe(-1);
    expect(bestIndex([], 'max')).toBe(-1);
  });
});
