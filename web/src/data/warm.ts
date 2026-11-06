import { fetchMatchList } from './matchList';
import { fetchPlayerList } from './playerList';
import { fetchRecordsIndex } from './recordFiles';
import { fetchTeamIndex } from './teamData';
import { fetchTournamentIndex } from './tournamentData';

// The data a root page reads first (the lists its table and filters are made from). Each loader keeps its answer, so warming one on hover and then opening the page costs nothing twice.
const DATA: Readonly<Record<string, ReadonlyArray<() => Promise<unknown>>>> = {
  '/players': [fetchPlayerList, fetchTournamentIndex],
  '/teams': [fetchTeamIndex, fetchTournamentIndex],
  '/matches': [fetchMatchList, fetchTournamentIndex],
  '/tournaments': [fetchTournamentIndex],
  '/series': [fetchMatchList],
  '/records': [fetchRecordsIndex],
};

/** Starts loading what the page at this path will need, ahead of the click. Failures are ignored: the page asks again when it opens. */
export function warmData(path: string): void {
  for (const load of DATA[path] ?? []) load().catch(() => undefined);
}
