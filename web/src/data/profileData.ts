import type { SummaryRow } from '@/domain/batting';
import type { BowlFormInnings, FormInnings } from '@/domain/profile';
import { loadCareerDetail, type CareerDetail } from './career';
import { dataBaseUrl } from './sources';
import { deviceCapability } from '@/domain/device';
import { prefetchViewCaches } from './queryCache';
import { prefetchPlayer, setPlayerFiles } from './store';
import { loadPlayer, loadSummary, PLAYER_ID, type Player } from './player';
import { loadAwards, loadBowlForm, loadForm } from './profile';

/** Everything the profile page shows, in one object. */
export interface ProfileBundle {
  v: 1;
  player: Player;
  rows: SummaryRow[];
  form: FormInnings[];
  bowlForm: BowlFormInnings[];
  awards: number;
  detail: CareerDetail;
  /** The kinds of per-player file this player has (p/<kind>/<id>.parquet), written by the build. Absent in a bundle computed in the browser. */
  has?: string[];
}

/** The bundle worked out with the data loaders. The build script runs this for every player (tools in web/scripts), and it is the fallback when a bundle file is missing. */
export async function computeProfile(playerId: string): Promise<ProfileBundle | null> {
  if (!PLAYER_ID.test(playerId)) return null;
  const [player, rows, form, bowlForm, detail] = await Promise.all([loadPlayer(playerId), loadSummary(playerId), loadForm(playerId), loadBowlForm(playerId), loadCareerDetail(playerId)]);
  if (!player) return null;
  return { v: 1, player, rows, form, bowlForm, awards: await loadAwards(player.name), detail };
}

/**
 * The profile page's data. Built ahead of time as one small JSON file for each player (p/profile/<id>.json), so the page needs a single request and no query engine.
 * A player with no file is looked up with the loaders instead, which is slower but gives the same answer.
 */
const fetched = new Map<string, Promise<ProfileBundle | null>>();

/** Starts loading a photo so it is in the browser's cache when the profile shows it. The photo comes from its host and can take a second, so it starts the moment the profile's address is known. */
const warmed = new Set<string>();
export function warmPhoto(url: string | null | undefined): void {
  if (!url || warmed.has(url) || typeof Image === 'undefined') return;
  warmed.add(url);
  const image = new Image();
  image.referrerPolicy = 'no-referrer';
  image.src = url;
}

/**
 * The player page asks the browser to preload the profile file (`preload` in the route), which is right for a page opened by its address. When the file was fetched earlier (the pointer was on a
 * name, a search result was shown) the page reuses that answer and never fetches again, so the browser reports a preload that was not used. A fetch of the same address, answered from the
 * browser's cache, is the use it is waiting for.
 */
const touched = new Set<string>();
function touchPreload(url: string): void {
  if (touched.has(url) || typeof document === 'undefined') return;
  if (!document.querySelector(`link[rel="preload"][href="${url}"]`)) return;
  touched.add(url);
  fetch(url).catch(() => undefined);
}

export function fetchProfile(playerId: string): Promise<ProfileBundle | null> {
  if (!PLAYER_ID.test(playerId)) return Promise.resolve(null);
  const have = fetched.get(playerId);
  if (have) { touchPreload(`${dataBaseUrl()}/p/profile/${playerId}.json`); return have; }
  const promise = (async () => {
    const response = await fetch(`${dataBaseUrl()}/p/profile/${playerId}.json`);
    if (response.ok) { const bundle = (await response.json()) as ProfileBundle; if (bundle.has) setPlayerFiles(playerId, bundle.has); warmPhoto(bundle.player['image url']); return bundle; }
    if (response.status !== 404) throw new Error(`The profile of ${playerId} answered ${response.status}`);
    return computeProfile(playerId);
  })().catch((error: unknown) => { fetched.delete(playerId); throw error; });
  fetched.set(playerId, promise);
  // A few recent players stay, so going back to one is instant. Each is a few tens of kilobytes.
  while (fetched.size > 24) { const oldest = fetched.keys().next().value; if (oldest === undefined) break; fetched.delete(oldest); }
  return promise;
}

/** Starts fetching a profile so it is there when the page asks, for example for the top results of a search. */
export function prefetchProfile(playerId: string): void { fetchProfile(playerId).catch(() => undefined); }

/** Every kind of per-player file, for prefetching. A kind the player does not have is skipped once their profile has said so. */
export const PLAYER_KINDS = ['bat', 'bowl', 'dis', 'bi', 'wi', 'pt', 'pm', 'tm', 'tr', 'lo', 'bp', 'fd'] as const;

/**
 * Fetches a player's profile, then their recorded views (about 46 KB each) and, on a device that can afford it, the files of their views too, so a click on the player is instant. The files wait for the
 * profile so that none is asked for that does not exist. A light device gets the profile and the recorded views only: those make the first look instant, and its data allowance
 * and memory are kept for what the user opens.
 */
export function prefetchPlayerAll(playerId: string): void {
  fetchProfile(playerId)
    .then(() => { prefetchViewCaches(playerId); if (deviceCapability() === 'full') prefetchPlayer(playerId, PLAYER_KINDS); })
    .catch(() => undefined);
}
