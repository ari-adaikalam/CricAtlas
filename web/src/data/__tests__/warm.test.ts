import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const loader = (name: string, wait = 0) => (...args: unknown[]) => { calls.push(`${name}:${args.join(',')}`); return new Promise((r) => setTimeout(() => r(null), wait)); };
vi.mock('../matchData', () => ({ fetchMatch: (id: number) => loader('match', 20)(id) }));
vi.mock('../homeData', () => ({ fetchHome: () => loader('home')(), fetchReplay: (i: number) => loader('replay')(i) }));
vi.mock('../matchList', () => ({ fetchMatchList: () => loader('matchList')() }));
vi.mock('../playerList', () => ({ fetchPlayerList: () => loader('playerList')() }));
vi.mock('../profileData', () => ({ fetchProfile: (id: string) => loader('profile', 20)(id) }));
vi.mock('../recordFiles', () => ({ fetchRecordsIndex: () => loader('records')() }));
vi.mock('../teamData', () => ({ fetchTeam: (s: string) => loader('team', 20)(s), fetchTeamIndex: () => loader('teamIndex')(), isTeamSlug: (s: string) => /^[a-z0-9-]+~[a-z0-9-]+~(male|female)$/.test(s) }));
vi.mock('../tournamentData', () => ({ fetchTournament: (k: string) => loader('tournament', 20)(k), fetchTournamentIndex: () => loader('tournamentIndex')(), isTournamentKey: (k: string) => /^[a-z0-9-]+$/.test(k) }));

import { dataOnItsWay, warmData } from '../warm';

beforeEach(() => { calls.length = 0; });

describe('warmData', () => {
  it('loads the one file each kind of page reads first', async () => {
    await warmData('/matches/india-v-pakistan-2022-10-23-1298150');
    await warmData('/players/v-kohli-ba607b88');
    await warmData('/teams/india~intl~male');
    await warmData('/tournaments/ipl');
    expect(calls).toEqual(['match:1298150', 'profile:ba607b88', 'team:india~intl~male', 'tournament:ipl']);
  });
  it('loads what Home reads first', async () => {
    await warmData('/');
    expect(calls).toEqual(['home:', 'replay:0']);
  });
  it('loads the lists of a root page', async () => {
    await warmData('/matches');
    expect(calls).toEqual(['matchList:', 'tournamentIndex:']);
  });
  it('loads both sides of a Compare page', async () => {
    await warmData('/compare/players?a=ba607b88&b=0a1b2c3d');
    await warmData('/compare/teams?a=india~intl~male&b=australia~intl~male');
    expect(calls).toEqual(['profile:ba607b88', 'profile:0a1b2c3d', 'team:india~intl~male', 'team:australia~intl~male']);
  });
  it('ignores addresses with nothing to load', () => {
    for (const a of ['/api', '/players/not-an-id', '/matches/nothing', '/teams/x', '/players/a/b']) expect(warmData(a)).toBeNull();
    expect(calls).toEqual([]);
  });
  it('can be waited for while it is on its way, and is forgotten once it is here', async () => {
    const started = warmData('/matches/india-v-pakistan-2022-10-23-1298150');
    expect(dataOnItsWay('/matches/india-v-pakistan-2022-10-23-1298150')).toBe(started);
    await started;
    await Promise.resolve();
    expect(dataOnItsWay('/matches/india-v-pakistan-2022-10-23-1298150')).toBeNull();
  });
  it('does not ask twice while the first ask is on its way', async () => {
    const a = warmData('/players/ba607b88'), b = warmData('/players/ba607b88');
    expect(a).toBe(b); await a;
    expect(calls).toEqual(['profile:ba607b88']);
  });
});
