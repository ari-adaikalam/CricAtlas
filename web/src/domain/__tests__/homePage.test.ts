import { describe, expect, it } from 'vitest';
import { ballLine, bigCount, dayKey, dayMatches, dayText, resultLine, type DayRow, type HomeFile } from '../homePage';

const row = (over: Partial<{ winner: number; margin: string; potm: [string, string] | null }> = {}): DayRow => [
  1, 2022, ['scotland|intl|male', 'Scotland'], ['west-indies|intl|male', 'West Indies'], over.winner ?? 0, over.margin ?? 'by 42 runs', "Men's T20 World Cup", over.potm === undefined ? ['ff014c34', 'HG Munsey'] : over.potm,
];

describe('home page words', () => {
  it('words a notable ball with the match as its own part', () => {
    expect(ballLine([1298150, 2, '19.4', 'Pakistan', 'India', 2022])).toEqual({ matchId: 1298150, ball: '19.4', title: 'Pakistan v India, 2022' });
  });

  it('writes a result as a sentence', () => {
    expect(resultLine(row())).toBe('Scotland won by 42 runs');
    expect(resultLine(row({ winner: 1, margin: 'by 5 wickets (12 balls left)' }))).toBe('West Indies won by 5 wickets (12 balls left)');
    expect(resultLine(row({ winner: -1, margin: 'drawn' }))).toBe('Match drawn');
    expect(resultLine(row({ winner: -1, margin: 'tied' }))).toBe('Match tied');
    expect(resultLine(row({ winner: -1, margin: 'no result' }))).toBe('No result');
  });

  it('reads the matches of a day, with the player of the match when there is one', () => {
    const file = { days: { '10-17': [row(), row({ potm: null })] } } as unknown as HomeFile;
    const ms = dayMatches(file, 10, 17);
    expect(ms[0]).toMatchObject({ id: 1, year: 2022, title: 'Scotland v West Indies', teams: [{ id: 'scotland|intl|male', name: 'Scotland' }, { id: 'west-indies|intl|male', name: 'West Indies' }], competition: "Men's T20 World Cup", potm: { id: 'ff014c34', name: 'HG Munsey' } });
    expect(ms[1]!.potm).toBeNull();
    expect(dayMatches(file, 3, 4)).toEqual([]);
  });

  it('names a day and its key', () => {
    expect(dayKey(2, 9)).toBe('02-09');
    expect(dayText(10, 17)).toBe('17 October');
  });

  it('shortens a count past a million', () => {
    expect(bigCount(5_852_078)).toEqual({ value: 5.9, decimals: 1, suffix: ' million' });
    expect(bigCount(14_585)).toEqual({ value: 14585, decimals: 0, suffix: '' });
  });
});
