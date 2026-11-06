import { describe, expect, it } from 'vitest';
import { battingStreaks, bowlingStreaks, economyLabel, longest, monthOf, runsOf, underLimit, type PlayerMatch } from '../streaks';
import { chipYear, inSeason, trophies, type TrophyEdition } from '../trophies';
import type { BatInnings, BowlInnings } from '../records';

const d = (n: number) => `2020-01-${String(n).padStart(2, '0')}`;
const bat = (n: number, runs: number, is_out = true): BatInnings => ({ match_id: n, innings: 1, tournament_key: null, season: '2020', date: d(n), venue: null, team: 'A', opponent: 'B', runs, balls: 10, fours: 0, sixes: 0, is_out, balls_to_50: null, balls_to_100: null, chasing: false });
const bowl = (n: number, wickets: number, o: Partial<BowlInnings> = {}): BowlInnings => ({ match_id: n, innings: 1, format: 'ODI', tournament_key: null, season: '2020', date: d(n), venue: null, team: 'A', opponent: 'B', balls: 60, runs: 40, wickets, hat_tricks: 0, maidens: 0, dots: 0, economy_counts: true, ...o });
const get = (cards: ReturnType<typeof battingStreaks>, label: string) => cards.find((c) => c.label === label)!;

describe('runs', () => {
  it('finds consecutive true flags in order', () => {
    const r = runsOf([true, true, false, true, true, true], ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(r).toEqual([{ len: 2, from: 'a', to: 'b' }, { len: 3, from: 'd', to: 'f' }]);
  });
  it('has no runs for nothing or for all false', () => { expect(runsOf([], [])).toEqual([]); expect(runsOf([false, false], ['a', 'b'])).toEqual([]); });
  it('keeps the five longest and breaks a tie toward the later end', () => {
    const mk = (len: number, to: string) => ({ len, from: '', to });
    const top = longest([mk(2, '2019'), mk(2, '2021'), mk(5, '2018'), mk(1, '2022'), mk(3, '2017'), mk(4, '2016'), mk(1, '2023')]);
    expect(top.map((r) => `${r.len}${r.to}`)).toEqual(['52018', '42016', '32017', '22021', '22019']);
  });
  it('writes the month', () => expect(monthOf('2019-03-07')).toBe('Mar 2019'));
});

describe('batting streaks', () => {
  const matches: PlayerMatch[] = [1, 2, 3, 4, 5].map((n) => ({ match_id: n, date: d(n), result: (['won', 'won', 'other', 'won', 'lost'] as const)[n - 1]!, potm: n === 2 }));
  it('counts innings in date order whatever order they arrive in', () => {
    const cards = battingStreaks([bat(3, 60), bat(1, 31), bat(2, 40), bat(4, 5)], []);
    expect(get(cards, 'Scores of 30 or more').best).toMatchObject({ len: 3, from: d(1), to: d(3) });
  });
  it('treats not out as no duck and a not out as a not out', () => {
    const cards = battingStreaks([bat(1, 0, false), bat(2, 0, true), bat(3, 2)], []);
    expect(get(cards, 'Innings without a duck').best?.len).toBe(1);
    expect(get(cards, 'Not outs').best?.len).toBe(1);
  });
  it('says why a card is empty', () => {
    const c = get(battingStreaks([bat(1, 10)], []), 'Hundreds');
    expect(c.best).toBeNull();
    expect(c.why).toBe('No hundred in these filters');
  });
  it('lets a tie, no result or draw break both a win streak and a loss streak', () => {
    const cards = battingStreaks([], matches);
    expect(get(cards, 'Matches won by the team').best).toMatchObject({ len: 2 });
    expect(get(cards, 'Matches lost by the team').best).toMatchObject({ len: 1, from: d(5) });
    expect(get(cards, 'Player of the match').best).toMatchObject({ len: 1, from: d(2) });
  });
});

describe('bowling streaks', () => {
  it('counts wickets and none', () => {
    const cards = bowlingStreaks([bowl(1, 0), bowl(2, 0), bowl(3, 2), bowl(4, 1)], []);
    expect(get(cards, 'Innings without a wicket').best?.len).toBe(2);
    expect(get(cards, 'Innings with a wicket').best?.len).toBe(2);
    expect(get(cards, 'Innings with 2 or more wickets').best?.len).toBe(1);
  });
  it('uses the limit of each format, and 5 balls for The Hundred', () => {
    expect(underLimit(bowl(1, 0, { format: 'TEST', balls: 60, runs: 25 }))).toBe(true);
    expect(underLimit(bowl(1, 0, { format: 'TEST', balls: 60, runs: 26 }))).toBe(false);
    expect(underLimit(bowl(1, 0, { format: 'T20', balls: 24, runs: 25 }))).toBe(true);
    expect(underLimit(bowl(1, 0, { format: 'T20', tournament_key: 'hnd', balls: 10, runs: 10 }))).toBe(true);
    expect(underLimit(bowl(1, 0, { format: 'T20', tournament_key: 'hnd', balls: 10, runs: 11 }))).toBe(false);
  });
  it('leaves spells too short for an economy out of the economy card without breaking it', () => {
    const cards = bowlingStreaks([bowl(1, 0), bowl(2, 0, { balls: 6, runs: 40, economy_counts: false }), bowl(3, 0)], []);
    expect(get(cards, 'Spells with economy under 4.8').best?.len).toBe(2);
  });
  it('names the limit when the formats agree and not when they differ', () => {
    expect(economyLabel([{ format: 'T20', tournament_key: null }])).toBe('Spells with economy under 6.5');
    expect(economyLabel([{ format: 'T20', tournament_key: 'hnd' }])).toBe('Spells with economy per 5 balls under 5.4');
    expect(economyLabel([{ format: 'T20', tournament_key: null }, { format: 'ODI', tournament_key: null }])).toBe('Spells with a low economy');
  });
});

const ed = (key: string, label: string, result: TrophyEdition['result'], team = 'India', seasons = label): TrophyEdition => ({ tournament_key: key, tournament_name: key.toUpperCase(), season_label: label, team, seasons, result });

describe('trophies', () => {
  it('reads the year a chip shows', () => { expect([chipYear('2010/11'), chipYear('2014-16'), chipYear('2024'), chipYear('2015/16')]).toEqual(['11', '16', '24', '16']); });
  it('counts titles and lost finals and sorts by them', () => {
    const t = trophies([ed('a', '2019', 'played'), ed('b', '2011', 'champion'), ed('b', '2015', 'runner-up'), ed('c', '2012', 'runner-up'), ed('c', '2016', 'runner-up'), ed('d', '2013', 'champion', 'Mumbai')]);
    expect(t.rows.map((r) => r.key)).toEqual(['b', 'd', 'c', 'a']);
    expect({ titles: t.titles, finals: t.finals, editions: t.editions, won: t.won }).toEqual({ titles: 2, finals: 3, editions: 6, won: 2 });
    expect(t.rows[1]!.winners).toEqual(['Mumbai']);
  });
  it('finds a merged edition by any of its seasons', () => {
    const es = [ed('psl', '2020', 'champion', 'X', '2019/20|2020'), ed('psl', '2021', 'played')];
    expect(inSeason(es, '2019/20')).toHaveLength(1);
    expect(inSeason(es, null)).toHaveLength(2);
    expect(inSeason(es, '2018')).toHaveLength(0);
  });
});
