'use client';

import { usePhone } from '../usePhone';
import { pickSide, useSides } from '../analysis/useSides';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EntityLink } from '../EntityLink';
import { useFitRows } from '../useFitRows';
import { REVEALED, useTableMotion } from '../useTableMotion';
import { useWindowedRows } from '../useWindowedRows';
import { dateText, int, Loaded, MatchLink, NoMatches, one } from './teamUi';
import type { Ctx } from './ResultsTiles';
import type { TeamPlayerRow } from '@/domain/team';
import { bestFigures, bestInnings, economyBalls, fielders, leaderLists, searchSquad, sortSquad, squad, usedGrid, type Leader, type Single, type SquadKey, type SquadSort } from '@/domain/teamPlayers';

/** The player file loads after the first paint. Until it arrives a tile says so, and a file that failed says that. */
export type Rows = Loaded<TeamPlayerRow[]>;

function Waiting({ rows, children }: { rows: Rows; children: (rows: TeamPlayerRow[]) => React.ReactNode }) {
  if (rows.status === 'loading') return <div className="thin">Loading the players</div>;
  if (rows.status === 'error') return <div className="thin">The player file of this team could not be read.</div>;
  return <>{children(rows.data)}</>;
}

const COLS: ReadonlyArray<readonly [string, SquadKey, string]> = [
  ['Player', 'name', 'The player. Click the name for the player page'], ['Mat', 'matches', 'Matches the player was used in'], ['Not used', 'notUsed', 'Matches the player was named for and not used'],
  ['Inns', 'inns', 'Innings batted'], ['Runs', 'runs', 'Runs scored for the team'], ['HS', 'high', 'Highest score in a match'], ['Avg', 'average', 'Runs per dismissal'],
  ['SR', 'strikeRate', 'Runs per 100 balls'], ['Wkts', 'wkts', 'Wickets taken'], ['Bowl avg', 'bowlAverage', 'Runs conceded per wicket'], ['Econ', 'economy', 'Runs conceded per over (per 5 balls in The Hundred)'],
  ['Ct', 'catches', 'Catches'], ['POTM', 'potm', 'Player of the match awards'],
];

/**
 * Players used: every player used in the matches in scope with batting, bowling and fielding totals. Click a column to sort, type to search by name, click a name for the player page. A player used
 * is named for the team and batted, bowled or fielded, and Not used counts the matches a player was named and did not play.
 */
export function SquadBody({ c, players, query }: { c: Ctx; players: Rows; query: string }) {
  const phone = usePhone();
  const [sort, setSort] = useState<SquadSort>({ key: 'matches', dir: -1 });
  const all = useMemo(() => (players.status === 'ready' ? squad(players.data, c.ms) : []), [players, c.ms]);
  const rows = useMemo(() => sortSquad(searchSquad(all, query), sort), [all, query, sort]);
  const fitRef = useFitRows<HTMLDivElement>(`${rows.length}:${sort.key}:${sort.dir}`);
  const win = useWindowedRows<HTMLDivElement>(rows.length, `${rows.length}:${query}:${c.ms.length}`);
  const { ref, motion } = useTableMotion<HTMLDivElement>(`${all.length}:${c.ms.length}`, rows.map((r) => r.id).join('|'), fitRef, win.ref);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  const unit = economyBalls(c.ms);
  const best = { avg: Math.max(0, ...all.filter((r) => r.balls >= 300).map((r) => r.average ?? 0)), sr: Math.max(0, ...all.filter((r) => r.balls >= 300).map((r) => r.strikeRate ?? 0)) };
  return (
    <Waiting rows={players}>{() => (
      <div className="tw sc sqb" ref={ref} data-rows={motion}>
        <table className="fst sqt" style={{ tableLayout: 'fixed' }}>
          <colgroup>{COLS.map(([h], i) => <col key={h} style={{ width: i ? `${78 / (COLS.length - 1)}%` : '22%' }} />)}</colgroup>
          <thead><tr>{COLS.map(([h, k, hint], i) => (
            <th key={h} title={hint} className={`${i ? '' : 'l '}srt${sort.key === k ? (sort.dir > 0 ? ' asc' : ' desc') : ''}`} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === 'name' || k === 'bowlAverage' || k === 'economy' ? 1 : -1 }))}>{k === 'economy' && unit === 5 ? 'Econ (5)' : h}</th>
          ))}</tr></thead>
          <tbody>
            {win.before > 0 && <tr data-spacer="" aria-hidden="true"><td colSpan={COLS.length} style={{ height: win.before, padding: 0, border: 0 }} /></tr>}
            {rows.slice(win.from, win.to).map((r, k) => (
              <tr key={r.id} data-rk={r.id} data-late={win.windowed && win.from + k >= REVEALED ? '' : undefined}>
                <td className="l"><b><EntityLink entity={{ kind: 'player', id: r.id, name: r.name }}>{r.name}</EntityLink></b></td>
                <td>{r.matches}</td><td className="mut">{r.notUsed || '-'}</td><td>{r.inns || '-'}</td><td className="bold"><span>{int.format(r.runs)}</span></td><td>{r.inns ? r.high : '-'}</td>
                <td className={r.average !== null && r.average === best.avg && best.avg > 0 ? 'bst' : ''}><span>{one(r.average)}</span></td>
                <td className={r.strikeRate !== null && r.strikeRate === best.sr && best.sr > 0 ? 'bst' : ''}><span>{one(r.strikeRate)}</span></td>
                <td className="bold"><span>{r.wkts || '-'}</span></td><td>{one(r.bowlAverage)}</td><td>{r.economy === null ? '-' : r.economy.toFixed(2)}</td><td>{r.catches || '-'}</td><td>{r.potm || '-'}</td>
              </tr>
            ))}
            {win.after > 0 && <tr data-spacer="" aria-hidden="true"><td colSpan={COLS.length} style={{ height: win.after, padding: 0, border: 0 }} /></tr>}
            {rows.length === 0 && <tr><td className="l" colSpan={COLS.length}><span className="thin">No player matches &ldquo;{query}&rdquo;.</span></td></tr>}
          </tbody>
          <tfoot><tr><td className="l" colSpan={COLS.length}><b>{rows.length} of {all.length} players</b></td></tr></tfoot>
        </table>
        {phone && <p className="sqn">{rows.length} of {all.length} players</p>}
      </div>
    )}</Waiting>
  );
}

