import { describe, expect, it } from 'vitest';
import type { SummaryRow } from '../batting';
import { canCompareTeams, cardStats, formatRows, groupText, roleTag, sharedCompetitions, suggestOrder, teamCard, teamGroup } from '../compare';
import type { TeamMatch } from '../team';

const row = (format: string, o: Partial<SummaryRow> = {}): SummaryRow => ({
  player_id: 'p', format, tournament_key: null, tournament_name: null, season: '2020', gender: 'male', matches: 5, appearances: 5, innings: 5, runs: 100, balls_faced: 100, fours: 0, sixes: 0,
  fifties: 0, hundreds: 0, ducks: 0, dismissals: 5, high_score: 50, bowling_matches: null, balls_bowled: null, runs_conceded: null, wickets: null, dot_balls: null, ...o,
});

describe('role tags', () => {
  it('reads the dataset roles', () => {
    expect(roleTag('top-order batter')).toBe('Batter');
    expect(roleTag('wicketkeeper batter')).toBe('Batter');
    expect(roleTag('bowling allrounder')).toBe('All-rounder');
    expect(roleTag('bowler')).toBe('Bowler');
    expect(roleTag(null)).toBe('Batter');
  });
});

describe('card numbers and the format table', () => {
  it('counts matches played, runs and wickets over every row', () => {
    const s = cardStats([row('TEST', { appearances: 7, wickets: 3 }), row('ODI', { appearances: 4, runs: 50 })]);
    expect(s).toMatchObject({ matches: 11, runs: 150, wickets: 3 });
  });
  it('lists Tests, ODIs and T20Is first, then leagues by matches, with null where a player did not play', () => {
    const ipl = (n: number) => row('T20', { tournament_key: 'ipl', tournament_name: 'Indian Premier League', filter_section: 'Leagues', appearances: n });
    const a = [row('ODI'), row('TEST'), ipl(20)];
    const b = [row('T20', { appearances: 3 }), row('TEST'), row('T20', { tournament_key: 'bbl', tournament_name: 'Big Bash League', filter_section: 'Leagues', appearances: 9 })];
    const rows = formatRows(a, b);
    expect(rows.map((r) => r.label)).toEqual(['Tests', 'ODIs', 'T20Is', 'Indian Premier League', 'Big Bash League']);
    expect(rows[1]).toMatchObject({ a: { matches: 5 }, b: null });
    expect(rows[4]).toMatchObject({ a: null, b: { matches: 9 } });
  });
  it('puts players of the same role first among the suggestions', () => {
    const list = [{ id: 1, role: 'bowler' }, { id: 2, role: 'top-order batter' }, { id: 3, role: 'opening batter' }];
    expect(suggestOrder(list, { role: 'batter' }).map((x) => x.id)).toEqual([2, 3, 1]);
  });
});

describe('who can be compared', () => {
  it('compares national sides of one gender and the franchises of one league', () => {
    expect(teamGroup('india|intl|male')).toBe('intl|male');
    expect(canCompareTeams('india|intl|male', 'australia|intl|male')).toBe(true);
    expect(canCompareTeams('india|intl|male', 'india|intl|female')).toBe(false);
    expect(canCompareTeams('mumbai-indians|ipl|male', 'chennai-super-kings|ipl|male')).toBe(true);
    expect(canCompareTeams('mumbai-indians|ipl|male', 'mumbai-indians|wpl|female')).toBe(false);
    expect(canCompareTeams('india|intl|male', 'india|intl|male')).toBe(false);
  });
  it('words a group', () => {
    expect(groupText('india|intl|female', (k) => k)).toBe("national women's teams");
    expect(groupText('mumbai-indians|ipl|male', (k) => k.toUpperCase())).toBe("IPL men's teams");
  });
});

const tm = (o: Partial<TeamMatch>): TeamMatch => ({
  id: 1, date: '2024-01-01', season: '2024', year: 2024, format: 'TEST', kind: 'test', tk: null, tname: null, tkind: null, league: false, event: null, edition: null, stageClass: null, stageName: null, venue: null, city: null,
  country: null, opp: 'X', oppId: 'x|intl|male', tossWon: null, tossDecision: null, result: 'won', tied: false, byRuns: null, byWkts: null, byInnings: false, scheduledOvers: null, batFirst: null, potmId: null, potm: null,
  tracked: 0, trackedOf: 0, dropped: 0, ...o,
} as TeamMatch);

describe('team cards and shared competitions', () => {
  it('counts matches and the win rate of the matches with a result', () => {
    const c = teamCard([tm({ result: 'won' }), tm({ result: 'lost' }), tm({ result: 'nr' })]);
    expect(c).toMatchObject({ matches: 3, titles: 0, finalsLost: 0 });
    expect(c.rate).toBe(0.5);
  });
  it('lists only the formats both national sides have played, in order', () => {
    const a = [tm({ format: 'ODI' }), tm({ format: 'TEST' }), tm({ format: 'T20' })];
    const b = [tm({ format: 'T20' }), tm({ format: 'TEST', result: 'lost' })];
    const rows = sharedCompetitions(a, b, true);
    expect(rows.map((r) => r.label)).toEqual(['Tests', 'T20Is']);
    expect(rows[0]!.b.lost).toBe(1);
  });
  it('lists the competitions two franchises share by name', () => {
    const a = [tm({ tname: 'Indian Premier League' }), tm({ tname: 'Champions League' })];
    const b = [tm({ tname: 'Indian Premier League' })];
    expect(sharedCompetitions(a, b, false).map((r) => r.label)).toEqual(['Indian Premier League']);
  });
});
