import { describe, expect, it } from 'vitest';
import { awardTables, dismissedFor, fieldingTables, formatName, type PlayedRow } from '../fullStatsExtra';
import type { StatBat } from '../fullStats';

const bat = (runs: number, balls: number, is_out: boolean, format = 'ODI'): StatBat => ({ match_id: 1, innings: 1, date: '2020-01-01', season: '2020', format, tournament_key: null, venue: null, team: 'A', opponent: 'B', venue_country: null, venue_continent: null,
  home_away: null, toss: null, result: null, team_bat_first: null, team_innings: 1, match_number: null, stage_class: null, stage_name: null, tournament_kind: null, filter_section: null, runs, balls, fours: 0, sixes: 0, is_out, position: 3 });

describe('formatName', () => { it('names the formats', () => { expect(['TEST', 'ODI'].map((f) => formatName(f, 'Intl'))).toEqual(['Tests', 'ODIs']); expect(formatName('T20', 'Intl')).toBe('T20Is'); expect(formatName('T20', 'Fran(IPL)')).toBe('T20 leagues'); }); });

describe('dismissed for', () => {
  it('counts only the innings the batter was out in, in bands', () => {
    const [score, balls] = dismissedFor([bat(0, 3, true), bat(45, 40, true), bat(130, 90, true), bat(60, 50, false), bat(9, 12, true)]);
    expect(score!.rows.find((r) => r[0] === '0 (duck)')).toEqual(['0 (duck)', 1, '25%']);
    expect(score!.rows.find((r) => r[0] === '40 to 49')![1]).toBe(1);
    expect(score!.rows.find((r) => r[0] === '100 or more')![1]).toBe(1);
    expect(score!.rows.reduce((s, r) => s + (r[1] as number), 0)).toBe(4);
    expect(balls!.rows.find((r) => r[0] === '36 to 59')![1]).toBe(1);
  });
  it('uses the wider bands when every innings was a Test', () => {
    const [score] = dismissedFor([bat(210, 300, true, 'TEST'), bat(5, 20, true, 'TEST')]);
    expect(score!.rows.map((r) => r[0])).toContain('200 or more');
    expect(dismissedFor([bat(210, 300, true, 'TEST'), bat(5, 20, true, 'ODI')])[0]!.rows.map((r) => r[0])).not.toContain('200 or more');
  });
  it('has empty bands and no share when never out', () => {
    expect(dismissedFor([bat(10, 10, false)])[0]!.rows.every((r) => r[1] === 0 && r[2] === '-')).toBe(true);
  });
});

describe('awards', () => {
  const played: PlayedRow[] = [
    { match_id: 1, format: 'ODI', type: 'Intl', date: '2019-05-01', opponent: 'Pakistan', potm: true }, { match_id: 2, format: 'ODI', type: 'Intl', date: '2019-06-01', opponent: 'Pakistan', potm: true },
    { match_id: 3, format: 'ODI', type: 'Intl', date: '2021-06-01', opponent: 'England', potm: false }, { match_id: 4, format: 'T20', type: 'Fran(IPL)', date: '2022-04-01', opponent: 'Delhi', potm: true },
  ];
  it('counts awards by format with the matches and the rate', () => {
    const [byFormat, years, opp] = awardTables(played);
    expect(byFormat!.rows).toEqual([['ODIs', 2, 3, '67%'], ['T20 leagues', 1, 1, '100%']]);
    expect(years!.rows).toEqual([['2022', 1], ['2019', 2]]);
    expect(opp!.rows[0]).toEqual(['Pakistan', 2]);
  });
});

