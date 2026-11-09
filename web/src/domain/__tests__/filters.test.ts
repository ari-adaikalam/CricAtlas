import { describe, expect, it } from 'vitest';
import type { SummaryRow } from '../batting';
import {
  applyFilters, chooseCompetition, chooseFormat, competitionOptions, defaultFilters, filtersFromParams, filtersToParams, forAnalysis, formatOptions, normaliseFilters, seasonOptions, type PlayerFilters,
} from '../filters';

const row = (over: Partial<SummaryRow>): SummaryRow => ({
  player_id: 'aaaaaaaa', format: 'T20', tournament_key: null, tournament_name: null, season: '2024', gender: 'male',
  matches: 1, innings: 1, runs: 10, balls_faced: 8, fours: 1, sixes: 0, fifties: 0, hundreds: 0, ducks: 0, dismissals: 1, high_score: 10,
  bowling_matches: null, balls_bowled: null, runs_conceded: null, wickets: null, dot_balls: null, ...over,
});
const ipl = { format: 'T20', tournament_key: 'ipl', tournament_name: 'Indian Premier League', filter_section: 'Leagues' };
const wc = { format: 'ODI', tournament_key: 'odi-world-cup-male', tournament_name: "Men's Cricket World Cup", filter_section: 'World Cups and ICC events' };
const rows = [
  row({ ...ipl, season: '2023', balls_faced: 100, runs: 120 }),
  row({ ...ipl, season: '2024', balls_faced: 100, runs: 130 }),
  row({ format: 'T20', season: '2022', balls_faced: 20, runs: 25 }),
  row({ format: 'TEST', season: '2021', balls_faced: 500, runs: 400 }),
  row({ ...wc, season: '2023', balls_faced: 300, runs: 250 }),
  row({ format: 'ODI', season: '2020', balls_faced: 50, runs: 40 }),
];
const f = (over: Partial<PlayerFilters>): PlayerFilters => ({ format: 'TEST', competition: null, season: null, ...over });

describe('format options', () => {
  it('lists International, each international format, T20s and a disabled League, in that order', () => {
    expect(formatOptions(rows).map((o) => [o.format, o.disabled])).toEqual([
      ['INTERNATIONAL', false], ['TEST', false], ['ODI', false], ['T20I', false], ['T20S', false], ['LEAGUE', true],
    ]);
  });
  it('has no International for one format and no T20s for one T20 competition', () => {
    expect(formatOptions([rows[3]!]).map((o) => o.format)).toEqual(['TEST']);
  });
  it('opens a batter on the international format with most runs', () => {
    expect(defaultFilters(rows)).toEqual(f({ format: 'TEST' }));
    // The ODI rows have more balls here than the Test row, but fewer runs, and runs decide.
    expect(defaultFilters([rows[3]!, row({ ...wc, balls_faced: 900, runs: 200 })])).toEqual(f({ format: 'TEST' }));
    expect(defaultFilters([rows[3]!, row({ ...wc, balls_faced: 100, runs: 900 })])).toEqual(f({ format: 'ODI' }));
  });
  it('opens a bowler on the international format with most wickets', () => {
    const bowl = (over: Partial<SummaryRow>) => row({ runs: 5, balls_faced: 10, balls_bowled: 600, wickets: 40, bowling_matches: 10, ...over });
    // 90 wickets in ODIs against 60 in Tests: a bowler by the role rule (50 wickets, few runs), so wickets decide although the Tests carry more runs.
    expect(defaultFilters([bowl({ format: 'TEST', wickets: 60, runs: 100 }), bowl({ format: 'ODI', wickets: 90, runs: 40 })])).toEqual(f({ format: 'ODI' }));
    expect(defaultFilters([bowl({ format: 'TEST', wickets: 90 }), bowl({ format: 'ODI', wickets: 60 })])).toEqual(f({ format: 'TEST' }));
  });
  it('breaks a tie on balls', () => {
    expect(defaultFilters([row({ format: 'TEST', runs: 100, balls_faced: 300 }), row({ format: 'ODI', runs: 100, balls_faced: 120 })])).toEqual(f({ format: 'TEST' }));
  });
  it('opens a league player on their league', () => {
    expect(defaultFilters([rows[0]!, rows[1]!])).toEqual({ format: 'LEAGUE', competition: 'ipl', season: null });
  });
});

