import { describe, expect, it } from 'vitest';
import type { StatBat, StatBowl } from '../fullStats';
import { battingRows, bestPerformances, cell, cumulativeRuns, inningsToReach, leader, matchFigures, scoreboard, sideOf, situationLines, yearValue, yearsOf } from '../compareStats';

const bat = (o: Partial<StatBat>): StatBat => ({
  match_id: 1, innings: 1, date: '2020-01-01', season: '2020', format: 'ODI', tournament_key: null, venue: null, team: 'A', opponent: 'B', venue_country: null, venue_continent: null, home_away: null, toss: null,
  result: 'won', team_bat_first: true, team_innings: 1, match_number: null, stage_class: null, stage_name: null, tournament_kind: null, filter_section: null, runs: 50, balls: 60, fours: 4, sixes: 1, is_out: true, position: 3, ...o,
});
const bowl = (o: Partial<StatBowl>): StatBowl => ({ ...bat({}), balls: 60, runs: 40, wickets: 2, ...o }) as unknown as StatBowl;
const field = { catches: 0, stumpings: 0 };

describe('cells and leaders', () => {
  it('writes a dash for no number and separators for a big one', () => {
    expect(cell(null).s).toBe('-');
    expect(cell(12345).s).toBe('12,345');
    expect(cell(49.0123, 2).s).toBe('49.01');
  });
  it('leads with the higher number, or the lower where lower is better, and nobody when one is missing', () => {
    expect(leader({ a: cell(5), b: cell(3) })).toBe('a');
    expect(leader({ a: cell(5), b: cell(3), low: true })).toBe('b');
    expect(leader({ a: cell(5), b: cell(null) })).toBe('');
    expect(leader({ a: cell(5), b: cell(5) })).toBe('');
  });
});

describe('rows and the scoreboard', () => {
  const a = sideOf([bat({ runs: 100 }), bat({ runs: 20, is_out: false, match_id: 2 })], [], 9, field, 2, false);
  const b = sideOf([bat({ runs: 30 })], [bowl({ wickets: 3, runs: 30 })], 5, { catches: 4, stumpings: 0 }, 1, false);
  it('writes the high score with a star for a not out', () => {
    const rows = battingRows(a.bat, b.bat);
    expect(rows.find((r) => r.label === 'Highest score')!.a.s).toBe('100');
    expect(battingRows(sideOf([bat({ runs: 77, is_out: false })], [], 1, field, 0, false).bat, b.bat).find((r) => r.label === 'Highest score')!.a.s).toBe('77*');
  });
  it('counts who leads each category and leaves out a category neither has', () => {
    const s = scoreboard(a, b);
    expect(s.rows.some((r) => r.label === 'Economy')).toBe(true);
    expect(s.rows.find((r) => r.label === 'Wickets')!.lead).toBe('b');
    expect(s.rows.find((r) => r.label === 'Bowl avg')!.lead).toBe('');
    expect(s.a + s.b + s.level).toBe(s.rows.length);
    expect(s.rows.find((r) => r.label === 'Matches')!.lead).toBe('a');
  });
  it('finds the best match and the ten wicket matches from the spells', () => {
    const f = matchFigures([bowl({ match_id: 1, wickets: 6, runs: 50 }), bowl({ match_id: 1, innings: 2, wickets: 4, runs: 30 }), bowl({ match_id: 2, wickets: 5, runs: 20 })]);
    expect(f.best).toEqual({ w: 10, r: 80 });
    expect(f.tens).toBe(1);
  });
});

describe('series', () => {
  it('adds runs innings by innings and finds when a total was reached', () => {
    const s = cumulativeRuns([bat({ date: '2020-02-01', runs: 30 }), bat({ date: '2020-01-01', runs: 70, match_id: 2 }), bat({ date: '2020-03-01', runs: 10, match_id: 3 })]);
    expect(s).toEqual([70, 100, 110]);
    expect(inningsToReach(s, 100)).toBe(2);
    expect(inningsToReach(s, 500)).toBeNull();
  });
  it('gives a number for a year only when there is an innings or spell in it', () => {
    const b = [bat({ date: '2019-05-01', runs: 40 }), bat({ date: '2020-05-01', runs: 60, match_id: 2 })];
    expect(yearsOf(b)).toEqual([2019, 2020]);
    expect(yearValue(b, [], 2019, 'Runs')).toBe(40);
    expect(yearValue(b, [], 2021, 'Runs')).toBeNull();
    expect(yearValue(b, [bowl({ date: '2019-06-01', wickets: 3 })], 2019, 'Wickets')).toBe(3);
  });
  it('splits innings into batting first, chasing, wins and losses', () => {
    const lines = situationLines([bat({ team_bat_first: true, result: 'won', runs: 100 }), bat({ team_bat_first: false, result: 'lost', runs: 20, match_id: 2 })]);
    expect(lines.map((l) => l.runs)).toEqual([100, 20, 100, 20]);
  });
  it('picks the five highest scores and the two best spells', () => {
    const best = bestPerformances([10, 90, 50, 70, 30, 80, 60].map((runs, i) => bat({ runs, match_id: i })), [bowl({ wickets: 1 }), bowl({ wickets: 4, match_id: 2 }), bowl({ wickets: 0, match_id: 3 }), bowl({ wickets: 3, match_id: 4 })]);
    expect(best.bat.map((x) => x.runs)).toEqual([90, 80, 70, 60, 50]);
    expect(best.bowl.map((x) => x.wickets)).toEqual([4, 3]);
  });
});
