import type { BallFilters } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import { loadBatReviews } from './batReviews';
import { loadBatDismissals, loadDismissalMap } from './batDismissals';
import { loadBatProgression } from './batProgression';
import { loadBowlBatters } from './bowlBatters';
import { loadBowlDismissals } from './bowlDismissals';
import { loadBowlInnings } from './bowlInnings';
import { loadBowlPhases, loadLengthByPhase } from './bowlPhases';
import { loadBowlProgression } from './bowlProgression';
import { loadBowlReviews } from './bowlReviews';
import { loadBowlSeasons } from './bowlSeasons';
import { loadBowlFalseShotInnings, loadBowlLocated, loadBowlShots } from './bowlTracking';
import { loadBowlingSlice } from './bowlingSlice';
import { loadControlRows, loadFalseShotInnings } from './control';
import { loadInnings } from './innings';
import { loadAwardMatches, loadPace } from './milestones';
import { loadOpponentCells } from './opponents';
import { loadPhases } from './phases';
import { loadPitch } from './pitch';
import { loadBattingSlice } from './profile';
import { loadBatPartnerships, loadBowlPartnerships } from './partnerships';
import { loadBatInnings, loadBiggestPartnership, loadBowlInnings as loadBowlInningsRecords } from './records';
import { loadCombos, loadOpponents, loadStyleCounts } from './scope';
import { loadScopeTeams } from './scopeTeams';
import { loadPlayerMatches } from './streaks';
import { loadTrophies } from './trophies';
import { loadSeasons } from './seasons';
import { loadLocatedBalls, loadShots } from './shots';
import { loadShotMix } from './shotMix';
import { loadShotTypeCounts, loadTypeCounts } from './types';

// What each view asks for, in one place. The view components call the loaders listed here, and the build script (web/scripts/build-views.ts) runs the same functions in Node with the
// default filters and records every answer, so the browser can serve a player's first look at a view without starting the query engine (queryCache.ts). A filter change asks a
// different question, misses that cache, and is answered by the engine from the player's files in memory.

/**
 * The sixteen datasets of the Batting analysis tiles, each as its own promise, so a tile can fill in as soon as its data is ready. The ones that are recorded arrive at once,
 * and the per-ball ones (every shot) wait for the query engine without holding the rest back.
 */
export function startBatCore(playerId: string, filters: PlayerFilters, ball: BallFilters) {
  // The query engine answers one question after another, so everything asked at once is answered in the order it was asked. The two tiles on screen first (Key numbers and Form) are asked
  // first, and the rest only once they are answered, so a filter change updates what is in front of the user in a fraction of the time the whole view takes.
  const slice = loadBattingSlice(playerId, filters, ball), innings = loadInnings(playerId, filters, ball);
  const gate = Promise.all([slice, innings]).then(() => undefined, () => undefined);
  const later = <T,>(run: () => Promise<T>): Promise<T> => gate.then(run);
  return {
    slice, innings,
    shots: later(() => loadShots(playerId, filters, ball)), phases: later(() => loadPhases(playerId, filters, ball)),
    seasons: later(() => loadSeasons(playerId, filters, ball)), dismissals: later(() => loadBatDismissals(playerId, filters, ball)), cells: later(() => loadOpponentCells(playerId, filters, ball, 'bat')),
    progression: later(() => loadBatProgression(playerId, filters, ball)), types: later(() => loadTypeCounts(playerId, filters, ball)), shotTypes: later(() => loadShotTypeCounts(playerId, filters, ball)),
    mix: later(() => loadShotMix(playerId, filters, ball)), located: later(() => loadLocatedBalls(playerId, filters, ball)), control: later(() => loadControlRows(playerId, filters, ball)),
    falseInnings: later(() => loadFalseShotInnings(playerId, filters, ball)), outMap: later(() => loadDismissalMap(playerId, filters, ball)), reviews: later(() => loadBatReviews(playerId, filters, ball)),
  };
}

