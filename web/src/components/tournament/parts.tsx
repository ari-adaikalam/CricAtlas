import type { ReactNode } from 'react';
import { EntityLink } from '../EntityLink';
import { NameLink } from '../NameLink';
import type { TileDef } from '../TileCarousel';
import { marginOf, type TInnings, type TMatch } from '@/domain/tournament';
import { SPLIT_LABEL, type PlayerAgg, type Split, type SplitTile } from '@/domain/tournamentPlayers';
import { NoMatches } from '../team/teamUi';
import type { Ctx } from './tournamentUi';

/** The match a row is about, as a link to its page. */
export function MatchRef({ m, children }: { m: TMatch; children: ReactNode }) {
  return <EntityLink entity={{ kind: 'match', id: m.id, name: `${m.team1} v ${m.team2}`, teams: [m.team1, m.team2], date: m.date }}>{children}</EntityLink>;
}

export const matchName = (m: TMatch): string => `${m.team1} v ${m.team2}`;

/** A tile of the Tournament page. The tag is Cricsheet for all of them: nothing here comes from tracking. */
export function tile(id: string, label: string, group: string, title: string, tip: string, body: ReactNode, wide = false, control?: ReactNode): TileDef {
  return { id, label, group, title, tip, tag: 'Cricsheet', ...(wide ? { wide: true } : {}), ...(control ? { control } : {}), body };
}

/** What a Players tile says while the players file is on its way, or when it could not be read. A tile with innings chips reads the lines of the innings it is set to (Tests have no split). */
export function PlayersReady({ c, tile, children }: { c: Ctx; tile?: SplitTile; children: (agg: readonly PlayerAgg[]) => ReactNode }) {
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  if (c.players.status === 'error') return <div className="thin">The players of this tournament could not be read.</div>;
  const split: Split = tile && c.format !== 'TEST' ? c.splits[tile] : 'all';
  const agg = c.aggs ? c.aggs[split] : null;
  if (agg === null) return <div className="thin">Loading players</div>;
  return <>{children(agg)}</>;
}

/** The innings chips in a tile's head: Overall, 1st innings, Chasing. A Test has four innings, so it gets none. */
export function splitControl(c: Ctx, tile: SplitTile): ReactNode {
  if (c.format === 'TEST') return undefined;
  return (
    <span className="sw msw" role="group" aria-label="Innings">
      {(['all', 'first', 'chase'] as const).map((k) => <button key={k} type="button" className={c.splits[tile] === k ? 'on' : undefined} onClick={() => c.onSplit(tile, k)}>{SPLIT_LABEL[k]}</button>)}
    </span>
  );
}

/** A list under a heading that stays put: only the rows scroll, with a scroll bar that stays visible. */
export function TpList({ children }: { children: ReactNode }) {
  return <div className="tpl">{children}</div>;
}

/** A team's name as a link to its page, with no emblem (for the small line under a player or a row). Inside a row that leads to a match, the click stays the name's own. */
export function TeamText({ id, name, inRow = false }: { id: string | null; name: string; inRow?: boolean }) {
  if (!id || !name) return <>{name}</>;
  const entity = { kind: 'team', id, name } as const;
  return inRow ? <NameLink entity={entity}>{name}</NameLink> : <EntityLink entity={entity}>{name}</EntityLink>;
}

/** "Gujarat Titans won by 7 wickets (8 balls left)" with the winner's name as a link, or the margin alone when nobody won ("tied", "no result"). */
export function ResultText({ m, innings, names, inRow = false }: { m: TMatch; innings: ReadonlyMap<number, readonly TInnings[]>; names: ReadonlyMap<string, string>; inRow?: boolean }) {
  const margin = marginOf(m, innings);
  if (!m.winnerId) return <>{margin}</>;
  return <><TeamText id={m.winnerId} name={names.get(m.winnerId) ?? ''} inRow={inRow} /> won {margin}</>;
}
