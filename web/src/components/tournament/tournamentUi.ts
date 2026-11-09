import type { ReactNode } from 'react';
import type { EditionResult, Fmt, TFilters, TInnings, TMatch, TournamentInfo } from '@/domain/tournament';
import type { TournamentPlayers } from '@/data/tournamentData';
import type { PlayerAgg, Split, SplitTile } from '@/domain/tournamentPlayers';
import type { Loaded } from '../team/teamUi';

/** What every tile of the Tournament page reads. `ms` is the matches under all the filters, `inFormat` every match of the chosen format (the editions' champions are read from it, whatever the Stage and Edition filters say). */
export interface Ctx {
  info: TournamentInfo;
  format: Fmt;
  filters: TFilters;
  ms: readonly TMatch[];
  inFormat: readonly TMatch[];
  innings: ReadonlyMap<number, readonly TInnings[]>;
  results: readonly EditionResult[];
  /** Team id to its latest name. */
  names: ReadonlyMap<string, string>;
  players: Loaded<TournamentPlayers>;
  /** The players' lines over the matches under the filters, once the players file has arrived. */
  agg: readonly PlayerAgg[] | null;
  /** The same lines for the first innings and the second, for the tiles that have innings chips. */
  aggs: Readonly<Record<Split, readonly PlayerAgg[]>> | null;
  splits: Readonly<Record<SplitTile, Split>>;
  onSplit: (tile: SplitTile, split: Split) => void;
  /** The Match list's search text, kept in the page so it survives a view change. */
  query: string;
  onQuery: (text: string) => void;
  onClear: () => void;
  onPickTeam: (id: string | null) => void;
  onPickVenue: (venue: string | null) => void;
}

export type TileBody = (c: Ctx) => ReactNode;
