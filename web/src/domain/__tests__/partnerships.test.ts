import { describe, expect, it } from 'vitest';
import { batRow, bowlRow, ordinalWicket, type BatPartnership, type BowlPartnership } from '../partnerships';

const bat = (o: Partial<BatPartnership> = {}): BatPartnership => ({ match_id: 1, innings: 1, wicket_number: 3, partner: 'KC Sangakkara', date: '2006-07-27', venue: 'SSC', opponent: 'South Africa', runs: 624, balls: 950, mine_runs: 374, partner_runs: 237, unbroken: false, ...o });
const bowl = (o: Partial<BowlPartnership> = {}): BowlPartnership => ({ match_id: 2, innings: 2, partner: 'SCJ Broad', date: '2019-07-24', venue: "Lord's", opponent: 'Ireland', balls: 92, runs: 38, wickets: 10, mine_wickets: 6, partner_wickets: 4, hundred: false, ...o });

describe('wicket ordinals', () => it('writes 1st to 10th', () => expect([1, 2, 3, 4, 10].map(ordinalWicket)).toEqual(['1st', '2nd', '3rd', '4th', '10th'])));

describe('batting row', () => {
  it('names the wicket and the partner, and gives the balls, opponent and month', () => {
    const r = batRow(bat());
    expect(r.title).toBe('3rd wicket with KC Sangakkara');
    expect(r.detail).toBe('950 balls, v South Africa, Jul 2006');
    expect(r.figure).toBe(624);
    expect(r.star).toBe(false);
  });
  it('stars an unbroken partnership', () => expect(batRow(bat({ unbroken: true })).star).toBe(true));
  it('splits the bar between the two batters and the extras', () => {
    const r = batRow(bat());
    expect(r.parts.map((p) => p.value)).toEqual([374, 237, 13]);
    expect(r.parts.reduce((a, p) => a + p.value, 0)).toBe(r.total);
    expect(batRow(bat({ mine_runs: 300, partner_runs: 324 })).parts).toHaveLength(2);
  });
});

describe('bowling row', () => {
  it('gives the overs, runs and economy', () => {
    const r = bowlRow(bowl());
    expect(r.title).toBe('wickets with SCJ Broad');
    expect(r.detail).toBe('15.2 overs, 38 runs, econ 2.48, v Ireland, Jul 2019');
    expect(r.parts.map((p) => p.value)).toEqual([6, 4]);
    expect(r.total).toBe(10);
  });
  it('counts balls and economy per five in The Hundred', () => expect(bowlRow(bowl({ hundred: true, balls: 30, runs: 30, wickets: 3, mine_wickets: 2, partner_wickets: 1 })).detail).toBe('30 balls, 30 runs, econ 5.00 (5), v Ireland, Jul 2019'));
  it('says wicket for one', () => expect(bowlRow(bowl({ wickets: 1, mine_wickets: 1, partner_wickets: 0 })).title).toBe('wicket with SCJ Broad'));
});
