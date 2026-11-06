'use client';

import { useMemo, type ReactNode } from 'react';
import { EntityLink } from '../EntityLink';
import { useFitRows } from '../useFitRows';
import { useMatchRowLink } from '../useMatchRowLink';
import { useTableMotion } from '../useTableMotion';
import { int, Kn, TeamName } from '../team/teamUi';
import type { TileDef } from '../TileCarousel';
import { editionLabel, type Fmt } from '@/domain/tournament';
import { average, bestPerformances, bowlAverage, economy, mostRuns, mostWickets, potmSummary, rateLeaders, strikeRate, type PlayerAgg } from '@/domain/tournamentPlayers';
import { pickSide, useSides } from '../analysis/useSides';
import { matchName, PlayersReady, splitControl, TeamText, TpList, tile } from './parts';
import type { Ctx } from './tournamentUi';

const num = (v: number | null, d = 1): string => (v === null ? '-' : v.toFixed(d));
const overs = (balls: number, format: Fmt): string => (format === 'HUNDRED' ? String(balls) : `${Math.floor(balls / 6)}.${balls % 6}`);

const PlayerName = ({ p, c }: { p: { id: string; name: string; teamId: string }; c: Ctx }) => (
  <><b><EntityLink entity={{ kind: 'player', id: p.id, name: p.name }}>{p.name}</EntityLink></b><em><TeamText id={p.teamId} name={c.names.get(p.teamId) ?? ''} /></em></>
);

/** One ranked line: a number, a name with a line under it, and a figure at the right. */
function Li({ n, name, sub, value, row }: { n: ReactNode; name: ReactNode; sub: ReactNode; value: ReactNode; row?: object }) {
  return <div className={`tpr${row ? ' go' : ''}`} {...row}><span className="tpn">{n}</span><span className="tpp"><b>{name}</b><em>{sub}</em></span><span className="tpv">{value}</span></div>;
}

