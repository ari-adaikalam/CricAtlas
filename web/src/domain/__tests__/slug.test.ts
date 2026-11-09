import { describe, expect, it } from 'vitest';
import { playerIdFromSlug, playerSlug, teamIdFromSlug, teamSlug, tournamentSlug } from '../slug';

describe('player slugs', () => {
  it('reads as a name then the id, and round-trips', () => {
    expect(playerSlug('V Kohli', 'ba607b88')).toBe('v-kohli-ba607b88');
    expect(playerIdFromSlug('v-kohli-ba607b88')).toBe('ba607b88');
  });
  it('copes with accents and symbols', () => {
    expect(playerSlug("Q de Kock-O'Brien", '0123abcd')).toBe('q-de-kock-o-brien-0123abcd');
  });
  it('accepts a bare id', () => {
    expect(playerIdFromSlug('ba607b88')).toBe('ba607b88');
  });
  it('rejects anything without a valid id', () => {
    expect(playerIdFromSlug('v-kohli')).toBeNull();
    expect(playerIdFromSlug('v-kohli-ZZZZZZZZ')).toBeNull();
    expect(playerIdFromSlug('xv-kohliba607b88')).toBeNull();
    expect(playerIdFromSlug('')).toBeNull();
  });
});

describe('team and tournament addresses', () => {
  it('a team address is the team id with | as ~, and back', () => {
    expect(teamSlug('india|intl|male')).toBe('india~intl~male');
    expect(teamIdFromSlug('india~intl~male')).toBe('india|intl|male');
    expect(teamIdFromSlug('mumbai-indians~wpl~female')).toBe('mumbai-indians|wpl|female');
    expect(teamIdFromSlug('india')).toBeNull();
    expect(teamIdFromSlug('../etc~intl~male')).toBeNull();
  });
  it('a tournament address is its key, made safe', () => {
    expect(tournamentSlug('t20-world-cup-male')).toBe('t20-world-cup-male');
    expect(tournamentSlug('A b/c')).toBe('a-b-c');
  });
});