function Board({ title, leaders, unit }: { title: string; leaders: readonly Leader[]; unit?: string }) {
  return (
    <div className="tpc">
      <h5 className="sub">{title}</h5>
      {leaders.length === 0 ? <div className="thin">None.</div> : leaders.map((l, i) => (
        <div className="tpr" key={l.id}><span className="tpn">{i + 1}</span><span className="tpp"><b><EntityLink entity={{ kind: 'player', id: l.id, name: l.name }}>{l.name}</EntityLink></b><em>{l.matches} {l.matches === 1 ? 'match' : 'matches'}</em></span><span className="tpv">{l.text}{unit ? <small> {unit}</small> : null}</span></div>
      ))}
    </div>
  );
}

/** The boards of a group: all of them side by side off a phone, and on a phone one at a time, picked by a chip for each (the chips come from the boards' titles). */
function BoardSet({ className, titles, children }: { className: string; titles: readonly string[]; children: ReactNode[] }) {
  const { bar, side } = useSides(titles);
  return <>{bar}<div className={className}>{pickSide(children, side)}</div></>;
}

function Singles({ title, items, c }: { title: string; items: readonly Single[]; c: Ctx }) {
  return (
    <div className="tpc">
      <h5 className="sub">{title}</h5>
      {items.length === 0 ? <div className="thin">None.</div> : items.map((s, i) => {
        const m = c.ms.find((x) => x.id === s.matchId);
        return (
          <div className="tpr" key={`${s.id}${s.matchId}`}><span className="tpn">{i + 1}</span>
            <span className="tpp"><b><EntityLink entity={{ kind: 'player', id: s.id, name: s.name }}>{s.name}</EntityLink></b><em>{m ? <MatchLink m={m} team={c.team}>v {s.opp}, {dateText(s.date)}</MatchLink> : `v ${s.opp}`}</em></span>
            <span className="tpv">{s.text}</span></div>
        );
      })}
    </div>
  );
}

/**
 * Top performers: three groups behind a switch. Batting has most runs, best average, best strike rate and the highest scores; Bowling has most wickets, best average, best economy and the best figures;
 * Fielding and awards has most catches and most Player of the match awards. Rates count only players with enough balls, a line that scales with the team (domain/teamPlayers.ts, minBalls).
 */
