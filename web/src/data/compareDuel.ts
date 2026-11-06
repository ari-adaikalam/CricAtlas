import { DEFAULT_BALL_FILTERS } from '@/domain/ballFilters';
import type { DuelInnings, Direction } from '@/domain/compareDuel';
import type { PlayerFilters } from '@/domain/filters';
import { query } from './engine';
import { BOWLER_WICKET } from './pitch';
import { PLAYER_ID } from './player';
import { BATTER_OUT, scopeWhere } from './scope';
import { DATA_FILES } from './sources';
import { withPlayer } from './withPlayer';

// The balls between two players, from the batter's own ball file: every ball the batter faced from the bowler, grouped by innings, with the way the bowler got them out and the balls and runs in each phase.

const FOURS = '(runs_off_bat = 4 and not coalesce(non_boundary, false))';
const PHASE = (tests: boolean): string => (tests ? `'band' || least(("over" // 20)::int, 4)` : 'phase');

/** The innings in which `batterId` faced `bowlerId` under the Format, Competition and Season. */
export async function loadDuel(batterId: string, bowlerId: string, dir: Direction, filters: PlayerFilters): Promise<DuelInnings[]> {
  if (!PLAYER_ID.test(batterId) || !PLAYER_ID.test(bowlerId)) return [];
  const tests = filters.format === 'TEST';
  return withPlayer(batterId, async () => {
    const { where, params } = scopeWhere(batterId, filters, 'bat', { ...DEFAULT_BALL_FILTERS, opponent: bowlerId });
    where.push('coalesce(wides, 0) = 0');
    const file = DATA_FILES.ballsByBatter;
    const [rows, phases] = await Promise.all([
      query<{ match_id: number; innings: number; date: string; format: string; tournament_key: string | null; balls: number; runs: number; fours: number; sixes: number; dismissal: string | null }>([file], `
        select match_id::int as match_id, innings::int as innings, min(strftime(start_date, '%Y-%m-%d')) as date, any_value(format) as format, any_value(tournament_key) as tournament_key,
          count(*)::int as balls, coalesce(sum(runs_off_bat), 0)::int as runs, sum(case when ${FOURS} then 1 else 0 end)::int as fours, sum(case when runs_off_bat = 6 then 1 else 0 end)::int as sixes,
          max(case when ${BATTER_OUT} and ${BOWLER_WICKET} then wicket_type end) as dismissal
        from '${file}' where ${where.join(' and ')} group by 1, 2`, params),
      query<{ match_id: number; innings: number; key: string; balls: number; runs: number }>([file], `
        select match_id::int as match_id, innings::int as innings, ${PHASE(tests)} as key, count(*)::int as balls, coalesce(sum(runs_off_bat), 0)::int as runs
        from '${file}' where ${where.join(' and ')} and ${PHASE(tests)} is not null group by 1, 2, 3`, params),
    ]);
    const by = new Map<string, DuelInnings['phases']>();
    for (const p of phases) { const k = `${p.match_id}|${p.innings}`; const m = by.get(k) ?? {}; m[p.key] = { balls: p.balls, runs: p.runs }; by.set(k, m); }
    return rows.map((r) => ({ ...r, dir, matchId: r.match_id, phases: by.get(`${r.match_id}|${r.innings}`) ?? {} })).map(({ match_id: _m, ...x }) => x as DuelInnings);
  });
}

/** One match both players were in, as the first player's side saw it. */
export interface SharedMatch { matchId: number; date: string; format: string; tournament_key: string | null; relation: 'Teammates' | 'Opponents'; resultForA: 'won' | 'lost' | 'other' }

/** The matches both players were in under the Format, Competition and Season: each player's matches (player_matches) put side by side on the match id. */
export async function loadSharedMatches(idA: string, idB: string, filters: PlayerFilters): Promise<SharedMatch[]> {
  if (!PLAYER_ID.test(idA) || !PLAYER_ID.test(idB)) return [];
  const read = (id: string) => withPlayer(id, async () => {
    const { where, params } = scopeWhere(id, filters, 'bat', undefined, 'player_id');
    return query<{ match_id: number; date: string; format: string; tournament_key: string | null; team: string; result: 'won' | 'lost' | 'other' }>([DATA_FILES.playerMatches], `
      select match_id::int as match_id, strftime(start_date, '%Y-%m-%d') as date, format, tournament_key, team, result from '${DATA_FILES.playerMatches}' where ${where.join(' and ')}`, params);
  });
  const [a, b] = [await read(idA), await read(idB)];
  const mine = new Map(b.map((m) => [m.match_id, m]));
  return a.filter((m) => mine.has(m.match_id)).map((m) => ({ matchId: m.match_id, date: m.date, format: m.format, tournament_key: m.tournament_key, relation: mine.get(m.match_id)!.team === m.team ? 'Teammates' as const : 'Opponents' as const, resultForA: m.result }))
    .sort((x, y) => y.date.localeCompare(x.date) || y.matchId - x.matchId);
}
