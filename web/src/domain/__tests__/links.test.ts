import { describe, expect, it } from 'vitest';
import { directHref, isLinked, menuFor, primaryHref } from '../links';

describe('links', () => {
  it('gives a player a menu with their profile and Compare with them in the right slot', () => {
    const items = menuFor({ kind: 'player', id: 'ba607b88', name: 'V Kohli' });
    expect(items.map((i) => i.label)).toEqual(['View profile', 'Compare this player']);
    expect(items[0]!.href).toBe('/players/v-kohli-ba607b88');
    expect(items[1]!.href).toBe('/compare/players?a=ba607b88');
  });
  it('a team opens a menu with its page, and a team with no id stays plain text', () => {
    expect(menuFor({ kind: 'team', id: 'india|intl|male', name: 'India' }).map((i) => [i.id, i.href])).toEqual([['team', '/teams/india~intl~male'], ['compare', '/compare/teams?a=india%7Cintl%7Cmale']]);
    expect(isLinked({ kind: 'team', id: 'india|intl|male', name: 'India' })).toBe(true);
    expect(isLinked({ kind: 'team', id: null, name: 'India' })).toBe(false);
  });
  it('sends a match and a competition with a page straight to it, and any other competition nowhere', () => {
    expect(directHref({ kind: 'match', id: 335982, name: 'x', teams: ['Royal Challengers Bengaluru', 'Kolkata Knight Riders'], date: '2008-04-18' })).toBe('/matches/royal-challengers-bengaluru-v-kolkata-knight-riders-2008-04-18-335982');
    expect(directHref({ kind: 'match', id: 335982, name: 'x' })).toBe('/matches/335982');
    expect(directHref({ kind: 'tournament', id: 'ipl', name: 'Indian Premier League' })).toBe('/tournaments/ipl');
    expect(isLinked({ kind: 'tournament', id: 'some-tri-series', name: 'A tri-series' })).toBe(false);
  });
  it('does not link a name with no id', () => {
    expect(menuFor({ kind: 'player', id: null, name: 'Someone' })).toEqual([]);
    expect(isLinked({ kind: 'player', id: null, name: 'Someone' })).toBe(false);
  });
  it('the name of a player leads to their profile', () => {
    expect(primaryHref({ kind: 'player', id: 'ba607b88', name: 'V Kohli' })).toBe('/players/v-kohli-ba607b88');
  });
});
