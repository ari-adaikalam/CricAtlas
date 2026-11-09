import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inkFor, luminance, photoBackdrop, sideColours, teamColour, teamPalette, TOO_CLOSE } from '../colours';

describe('team colours', () => {
  it('finds a national team', () => expect(teamColour('India')).toMatch(/^#[0-9A-F]{6}$/i));
  it('returns null for an unknown or missing team', () => { expect(teamColour('Atlantis')).toBeNull(); expect(teamColour(null)).toBeNull(); });
  it('puts dark ink on light colours and white on dark', () => { expect(inkFor('#F2C200')).toBe('#111'); expect(inkFor('#1E5BC6')).toBe('#fff'); expect(inkFor('#111111')).toBe('#fff'); });
  it('puts the country colour, with readable ink, behind a player\'s photo', () => {
    const india = photoBackdrop('India');
    expect(india?.background).toBe(teamColour('India'));
    expect(india?.color).toBe(inkFor(teamColour('India')!));
  });
  it('gives a country with no colour nothing, so the brand gradient stays', () => { expect(photoBackdrop('Atlantis')).toBeUndefined(); expect(photoBackdrop(null)).toBeUndefined(); });
  it('orders luminance', () => expect(luminance('#FFFFFF')).toBeGreaterThan(luminance('#000000')));
});

import { chartColours, contrast, GOLD, liftForDark, scopeTeamColour, separation, SKY } from '../colours';

describe('chart colours', () => {
  it('lifts a dark team colour until it reads on the panel and keeps a bright one', () => {
    expect(contrast(liftForDark('#111111'), '#1c1c1c')).toBeGreaterThanOrEqual(3);
    expect(liftForDark('#F2C200')).toBe('#f2c200');
  });
  it('uses gold and sky with no team', () => expect(chartColours(null)).toEqual({ main: GOLD, second: SKY }));
  it('picks the second colour that is easier to tell from the main one', () => {
    expect(chartColours('#F2C200').second).toBe(SKY);
    expect(chartColours('#1E90FF').second).toBe(GOLD);
    for (const hex of ['#F2C200', '#1E90FF', '#C8102E', '#00793D', '#7B1E3A']) {
      const { main, second } = chartColours(hex);
      expect(separation(main, second)).toBeGreaterThan(10);
    }
  });
  it('sees no difference between a colour and itself', () => expect(separation('#336699', '#336699')).toBeCloseTo(0, 5));
  it('uses the one team in scope, else the country, else nothing', () => {
    expect(scopeTeamColour([{ team: 'Royal Challengers Bengaluru', matches: 5 }], 'India')).toBe(teamColour('Royal Challengers Bengaluru'));
    expect(scopeTeamColour([{ team: 'India', matches: 5 }, { team: 'Delhi Capitals', matches: 5 }], 'India')).toBe(teamColour('India'));
    expect(scopeTeamColour([{ team: 'Royal Challengers Bangalore', matches: 3 }, { team: 'Royal Challengers Bengaluru', matches: 2 }], 'India')).toBe(teamColour('Royal Challengers Bengaluru'));
    expect(scopeTeamColour([], 'Atlantis')).toBeNull();
  });
});

describe('team identity', () => {
  // data/team_identity.csv renames franchises in every exported table, so each display name in it is the name the app sees and needs a colour.
  const rows = readFileSync(join(__dirname, '../../../../data/team_identity.csv'), 'utf8').trim().split('\n').slice(1).map((line) => line.split(','));
  it('has a colour for every display name', () => {
    const missing = [...new Set(rows.map((r) => r[3]!))].filter((name) => teamColour(name) === null);
    expect(missing).toEqual([]);
  });
});

describe('sideColours', () => {
  it('uses the fixed pair when neither side has a colour', () => {
    expect(sideColours(null, null)).toEqual({ a: GOLD, b: SKY });
    expect(sideColours('Atlantis', 'Lemuria')).toEqual({ a: GOLD, b: SKY });
  });
  it("gives two different teams their own colours", () => {
    const c = sideColours('India', 'Australia');
    expect(c.a).toBe(liftForDark(teamColour('India')!));
    expect(c.b).toBe(liftForDark(teamColour('Australia')!));
  });
  it('gives the second side the secondary colour when both are the same team', () => {
    const c = sideColours('India', 'India');
    expect(c.a).toBe(liftForDark(teamPalette('India')!.primary));
    expect(c.b).toBe(liftForDark(teamPalette('India')!.secondary));
    expect(separation(c.a, c.b)).toBeGreaterThanOrEqual(TOO_CLOSE);
  });
  it('always leaves the two sides easy to tell apart, whatever the teams', () => {
    const teams = ['India', 'Australia', 'England', 'Pakistan', 'Mumbai Indians', 'Chennai Super Kings', 'Royal Challengers Bengaluru', 'Sri Lanka', 'West Indies', 'South Africa'];
    for (const x of teams) for (const y of teams) { const c = sideColours(x, y); expect(separation(c.a, c.b), `${x} v ${y}`).toBeGreaterThanOrEqual(TOO_CLOSE); }
  });
  it('keeps the side that has a colour and gives the other a fixed one that tells them apart', () => {
    const c = sideColours('India', null);
    expect(c.a).toBe(liftForDark(teamColour('India')!));
    expect([GOLD, SKY]).toContain(c.b);
    expect(separation(c.a, c.b)).toBeGreaterThanOrEqual(TOO_CLOSE);
    const d = sideColours(null, 'India');
    expect(d.b).toBe(liftForDark(teamColour('India')!));
    expect([GOLD, SKY]).toContain(d.a);
  });
});
