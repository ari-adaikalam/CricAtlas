import type { ReactNode } from 'react';
import { EntityLink } from '../EntityLink';
import { NameLink } from '../NameLink';
import { TeamEmblem } from '../TeamEmblem';
import { teamAbbreviation } from '@/domain/profile';
import type { Counts, TeamMatch } from '@/domain/team';

/** Won is gold, lost is sky and everything else grey, as in the mockup and the player page's trophy chips. */
export const WON = '#EBC862', LOST = '#56B4E9', OTHER = '#6c717a';
export const WON_INK = '#2A1A00', LOST_INK = '#04243A';

export const int = new Intl.NumberFormat('en');
export const pct = (v: number | null): string => (v === null ? '-' : `${Math.round(v * 100)}%`);
export const one = (v: number | null): string => (v === null ? '-' : v.toFixed(1));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "12 Mar 2024" from an ISO date, with no time zone in the way. */
export function dateText(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''} ${y}`;
}
export const monthYear = (iso: string): string => `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''} ${iso.slice(0, 4)}`;

/** A team's name with its emblem, as a name that labels something. The name leads to the team page once it exists. */
export function TeamName({ id, name, size = 18, plain = false, inRow = false, short = false }: { id: string | null; name: string; size?: number; plain?: boolean; /** The initials in place of the name, for a table column too narrow for it (a phone). */ short?: boolean; /** The name sits in a row that does something when clicked, so the click of the name stays its own. */ inRow?: boolean }) {
  const label = <span className="tem"><TeamEmblem team={name} size={size} /></span>;
  const entity = { kind: 'team', id, name } as const;
  const shown = short ? teamAbbreviation(name) : name;
  return <span className="tnm" title={short ? name : undefined}>{label}{plain || id === null ? shown : inRow ? <NameLink entity={entity}>{shown}</NameLink> : <EntityLink entity={entity}>{shown}</EntityLink>}</span>;
}

/** The match a row is about, as a link to its page. */
export function MatchLink({ m, team, children }: { m: TeamMatch; team: string; children: ReactNode }) {
  return <EntityLink entity={{ kind: 'match', id: m.id, name: `${team} v ${m.opp}`, teams: [team, m.opp], date: m.date }}>{children}</EntityLink>;
}

/** A stacked bar of results: won, other (draws, ties) and lost in the tile's colours. A no result is left out of the bar. */
export function ResultBar({ c, big = true }: { c: Counts; big?: boolean }) {
  const d = c.played - c.nr || 1;
  const seg = (n: number, bg: string, ink: string, label: string) => (n === 0 ? null : (
    <i style={{ width: `${(n / d) * 100}%`, background: bg, color: ink }} title={`${label} ${n}`}>{n / d > 0.12 ? n : ''}</i>
  ));
  return <div className={`stk${big ? ' big' : ''}`}>{seg(c.won, WON, WON_INK, 'Won')}{seg(c.draw + c.tie, OTHER, '#fff', 'Drawn or tied')}{seg(c.lost, LOST, LOST_INK, 'Lost')}</div>;
}

/** One figure. It rises in with the tile (globals.css); a number is written with thousands separators. */
export function Kn({ value, label, wide = false }: { value: ReactNode; label: ReactNode; wide?: boolean }) {
  return <div className={`kn${wide ? ' w2' : ''}`}><b>{typeof value === 'number' ? int.format(value) : value}</b><span>{label}</span></div>;
}

/** What a tile says when no match is in the slice. */
export function NoMatches({ onClear }: { onClear: () => void }) {
  return <div className="thin">No matches in this slice. <button type="button" className="clr" onClick={onClear}>Clear filters</button></div>;
}

export const plural = (n: number, one: string, many = `${one}s`): string => `${int.format(n)} ${n === 1 ? one : many}`;

/** A file that loads after the first paint. */
export type Loaded<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/** Says what a tile waits for, then hands the data to its body. */
export function Ready<T>({ of, what, children }: { of: Loaded<T>; what: string; children: (data: T) => ReactNode }) {
  if (of.status === 'loading') return <div className="thin">Loading {what}</div>;
  if (of.status === 'error') return <div className="thin">The {what} of this team could not be read.</div>;
  return <>{children(of.data)}</>;
}
