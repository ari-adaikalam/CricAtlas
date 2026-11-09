import { cleanSearch, type SearchGender } from '@/domain/search';
import { bestTeam, bestTournamentScore, pairOf, rankTeams, rankTournaments, type PairHit } from '@/domain/navSearch';
import { searchPlayers } from './search';
import type { MatchHit } from '@/domain/matchSearch';
import { toRoot, type RootTeam } from '@/domain/teamsRoot';
import type { TournamentInfo } from '@/domain/tournament';
import { fetchTeamIndex } from './teamData';
import { fetchTournamentIndex } from './tournamentData';
import { searchMatches, prefetchMatchSearch } from './matchData';

export interface Everything { /** Two sides, "ind vs aus" or "kohli vs bumrah", as a Compare shortcut. */ pair: PairHit | null; /** How well the best team and the best tournament fit the text: 0 is exact. */ teamBest: number | null; tournamentBest: number | null; teams: RootTeam[]; tournaments: TournamentInfo[]; matches: MatchHit[]; /** How many matches fit the text in all, of which the box keeps a few. */ matchTotal: number }

const LIMIT = 3;
/** Matches are many ("india vs" fits thousands), so the box keeps ten and shows three beside other groups or all ten when matches are all there is. */
export const MATCH_LIMIT = 10;
let teams: Promise<RootTeam[]> | null = null;
const allTeams = (): Promise<RootTeam[]> => (teams ??= fetchTeamIndex().then((rows) => rows.map(toRoot)).catch((e: unknown) => { teams = null; throw e; }));

/** Starts the three lists so they are ready before anyone types. Together they are the team, tournament and match files the pages read anyway. */
export function prefetchEverything(): void {
  allTeams().catch(() => undefined);
  fetchTournamentIndex().catch(() => undefined);
  prefetchMatchSearch();
}

/** Teams, tournaments and matches for a typed text, a few of each. Nothing typed lists none, so the box opens on players as it always did. */
export async function searchEverything(text: string, gender: SearchGender): Promise<Everything> {
  if (!cleanSearch(text)) return { pair: null, teamBest: null, tournamentBest: null, teams: [], tournaments: [], matches: [], matchTotal: 0 };
  const [t, n, m] = await Promise.all([allTeams(), fetchTournamentIndex(), searchMatches(text, gender)]);
  const pair = await pairOf(text, t, gender, async (side) => { const hit = (await searchPlayers(side, 1, gender))[0]; return hit ? { id: hit.playerId, name: hit.name } : null; });
  const teamBest = bestTeam(text, t, gender)?.score ?? null;
  const tournamentBest = bestTournamentScore(text, n, gender);
  return { pair, teamBest, tournamentBest, teams: rankTeams(text, t, LIMIT, gender), tournaments: rankTournaments(text, n, LIMIT, gender), matches: m.slice(0, MATCH_LIMIT), matchTotal: m.length };
}
