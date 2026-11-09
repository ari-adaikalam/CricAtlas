import { describe, expect, it } from 'vitest';
import { addressChecker, addressKey } from '../addresses';

const known = addressChecker({ players: ['ba607b88'], matches: [1298150], teams: ['india~intl~male'], tournaments: ['ipl'] });

describe('addressKey', () => {
  it('names what each address asks for', () => {
    expect(addressKey('players', 'v-kohli-ba607b88')).toBe('ba607b88');
    expect(addressKey('matches', 'x-v-y-2022-10-23-1298150')).toBe(1298150);
    expect(addressKey('teams', 'india~intl~male')).toBe('india~intl~male');
    expect(addressKey('tournaments', 'ipl')).toBe('ipl');
  });
  it('is null for an address that is not in the shape of one', () => {
    expect(addressKey('players', 'not-an-id')).toBeNull();
    expect(addressKey('teams', 'india')).toBeNull();
    expect(addressKey('series', 'x')).toBeNull();
  });
});

describe('addressChecker', () => {
  it('accepts an address the data has', () => {
    expect(known('players', 'v-kohli-ba607b88')).toBe(true);
    expect(known('players', 'any-readable-name-ba607b88')).toBe(true);
    expect(known('matches', '1298150')).toBe(true);
    expect(known('teams', 'india~intl~male')).toBe(true);
    expect(known('tournaments', 'ipl')).toBe(true);
  });
  it('refuses an address in the right shape that the data does not have', () => {
    expect(known('players', 'zzz-00000000')).toBe(false);
    expect(known('matches', '999')).toBe(false);
    expect(known('teams', 'nowhere~intl~male')).toBe(false);
    expect(known('tournaments', 'nope')).toBe(false);
  });
});