/** The fourteen datasets of the Bowling analysis tiles, each as its own promise (see startBatCore for why Key numbers and Form are asked first). */
export function startBowlCore(playerId: string, filters: PlayerFilters, ball: BallFilters) {
  const slice = loadBowlingSlice(playerId, filters, ball), innings = loadBowlInnings(playerId, filters, ball);
  const gate = Promise.all([slice, innings]).then(() => undefined, () => undefined);
  const later = <T,>(run: () => Promise<T>): Promise<T> => gate.then(run);
  return {
    slice, innings,
    phases: later(() => loadBowlPhases(playerId, filters, ball)),
    seasons: later(() => loadBowlSeasons(playerId, filters, ball)), dismissals: later(() => loadBowlDismissals(playerId, filters, ball)), lengths: later(() => loadLengthByPhase(playerId, filters, ball)),
    progression: later(() => loadBowlProgression(playerId, filters, ball)), batters: later(() => loadBowlBatters(playerId, filters, ball)), cells: later(() => loadOpponentCells(playerId, filters, ball, 'bowl')),
    landing: later(() => loadPitch(playerId, filters, ball, 'all')), falseInnings: later(() => loadBowlFalseShotInnings(playerId, filters, ball)), located: later(() => loadBowlLocated(playerId, filters, ball)),
    shots: later(() => loadBowlShots(playerId, filters, ball)), reviews: later(() => loadBowlReviews(playerId, filters, ball)),
  };
}

/** All of a view's datasets together, for the build script. */
export const loadBatCore = (playerId: string, filters: PlayerFilters, ball: BallFilters) => Promise.all(Object.values(startBatCore(playerId, filters, ball)));
export const loadBowlCore = (playerId: string, filters: PlayerFilters, ball: BallFilters) => Promise.all(Object.values(startBowlCore(playerId, filters, ball)));

/** The datasets of the Records tiles that follow the Season choice. */
export function loadRecordsScope(playerId: string, filters: PlayerFilters) {
  return Promise.all([loadBatInnings(playerId, filters), loadBowlInningsRecords(playerId, filters), loadBiggestPartnership(playerId, filters), loadBatPartnerships(playerId, filters), loadBowlPartnerships(playerId, filters), loadPlayerMatches(playerId, filters)]);
}

/** The datasets of the Records Trophies tile. Season is applied afterwards, so the answer does not depend on it. */
export function loadRecordsTrophies(playerId: string, filters: PlayerFilters) {
  return loadTrophies(playerId, { ...filters, season: null });
}

/** The datasets of the Records milestone tiles, which are career figures (no Season). */
export function loadRecordsCareer(playerId: string, filters: PlayerFilters) {
  const wide = { ...filters, season: null };
  return Promise.all([loadBatInnings(playerId, wide), loadBowlInningsRecords(playerId, wide), loadAwardMatches(playerId, wide), loadPace(playerId, wide, 'bat'), loadPace(playerId, wide, 'bowl')]);
}

/** Everything the Batting analysis view asks for when it opens in its default state. */
export async function runBatView(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<void> {
  await Promise.all([loadCombos(playerId, filters, 'bat', ball), loadStyleCounts(playerId, filters, ball), loadOpponents(playerId, filters, 'bat', ball), loadBatCore(playerId, filters, ball), loadScopeTeams(playerId, filters, 'bat')]);
}

/** Everything the Bowling analysis view asks for when it opens in its default state. */
export async function runBowlView(playerId: string, filters: PlayerFilters, ball: BallFilters): Promise<void> {
  await Promise.all([loadCombos(playerId, filters, 'bowl', ball), loadOpponents(playerId, filters, 'bowl', ball), loadBowlCore(playerId, filters, ball), loadScopeTeams(playerId, filters, 'bowl')]);
}

/** Everything the Records view asks for when it opens in its default state. */
export async function runRecordsView(playerId: string, filters: PlayerFilters): Promise<void> {
  await Promise.all([loadRecordsScope(playerId, filters), loadRecordsCareer(playerId, filters), loadRecordsTrophies(playerId, filters)]);
}
