/** The exported files the app reads, and where they are served from. */
export const DATA_FILES = {
  players: 'players.parquet',
  summary: 'player_summary.parquet',
  ballsByBatter: 'balls_by_batter.parquet',
  ballsByBowler: 'balls_by_bowler.parquet',
  ballsByMatch: 'balls_by_match.parquet',
  dismissalsByBatter: 'dismissals_by_batter.parquet',
  matches: 'matches.parquet',
  wickets: 'wickets.parquet',
  wicketFielders: 'wicket_fielders.parquet',
  reviews: 'reviews.parquet',
  batInnings: 'bat_innings.parquet',
  bowlInnings: 'bowl_innings.parquet',
  partnerships: 'partnerships_by_player.parquet',
  milestonePace: 'milestone_pace.parquet',
  matchPeople: 'match_people.parquet',
  playerMatches: 'player_matches.parquet',
  tandems: 'tandems_by_player.parquet',
  trophies: 'trophies_by_player.parquet',
  letoff: 'letoff_by_bowler.parquet',
  positions: 'positions_by_bowler.parquet',
  fielding: 'fielding_by_player.parquet',
} as const;

export type DataFile = (typeof DATA_FILES)[keyof typeof DATA_FILES];

/**
 * Files that hold one row-set per player are split into a small file for each player (tools/player_files.py). The browser fetches a player's file whole, in one request, and
 * registers it under the same name the queries use, so a query reads the current player's rows from memory and never makes a request of its own.
 */
export const PLAYER_KIND = {
  'balls_by_batter.parquet': 'bat',
  'balls_by_bowler.parquet': 'bowl',
  'dismissals_by_batter.parquet': 'dis',
  'bat_innings.parquet': 'bi',
  'bowl_innings.parquet': 'wi',
  'partnerships_by_player.parquet': 'pt',
  'player_matches.parquet': 'pm',
  'tandems_by_player.parquet': 'tm',
  'trophies_by_player.parquet': 'tr',
  'letoff_by_bowler.parquet': 'lo',
  'positions_by_bowler.parquet': 'bp',
  'fielding_by_player.parquet': 'fd',
} as const satisfies Partial<Record<DataFile, string>>;
export type PlayerKind = (typeof PLAYER_KIND)[keyof typeof PLAYER_KIND];

/** Small tables every page uses. Each is fetched whole, once, and kept (they are under a megabyte each). */
export const SHARED_FILES: ReadonlySet<DataFile> = new Set<DataFile>(['players.parquet', 'player_summary.parquet', 'matches.parquet', 'milestone_pace.parquet', 'reviews.parquet']);

export function dataBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_DATA_BASE_URL;
  if (!base) throw new Error('NEXT_PUBLIC_DATA_BASE_URL is not set. Copy .env.example to .env.local.');
  return base.replace(/\/$/, '');
}