export function TopBody({ c, players, group }: { c: Ctx; players: Rows; group: 'bat' | 'bowl' | 'field' }) {
  const rows = useMemo(() => (players.status === 'ready' ? players.data : []), [players]);
  const sq = useMemo(() => squad(rows, c.ms), [rows, c.ms]);
  const lists = useMemo(() => leaderLists(sq, c.ms), [sq, c.ms]);
  const hs = useMemo(() => bestInnings(rows, c.ms), [rows, c.ms]);
  const bf = useMemo(() => bestFigures(rows, c.ms), [rows, c.ms]);
  const field = useMemo(() => fielders(rows, c.ms), [rows, c.ms]);
  const fieldTop = (value: (f: (typeof field)[number]) => number): Leader[] => [...field].filter((f) => value(f) > 0).sort((a, b) => value(b) - value(a) || b.matches - a.matches || a.name.localeCompare(b.name)).slice(0, 5)
    .map((f) => ({ id: f.id, name: f.name, value: value(f), text: String(value(f)), matches: f.matches }));
  // The first group plays with the tile (globals.css, data-seen). A group chosen later plays its rows in once. Going back to a group that was already shown puts it on screen at once.
  const [shownGroups, setShownGroups] = useState<ReadonlySet<string>>(() => new Set([group]));
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => {
    if (shownGroups.has(group)) { setFresh(null); return; }
    setShownGroups((was) => new Set(was).add(group));
    setFresh(group);
  }, [group]); // eslint-disable-line react-hooks/exhaustive-deps
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  return (
    <Waiting rows={players}>{() => (
      <>
        {group === 'bat' && <BoardSet key="bat" className={`tpg tp4${fresh === 'bat' ? ' tpin' : ''}`} titles={['Most runs', 'Average', 'Strike rate', 'Highest']}><Board key="a" title="Most runs" leaders={lists.runs} /><Board key="b" title="Best average" leaders={lists.average} /><Board key="c" title="Best strike rate" leaders={lists.strikeRate} /><Singles key="d" title="Highest scores" items={hs} c={c} /></BoardSet>}
        {group === 'bowl' && <BoardSet key="bowl" className={`tpg tp4${fresh === 'bowl' ? ' tpin' : ''}`} titles={['Wickets', 'Average', 'Economy', 'Figures']}><Board key="a" title="Most wickets" leaders={lists.wickets} /><Board key="b" title="Best average" leaders={lists.bowlAverage} /><Board key="c" title="Best economy" leaders={lists.economy} /><Singles key="d" title="Best figures" items={bf} c={c} /></BoardSet>}
        {group === 'field' && <BoardSet key="field" className={`tpg tp5${fresh === 'field' ? ' tpin' : ''}`} titles={['Dismissals', 'Catches', 'Stumpings', 'Run outs', 'Awards']}>
          <Board key="a" title="Most dismissals" leaders={fieldTop((f) => f.total)} /><Board key="b" title="Catches" leaders={fieldTop((f) => f.catches)} /><Board key="c" title="Stumpings" leaders={fieldTop((f) => f.stumpings)} />
          <Board key="d" title="Run outs" leaders={fieldTop((f) => f.runOuts)} /><Board key="e" title="Player of the match" leaders={lists.potm} /></BoardSet>}
      </>
    )}</Waiting>
  );
}

/** Players used by season: players down, seasons across, each cell the matches the player was used in. The top row counts the players used in the season and the debutants. */
export function UsedBody({ c, players }: { c: Ctx; players: Rows }) {
  const rows = useMemo(() => (players.status === 'ready' ? players.data : []), [players]);
  const g = useMemo(() => usedGrid(rows, c.ms, c.national), [rows, c.ms, c.national]);
  const fitRef = useFitRows<HTMLDivElement>(`${g.rows.length}:${g.seasons.length}`);
  const win = useWindowedRows<HTMLDivElement>(g.rows.length, `${g.rows.length}:${g.seasons.length}`);
  const { ref, motion } = useTableMotion<HTMLDivElement>(`${g.rows.length}:${g.seasons.length}`, g.rows.map((r) => r.id).join('|'), fitRef, win.ref);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  const peak = Math.max(1, ...g.rows.flatMap((r) => r.cells.map((x) => x ?? 0)));
  return (
    <Waiting rows={players}>{() => (
      <div className="tw sc ugrid" ref={ref} data-rows={motion}>
        <table className="fst ug">
          <colgroup><col style={{ width: 160 }} /><col style={{ width: 52 }} />{g.seasons.map((x) => <col key={x} style={{ width: 46 }} />)}</colgroup>
          <thead>
            <tr><th className="l">Player</th><th title="Matches used in these seasons">Mat</th>{g.seasons.map((s) => <th key={s} title={s}>{`'${s.slice(2)}`}</th>)}</tr>
            <tr className="ugs"><th className="l" title="Players used in the season">Players</th><th />{g.perSeason.map((n, i) => <th key={i}>{n}</th>)}</tr>
            <tr className="ugs"><th className="l" title="Players whose first season in these matches it is">Debuts</th><th />{g.debuts.map((n, i) => <th key={i}>{n}</th>)}</tr>
          </thead>
          <tbody>
            {win.before > 0 && <tr data-spacer="" aria-hidden="true"><td colSpan={g.seasons.length + 2} style={{ height: win.before, padding: 0, border: 0 }} /></tr>}
            {g.rows.slice(win.from, win.to).map((r, k) => (
              <tr key={r.id} data-rk={r.id} data-late={win.windowed && win.from + k >= REVEALED ? '' : undefined}>
                <td className="l"><b><EntityLink entity={{ kind: 'player', id: r.id, name: r.name }}>{r.name}</EntityLink></b></td><td className="bold"><span>{r.total}</span></td>
                {r.cells.map((x, i) => <td key={i} className={x ? 'ugc' : 'ugn'} style={x ? { background: `rgba(86,180,233,${0.12 + 0.6 * (x / peak)})` } : undefined} title={x ? `${r.name}, ${g.seasons[i]}: ${x} ${x === 1 ? 'match' : 'matches'}` : undefined}>{x ?? ''}</td>)}
              </tr>
            ))}
            {win.after > 0 && <tr data-spacer="" aria-hidden="true"><td colSpan={g.seasons.length + 2} style={{ height: win.after, padding: 0, border: 0 }} /></tr>}
          </tbody>
        </table>
      </div>
    )}</Waiting>
  );
}