function RunsBody({ c }: { c: Ctx }) {
  return <PlayersReady c={c} tile="runs">{(agg) => <RunsTable c={c} rows={mostRuns(agg)} />}</PlayersReady>;
}
function RunsTable({ c, rows }: { c: Ctx; rows: PlayerAgg[] }) {
  const key = rows.map((r) => r.id).join('|');
  const fitRef = useFitRows<HTMLDivElement>(`${rows.length}`);
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key, fitRef);
  return (
    <div className="tw sc sqb" ref={ref} data-rows={motion}>
      <table className="fst">
        <thead><tr>{['Player', 'Mat', 'Inns', 'Runs', 'HS', 'Avg', 'SR', '4s', '6s'].map((h, i) => <th key={h} className={i ? undefined : 'l'}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} data-rk={p.id}>
              <td className="l"><PlayerName p={p} c={c} /></td><td>{p.matches}</td><td>{p.inns}</td><td className="bold"><span>{int.format(p.runs)}</span></td>
              <td>{p.high ? `${p.high.runs}${p.high.out ? '' : '*'}` : '-'}</td><td>{num(average(p))}</td><td>{num(strikeRate(p))}</td><td>{p.fours}</td><td>{p.sixes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WicketsBody({ c }: { c: Ctx }) {
  return <PlayersReady c={c} tile="wkts">{(agg) => <WicketsTable c={c} rows={mostWickets(agg)} />}</PlayersReady>;
}
function WicketsTable({ c, rows }: { c: Ctx; rows: PlayerAgg[] }) {
  const key = rows.map((r) => r.id).join('|');
  const fitRef = useFitRows<HTMLDivElement>(`${rows.length}`);
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key, fitRef);
  return (
    <div className="tw sc sqb" ref={ref} data-rows={motion}>
      <table className="fst">
        <thead><tr>{['Player', 'Mat', c.format === 'HUNDRED' ? 'Balls' : 'Overs', 'Runs', 'Wkts', 'BBI', 'Avg', 'Econ', 'SR'].map((h, i) => <th key={h} className={i ? undefined : 'l'}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} data-rk={p.id}>
              <td className="l"><PlayerName p={p} c={c} /></td><td>{p.matches}</td><td>{overs(p.bowlBalls, c.format)}</td><td>{int.format(p.conceded)}</td><td className="bold"><span>{p.wkts}</span></td>
              <td>{p.best ? `${p.best.wkts}/${p.best.conceded}` : '-'}</td><td>{num(bowlAverage(p))}</td><td>{num(economy(p, c.format), 2)}</td><td>{num(p.wkts ? p.bowlBalls / p.wkts : null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BestBody({ c }: { c: Ctx }) {
  return <PlayersReady c={c} tile="best">{(agg) => <BestLists c={c} agg={agg} />}</PlayersReady>;
}
function BestLists({ c, agg }: { c: Ctx; agg: readonly PlayerAgg[] }) {
  const rowLink = useMatchRowLink();
  const b = useMemo(() => bestPerformances(agg, c.format), [agg, c.format]);
  const byId = useMemo(() => new Map(c.ms.map((m) => [m.id, m])), [c.ms]);
  const who = useMemo(() => new Map(agg.map((p) => [p.id, p])), [agg]);
  const key = `${b.innings[0]?.id}|${b.figures[0]?.id}|${b.innings.length}`;
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key);
  const opp = (id: string, edition: string): ReactNode => <>v <TeamText id={id} name={c.names.get(id) ?? ''} inRow />, {editionLabel(edition)}</>;
  const hi = b.innings[0], bf = b.figures[0];
  const link = (id: number): object | undefined => { const m = byId.get(id); return m ? rowLink(m.id, matchName(m)) : undefined; };
  const { bar, side } = useSides(['Best innings', 'Best bowling']);
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Kn value={hi ? `${hi.runs}${hi.out ? '' : '*'}` : '-'} label={hi ? `highest score, ${who.get(hi.id)?.name ?? ''} (${hi.balls} balls)` : 'highest score'} />
        <Kn value={bf ? `${bf.wkts}/${bf.conceded}` : '-'} label={bf ? `best figures, ${who.get(bf.id)?.name ?? ''}` : 'best figures'} />
        <Kn value={b.fifties} label="scores of 50 or more" />
        <Kn value={b.hauls} label={`${b.haulAt === 5 ? 'five' : 'three'} wicket hauls`} />
      </div>
      {bar}
      <div className="tpg two" ref={ref} data-rows={motion}>
        {pickSide([
        <div className="tpc" key="i"><h5 className="sub">Best innings</h5><TpList>
          {b.innings.slice(0, 10).map((x, i) => <Li key={`${x.matchId}:${x.id}:${i}`} n={i + 1} name={<EntityLink entity={{ kind: 'player', id: x.id, name: who.get(x.id)?.name ?? '' }}>{who.get(x.id)?.name ?? ''}</EntityLink>} sub={opp(x.oppId, x.edition)} value={<>{x.runs}{x.out ? '' : '*'} <i>({x.balls})</i></>} row={link(x.matchId)} />)}
        </TpList></div>,
        <div className="tpc" key="f"><h5 className="sub">Best bowling figures</h5><TpList>
          {b.figures.slice(0, 10).map((x, i) => <Li key={`${x.matchId}:${x.id}:${i}`} n={i + 1} name={<EntityLink entity={{ kind: 'player', id: x.id, name: who.get(x.id)?.name ?? '' }}>{who.get(x.id)?.name ?? ''}</EntityLink>} sub={opp(x.oppId, x.edition)} value={`${x.wkts}/${x.conceded}`} row={link(x.matchId)} />)}
        </TpList></div>,
        ], side)}
      </div>
    </>
  );
}

function PotmBody({ c }: { c: Ctx }) {
  return <PlayersReady c={c}>{(agg) => <PotmLists c={c} agg={agg} />}</PlayersReady>;
}
function PotmLists({ c, agg }: { c: Ctx; agg: readonly PlayerAgg[] }) {
  const rowLink = useMatchRowLink();
  const raw = c.players.status === 'ready' ? c.players.data : { bat: [], bowl: [] };
  const s = useMemo(() => potmSummary(agg, raw.bat, raw.bowl, c.ms), [agg, raw.bat, raw.bowl, c.ms]);
  const key = `${s.awards}|${s.most[0]?.id}`;
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key);
  const max = Math.max(1, ...s.byTeam.map((t) => t.awards));
  const { bar, side } = useSides(['Most awards', 'In the final', 'Awards by team']);
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <Kn value={s.awards} label="awards given" /><Kn value={s.winners} label="different winners" /><Kn value={s.repeat} label="won it more than once" />
      </div>
      {bar}
      <div className="tpg" ref={ref} data-rows={motion}>
        {pickSide([
        <div className="tpc" key="m"><h5 className="sub">Most awards</h5><TpList>
          {s.most.slice(0, 10).map((p, i) => <Li key={p.id} n={i + 1} name={<EntityLink entity={{ kind: 'player', id: p.id, name: p.name }}>{p.name}</EntityLink>} sub={<TeamText id={p.teamId} name={c.names.get(p.teamId) ?? ''} />} value={p.potm} />)}
          {s.most.length === 0 && <div className="thin">None.</div>}
        </TpList></div>,
        <div className="tpc fin" key="f"><h5 className="sub">In the final</h5><TpList>
          {s.finals.map((m) => <Li key={m.id} n={editionLabel(m.edition)} name={<EntityLink entity={{ kind: 'player', id: m.potmId, name: m.potm ?? '' }}>{m.potm}</EntityLink>} sub={m.winnerId ? <><TeamText id={m.winnerId} name={c.names.get(m.winnerId) ?? ''} inRow /> won</> : 'No winner'} value="" row={rowLink(m.id, matchName(m))} />)}
          {s.finals.length === 0 && <div className="thin">No finals in this slice.</div>}
        </TpList></div>,
        <div className="tpc" key="t"><h5 className="sub">Awards by team</h5><TpList>
          <div className="hbw">
            {s.byTeam.slice(0, 10).map((t) => (
              <div className="hbr hb2" key={t.teamId} style={{ gridTemplateColumns: 'minmax(120px,2.2fr) 2fr 30px' }}>
                <span><TeamName id={t.teamId} name={c.names.get(t.teamId) ?? t.teamId} size={16} /></span>
                <i><u style={{ width: `${(t.awards / max) * 100}%`, background: '#EBC862' }} /></i><b>{t.awards}</b>
              </div>
            ))}
          </div>
        </TpList></div>,
        ], side)}
      </div>
    </>
  );
}

function RatesBody({ c }: { c: Ctx }) {
  return <PlayersReady c={c} tile="rate">{(agg) => <RatesLists c={c} agg={agg} />}</PlayersReady>;
}
function RatesLists({ c, agg }: { c: Ctx; agg: readonly PlayerAgg[] }) {
  const test = c.format === 'TEST';
  const r = useMemo(() => rateLeaders(agg, c.format), [agg, c.format]);
  const key = `${r.bat[0]?.id}|${r.bowl[0]?.id}|${r.fours.length}`;
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key);
  const col = (head: string, rows: PlayerAgg[], sub: (p: PlayerAgg) => ReactNode, value: (p: PlayerAgg) => ReactNode) => (
    <div className="tpc" key={head}><h5 className="sub">{head}</h5><TpList>
      {rows.slice(0, 10).map((p, i) => <Li key={p.id} n={i + 1} name={<EntityLink entity={{ kind: 'player', id: p.id, name: p.name }}>{p.name}</EntityLink>} sub={sub(p)} value={value(p)} />)}
      {rows.length === 0 && <div className="thin">Nobody reaches the minimum.</div>}
    </TpList></div>
  );
  const team = (p: PlayerAgg): ReactNode => <TeamText id={p.teamId} name={c.names.get(p.teamId) ?? ''} />;
  const { bar, side } = useSides([test ? 'Batting average' : 'Strike rate', test ? 'Bowling average' : 'Economy', test ? '50s' : 'Sixes', 'Fours']);
  return (
    <>
      {bar}
      <div className="tpg four" ref={ref} data-rows={motion}>
        {pickSide([
        col(test ? 'Best batting average' : 'Best strike rate', r.bat, (p) => `${p.runs} runs`, (p) => (test ? num(average(p)) : num(strikeRate(p)))),
        col(test ? 'Best bowling average' : c.format === 'HUNDRED' ? 'Best economy per 5 balls' : 'Best economy', r.bowl, (p) => `${p.wkts} wickets`, (p) => (test ? num(bowlAverage(p)) : num(economy(p, c.format), 2))),
        col(test ? 'Most scores of 50 or more' : 'Most sixes', r.third, team, (p) => (test ? p.fifties : p.sixes)),
        col('Most fours', r.fours, team, (p) => p.fours),
        ], side)}
      </div>
    </>
  );
}

export function playersTiles(c: Ctx): TileDef[] {
  return [
    tile('runs', 'Most runs', 'Batting and bowling', 'Most runs', 'The ten highest run scorers in the matches that match the filters.', <RunsBody c={c} />, true, splitControl(c, 'runs')),
    tile('wkts', 'Most wickets', 'Batting and bowling', 'Most wickets', `The ten highest wicket takers.`, <WicketsBody c={c} />, true, splitControl(c, 'wkts')),
    tile('best', 'Best performances', 'Highlights', 'Best performances', 'The best single innings by runs and the best bowling figures in one match, from the matches that match the filters.', <BestBody c={c} />, true, splitControl(c, 'best')),
    tile('potm', 'Player of the match', 'Highlights', 'Player of the match', 'The players with the most Player of the match awards, and the award in each final.', <PotmBody c={c} />, true),
    tile('rate', 'Rates and averages', 'Highlights', 'Rates and averages', c.format === 'TEST' ? 'Best batting averages, best bowling averages, most scores of 50 or more and most fours among players with enough runs or wickets.' : 'Best strike rates, best economy rates, most sixes and most fours among players who faced or bowled enough balls.', <RatesBody c={c} />, true, splitControl(c, 'rate')),
  ];
}