describe('competitions', () => {
  it('lists every tournament the player has matches in, international first', () => {
    expect(competitionOptions(rows, 'TEST').map((o) => o.key)).toEqual(['odi-world-cup-male', 'ipl']);
  });
  it('a league choice sets Format to League', () => {
    expect(chooseCompetition(rows, f({}), 'ipl')).toEqual({ format: 'LEAGUE', competition: 'ipl', season: null });
  });
  it('an international tournament keeps the format when it has matches there', () => {
    expect(chooseCompetition(rows, f({ format: 'ODI' }), 'odi-world-cup-male')).toEqual({ format: 'ODI', competition: 'odi-world-cup-male', season: null });
    expect(chooseCompetition(rows, f({ format: 'INTERNATIONAL' }), 'odi-world-cup-male').format).toBe('INTERNATIONAL');
  });
  it('an international tournament moves Format to one that has its matches', () => {
    expect(chooseCompetition(rows, f({ format: 'TEST' }), 'odi-world-cup-male')).toEqual({ format: 'ODI', competition: 'odi-world-cup-male', season: null });
    expect(chooseCompetition(rows, { format: 'LEAGUE', competition: 'ipl', season: null }, 'odi-world-cup-male').format).toBe('ODI');
  });
  it('all competitions from League returns to the busiest international format', () => {
    expect(chooseCompetition(rows, { format: 'LEAGUE', competition: 'ipl', season: null }, null)).toEqual(f({ format: 'TEST' }));
  });
  it('choosing a format clears competition and season', () => {
    expect(chooseFormat('ODI')).toEqual(f({ format: 'ODI' }));
  });
});

describe('seasons and rows', () => {
  it('lists seasons newest first for the chosen group', () => {
    expect(seasonOptions(rows, 'T20S', null)).toEqual(['2024', '2023', '2022']);
    expect(seasonOptions(rows, 'LEAGUE', 'ipl')).toEqual(['2024', '2023']);
    expect(seasonOptions(rows, 'T20I', null)).toEqual(['2022']);
  });
  it('filters rows by group', () => {
    expect(applyFilters(rows, f({ format: 'LEAGUE', competition: 'ipl', season: '2023' }))).toHaveLength(1);
    expect(applyFilters(rows, f({ format: 'T20S' }))).toHaveLength(3);
    expect(applyFilters(rows, f({ format: 'INTERNATIONAL' }))).toHaveLength(4);
    expect(applyFilters(rows, f({ format: 'T20I' }))).toHaveLength(1);
  });
});

describe('normaliseFilters', () => {
  it('drops a competition with no matches in the chosen format', () => {
    expect(normaliseFilters(rows, f({ format: 'TEST', competition: 'ipl' }))).toEqual(f({ format: 'TEST' }));
  });
  it('drops a season that has no balls under the competition', () => {
    expect(normaliseFilters(rows, { format: 'LEAGUE', competition: 'ipl', season: '2022' })).toEqual({ format: 'LEAGUE', competition: 'ipl', season: null });
  });
  it('falls back when the format is not one the player has', () => {
    expect(normaliseFilters([rows[3]!], f({ format: 'ODI' }))?.format).toBe('TEST');
  });
  it('does not accept League without a competition', () => {
    expect(normaliseFilters(rows, f({ format: 'LEAGUE' }))?.format).toBe('TEST');
  });
  it('returns null with no rows', () => {
    expect(normaliseFilters([], f({}))).toBeNull();
  });
});

describe('analysis views', () => {
  it('switch International to the busiest format with a note', () => {
    const out = forAnalysis(rows, f({ format: 'INTERNATIONAL', season: '2021' }));
    expect(out.filters).toEqual({ format: 'TEST', competition: null, season: '2021' });
    expect(out.note).toBe('International is not available here. Showing Tests.');
  });
  it('leave other formats alone', () => {
    expect(forAnalysis(rows, f({ format: 'T20S' }))).toEqual({ filters: f({ format: 'T20S' }), note: null });
  });
});

describe('URL parameters are untrusted', () => {
  it('reads plain values', () => {
    expect(filtersFromParams(new URLSearchParams('format=T20S&competition=ipl&season=2019%2F20'))).toEqual({ format: 'T20S', competition: 'ipl', season: '2019/20' });
  });
  it('ignores anything that is not a short plain token or a known format', () => {
    expect(filtersFromParams(new URLSearchParams({ format: "T20'; drop table x; --", competition: 'a'.repeat(80), season: '<script>' }))).toEqual({});
    expect(filtersFromParams(new URLSearchParams({ format: 'CHESS' }))).toEqual({});
  });
  it('round-trips', () => {
    const value = f({ format: 'T20S', competition: 'ipl', season: '2024' });
    expect(filtersFromParams(filtersToParams(value))).toEqual(value);
  });
});