describe('fielding', () => {
  it('adds catches, stumpings and run outs by format and shares the types', () => {
    const credits = [{ format: 'ODI', type: 'Intl', kind: 'catch' as const, n: 10 }, { format: 'ODI', type: 'Intl', kind: 'caught_and_bowled' as const, n: 2 }, { format: 'ODI', type: 'Intl', kind: 'run_out_direct' as const, n: 1 }, { format: 'ODI', type: 'Intl', kind: 'run_out_shared' as const, n: 1 }];
    const played: PlayedRow[] = [1, 2, 3, 4].map((id) => ({ match_id: id, format: 'ODI', type: 'Intl', date: '2020-01-01', opponent: 'X', potm: false }));
    const [byFormat, byKind] = fieldingTables(credits, played);
    expect(byFormat!.rows).toEqual([['ODIs', 4, 12, 0, 2, 14, '3.50']]);
    expect(byKind!.rows[0]).toEqual(['Caught in the field', 10, '71%']);
    expect(byKind!.rows[3]).toEqual(['Run outs, direct hit', 1, '7%']);
  });
});

describe('custom cards', () => {
  it('shows the most, fewest and total of the first numeric column and the most of the next', async () => {
    const { customCards } = await import('../fullStatsExtra');
    const cards = customCards({ title: 'By year', head: ['Year', 'Awards', 'Mat'], rows: [['2020', 3, 10], ['2021', 1, 12], ['2022', 5, 8]] });
    expect(cards.map((c) => [c.label, c.name, c.value])).toEqual([['Most Awards', '2022', '5'], ['Fewest Awards', '2021', '1'], ['Total Awards', 'By year', '9'], ['Most Mat', '2021', '12']]);
    expect(customCards({ title: 't', head: ['A', 'B'], rows: [['x', 1]] })).toEqual([]);
    expect(customCards({ title: 't', head: ['A', 'B'], rows: [['x', 1], ['y', 2]] })[3]).toEqual({ label: 'Rows', name: 't', value: '2' });
  });
});

describe('award cards and charts', () => {
  const played: PlayedRow[] = [
    { match_id: 1, format: 'ODI', type: 'Intl', date: '2019-05-01', opponent: 'Pakistan', potm: true }, { match_id: 2, format: 'ODI', type: 'Intl', date: '2019-06-01', opponent: 'Pakistan', potm: true },
    { match_id: 3, format: 'ODI', type: 'Intl', date: '2021-06-01', opponent: 'England', potm: false },
  ];
  it('writes the total, the rate, the best year and the most against', async () => {
    const { awardCards, awardCharts, dismissedBars } = await import('../fullStatsExtra');
    expect(awardCards(played).map((c) => [c.label, c.value, c.name])).toEqual([['Awards', '2', 'Player of the match'], ['Award rate', '67%', '2 in 3 matches'], ['Best year', '2', '2019'], ['Most against', '2', 'Pakistan']]);
    const [byFormat, years] = awardCharts(played);
    expect(byFormat!.rows).toEqual([{ label: 'ODIs', value: 2, note: '67% of 3 matches' }]);
    expect(years!.rows).toEqual([{ label: '2019', value: 2, note: '' }]);
    expect(dismissedBars([]).map((b) => b.rows.length)).toEqual([8, 6]);
  });
});

describe('fielding charts', () => {
  it('adds a by-year chart, newest year first', async () => {
    const { fieldingCharts } = await import('../fullStatsExtra');
    const credits = [{ year: 2019, format: 'ODI', type: 'Intl', kind: 'catch' as const, n: 3 }, { year: 2021, format: 'ODI', type: 'Intl', kind: 'stumping' as const, n: 1 }, { year: 2021, format: 'ODI', type: 'Intl', kind: 'catch' as const, n: 2 }];
    const played = [1, 2].map((id) => ({ match_id: id, format: 'ODI', type: 'Intl', date: '2020-01-01', opponent: 'X', potm: false }));
    const f = fieldingCharts(credits, played);
    expect(f.years.rows).toEqual([{ label: '2021', value: 3, note: '' }, { label: '2019', value: 3, note: '' }]);
    expect(f.cards[3]!.value).toBe('3.00');
  });
});
