'use client';

import { useMemo, type ReactNode } from 'react';
import { usePhone } from '../usePhone';
import { EntityLink } from '../EntityLink';
import { useFitRows } from '../useFitRows';
import { useTableMotion } from '../useTableMotion';
import { useMatchRowLink } from '../useMatchRowLink';
import { CountText } from '../charts/CountUp';
import { int, Kn, NoMatches, pct, TeamName } from '../team/teamUi';
import type { TileDef } from '../TileCarousel';
import { editionLabel, monthYear, scoreOf, titleRows, type TMatch } from '@/domain/tournament';
import { keyNumbers, knockouts, stageSteps, tableSet } from '@/domain/tournamentTables';
import { leadersByEdition } from '@/domain/tournamentPlayers';
import { MatchRef, matchName, ResultText, TeamText, TpList, tile } from './parts';
import type { Ctx } from './tournamentUi';


function KeyBody({ c }: { c: Ctx }) {
  const k = useMemo(() => keyNumbers(c.ms, c.innings, c.format), [c.ms, c.innings, c.format]);
  // The numbers count from the ones shown before to the new ones when a filter changes, as the tables of the other tiles play their rows again.
  const { ref, motion, played } = useTableMotion<HTMLDivElement>(`${k.matches}:${k.runs}:${k.wickets}:${c.format}`, `${k.matches}:${k.runs}`);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  const test = c.format === 'TEST', hundred = c.format === 'HUNDRED';
  const top = k.highest ? c.ms.find((m) => m.id === k.highest!.matchId) : undefined;
  const n = (v: number | null, d = 0): ReactNode => (v === null ? '-' : <CountText value={v} format={(x) => (d ? x.toFixed(d) : int.format(Math.round(x)))} play={played} morph />);
  return (
    <div className="kgrid k12" ref={ref} data-rows={motion}>
      {c.filters.edition === null ? <Kn value={n(k.editions)} label={k.editions === 1 ? 'edition' : 'editions'} /> : <Kn value={n(k.runsPerMatch)} label="runs per match" />}
      <Kn value={n(k.matches)} label="matches" />
      <Kn value={n(k.teams)} label="teams" />
      <Kn value={n(k.grounds)} label="grounds" />
      <Kn value={n(k.runs)} label="runs" />
      <Kn value={n(k.wickets)} label="wickets" />
      <Kn value={n(k.fours)} label="fours" />
      <Kn value={n(k.sixes)} label="sixes" />
      <Kn value={n(k.avgFirst)} label={test ? 'average first innings total' : 'average first innings score'} />
      <Kn value={n(k.avgSecond)} label={test ? 'average second innings total' : 'average second innings score'} />
      <Kn value={n(k.runRate, 2)} label={hundred ? 'runs per 100 balls' : 'runs per over'} />
      <Kn value={k.highest ? `${k.highest.runs}${k.highest.wkts < 10 ? `/${k.highest.wkts}` : ''}` : '-'}
        label={k.highest && top ? <>highest total, <TeamText id={k.highest.teamId} name={c.names.get(k.highest.teamId) ?? ''} />, <MatchRef m={top}>{editionLabel(top.edition)}</MatchRef></> : 'highest total'} />
    </div>
  );
}

function SummaryBody({ c }: { c: Ctx }) {
  const edition = c.filters.edition;
  const r = c.results.find((e) => e.edition === edition);
  const all = useMemo(() => c.inFormat.filter((m) => m.edition === edition), [c.inFormat, edition]);
  const steps = useMemo(() => stageSteps(all, c.innings, c.format, c.names), [all, c.innings, c.format, c.names]);
  const leaders = useMemo(() => (c.players.status === 'ready' && edition ? leadersByEdition(c.players.data.bat, c.players.data.bowl, all).get(edition) : undefined), [c.players, all, edition]);
  const rowLink = useMatchRowLink();
  const key = `${edition}:${steps.length}`;
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  const name = (id: string | null): string => (id ? (c.names.get(id) ?? id) : '-');
  const f = r?.final;
  const li = (n: string, who: ReactNode, sub: ReactNode) => <div className="tpr" key={n}><span className="tpp"><b>{who}</b><em>{sub}</em></span></div>;
  return (
    <div className="esum" ref={ref} data-rows={motion}>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <Kn value={r?.championId ? <TeamName id={r.championId} name={name(r.championId)} size={22} /> : '-'} label="champion" />
        <Kn value={r?.runnerUpId ? <TeamName id={r.runnerUpId} name={name(r.runnerUpId)} size={22} /> : '-'} label="runner-up" />
      </div>
      {f && <div className="slnote">Final: <ResultText m={f} innings={c.innings} names={c.names} /></div>}
      <div className="tpc"><h5 className="sub">Leaders</h5>
        <div className="lead">
        {li('scorer', leaders?.scorer ? <EntityLink entity={{ kind: 'player', id: leaders.scorer.id, name: leaders.scorer.name }}>{leaders.scorer.name}</EntityLink> : '-', `Top scorer${leaders?.scorer ? `, ${int.format(leaders.scorer.runs)} runs` : ''}`)}
        {li('taker', leaders?.taker ? <EntityLink entity={{ kind: 'player', id: leaders.taker.id, name: leaders.taker.name }}>{leaders.taker.name}</EntityLink> : '-', `Top wicket taker${leaders?.taker ? `, ${leaders.taker.wkts} wickets` : ''}`)}
        {li('potm', f?.potm ? <EntityLink entity={{ kind: 'player', id: f.potmId, name: f.potm }}>{f.potm}</EntityLink> : '-', 'Player of the final')}
        </div>
      </div>
      <div className="tpc stg"><h5 className="sub">Stage by stage</h5><TpList>
        {steps.map((s, i) => {
          const match = s.matchId === null ? undefined : c.inFormat.find((m) => m.id === s.matchId);
          return (
            <div className={`tpr${match ? ' go' : ''}`} key={`${s.name}:${i}`} {...(match ? rowLink(match.id, matchName(match)) : {})}>
              <span className="tpp"><b>{s.name}</b><em>{s.kind === 'league' ? `${s.matches} ${s.matches === 1 ? 'match' : 'matches'}` : '1 match'}</em></span>
              <span className="tpv">{s.leaderId ? <TeamText id={s.leaderId} name={name(s.leaderId)} inRow={Boolean(match)} /> : '-'}<small>{s.kind === 'league' ? ' on top' : s.loserId ? <> beat <TeamText id={s.loserId} name={name(s.loserId)} inRow={Boolean(match)} /></> : ''}</small></span>
            </div>
          );
        })}
      </TpList></div>
    </div>
  );
}

function TitlesBody({ c }: { c: Ctx }) {
  const rows = useMemo(() => {
    const inScope = new Set(c.ms.map((m) => m.edition));
    return titleRows(c.results.filter((e) => inScope.has(e.edition)), c.names);
  }, [c.ms, c.results, c.names]);
  const key = rows.map((r) => `${r.id}:${r.titles}:${r.finals}`).join('|');
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  const max = Math.max(1, ...rows.map((r) => r.finals));
  return (
    <>
      <div className="hbw ttl2" ref={ref} data-rows={motion}>
        {rows.length === 0 && <div className="thin">No finals in this slice.</div>}
        {rows.map((r) => (
          <div className="hbr" key={r.id} data-rk={r.id} title={r.titles ? `${r.name}: ${[...r.years].sort().join(', ')}` : `${r.name}: no title`} style={{ gridTemplateColumns: 'minmax(180px,1.7fr) 3fr 36px 64px' }}>
            <span><TeamName id={r.id} name={r.name} size={16} /></span>
            <i><u style={{ width: `${(r.finals / max) * 100}%`, background: '#56B4E9' }} /><u className="ov" style={{ width: `${(r.titles / max) * 100}%`, background: '#EBC862' }} /></i>
            <b>{r.titles}</b><em>{r.finals} {r.finals === 1 ? 'final' : 'finals'}</em>
          </div>
        ))}
      </div>
    </>
  );
}

function WinnersBody({ c }: { c: Ctx }) {
  const rowLink = useMatchRowLink();
  const inScope = useMemo(() => new Set(c.ms.map((m) => m.edition)), [c.ms]);
  const rows = useMemo(() => c.results.filter((e) => inScope.has(e.edition)), [c.results, inScope]);
  const leaders = useMemo(() => (c.players.status === 'ready' ? leadersByEdition(c.players.data.bat, c.players.data.bowl, c.inFormat) : null), [c.players, c.inFormat]);
  const key = rows.map((r) => r.edition).join('|');
  const fitRef = useFitRows<HTMLDivElement>(`${rows.length}:${leaders ? 1 : 0}`);
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key, fitRef);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  const name = (id: string | null): string => (id ? (c.names.get(id) ?? id) : '-');
  return (
    <div className="tw sc sqb" ref={ref} data-rows={motion}>
      <table className="fst">
        <thead><tr>{['Edition', 'Champion', 'Runner-up', 'Final', 'Top scorer', 'Top wicket taker', 'Final player of the match'].map((h) => <th key={h} className="l">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => {
            const l = leaders?.get(r.edition);
            const f = r.final;
            return (
              <tr key={r.edition} data-rk={r.edition} {...(f ? rowLink(f.id, matchName(f)) : {})}>
                <td className="l"><b>{r.label}</b></td>
                <td className="l bold"><span>{r.championId ? <TeamName id={r.championId} name={name(r.championId)} size={16} inRow /> : '-'}</span></td>
                <td className="l">{r.runnerUpId ? <TeamName id={r.runnerUpId} name={name(r.runnerUpId)} size={16} inRow /> : '-'}</td>
                <td className="l">{f ? <ResultText m={f} innings={c.innings} names={c.names} inRow /> : '-'}</td>
                <td className="l">{l?.scorer ? <><EntityLink entity={{ kind: 'player', id: l.scorer.id, name: l.scorer.name }}>{l.scorer.name}</EntityLink> ({int.format(l.scorer.runs)})</> : leaders ? '-' : ''}</td>
                <td className="l">{l?.taker ? <><EntityLink entity={{ kind: 'player', id: l.taker.id, name: l.taker.name }}>{l.taker.name}</EntityLink> ({l.taker.wkts})</> : leaders ? '-' : ''}</td>
                <td className="l">{f?.potm ? <EntityLink entity={{ kind: 'player', id: f.potmId, name: f.potm }}>{f.potm}</EntityLink> : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableBody({ c }: { c: Ctx }) {
  const phone = usePhone();
  const set = useMemo(() => tableSet(c.ms, c.innings, c.format, c.names, c.info.kind), [c.ms, c.innings, c.format, c.names, c.info.kind]);
  const key = set ? `${set.title}:${set.groups.map((g) => g.rows.map((r) => r.id).join(',')).join('|')}` : '';
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  if (!set) return <div className="thin">The Stage filter is set to Knockouts, so there are no league matches to build a table from.</div>;
  const test = c.format === 'TEST';
  const head = test ? ['#', 'Team', 'Mat', 'Won', 'Lost', 'Draw', 'Pts', 'PCT'] : ['#', 'Team', 'Mat', 'Won', 'Lost', 'Tie', 'NR', 'Pts', 'NRR'];
  return (
    <>
      <div className={`tabs2${set.groups.length === 1 ? ' one' : ''}`} ref={ref} data-rows={motion}>
        {set.groups.map((g) => (
          <div className="fsc" key={g.title || 'all'}>
            {g.title && <h5 className="sub">{g.title}</h5>}
            <table className="fst">
              <thead><tr>{head.map((h, i) => <th key={h} className={i === 1 ? 'l' : undefined}>{h}</th>)}</tr></thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={r.id} data-rk={`${g.title}:${r.id}`}>
                    <td>{i + 1}</td>
                    <td className="l"><b><TeamName id={r.id} name={r.name} size={16} short={phone} /></b></td>
                    <td>{r.played}</td><td>{r.won}</td><td>{r.lost}</td>
                    {test ? <td>{r.drawn}</td> : <><td>{r.tied}</td><td>{r.nr}</td></>}
                    <td className="bold"><span>{r.points}</span></td>
                    <td>{test ? `${r.pct.toFixed(1)}%` : r.nrr === null ? '-' : `${r.nrr >= 0 ? '+' : ''}${r.nrr.toFixed(3)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}

function KnockoutsBody({ c }: { c: Ctx }) {
  const rowLink = useMatchRowLink();
  const ko = useMemo(() => knockouts(c.ms), [c.ms]);
  const key = ko.editions.map((e) => e.edition).join('|');
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  if (ko.matches === 0) return <div className="thin">No knockout matches in this slice. The Stage filter is set to League stage, or the edition has none in the data.</div>;
  const name = (id: string): string => c.names.get(id) ?? id;
  const resultOf = new Map(c.results.map((r) => [r.edition, r]));
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {ko.editions.length === 1 ? (
          <>
            <Kn value={ko.matches} label={ko.matches === 1 ? 'knockout match' : 'knockout matches'} />
            <Kn value={ko.decided ? `${ko.chased} of ${ko.decided}` : '-'} label="won by the team batting second" />
            <Kn value={(() => { const f = ko.editions[0]!.final; return f?.winnerId && f.batFirstId ? (f.winnerId === f.batFirstId ? 'Batting first' : 'Batting second') : '-'; })()} label="side that won the final" />
          </>
        ) : (
          <>
            <Kn value={ko.matches} label={`knockout matches in ${ko.editions.length} editions`} />
            <Kn value={pct(ko.decided ? ko.chased / ko.decided : null)} label="won by the team batting second" />
            <Kn value={ko.finals ? `${ko.finalsChased} of ${ko.finals}` : '-'} label="finals won by the team batting second" />
          </>
        )}
      </div>
      <div className={`kos${ko.editions.length === 1 ? ' one' : ''}`} ref={ref} data-rows={motion}>
        {ko.editions.map((e) => {
          const r = resultOf.get(e.edition);
          const finals = e.matches.filter((m) => m.stageName === 'Final');
          return (
            <div className="ked" key={e.edition}>
              <h5 className="sub">{e.label}{r?.championId && <> <em>Champion {name(r.championId)}{r.runnerUpId ? `, beat ${name(r.runnerUpId)}` : ''}</em></>}</h5>
              <div className="kcs">
                {e.matches.map((m: TMatch) => (
                  <div className={`kc go${m.stageName === 'Final' ? ' fin' : ''}`} key={m.id} {...rowLink(m.id, matchName(m))}>
                    <div className="kh"><b>{m.stageName === 'Final' && finals.length > 1 ? `Final ${finals.indexOf(m) + 1} of ${finals.length}` : m.stageName}</b><span>{monthYear(m.date)}{m.venue ? `, ${m.venue}` : ''}</span></div>
                    {[m.team1Id, m.team2Id].map((id) => (
                      <div className={`kr${m.winnerId === id ? ' win' : ''}`} key={id}><span><TeamName id={id} name={name(id)} size={16} inRow /></span><b>{scoreOf(c.innings, m.id, id) || '-'}</b></div>
                    ))}
                    <div className="kf"><span><ResultText m={m} innings={c.innings} names={c.names} inRow /></span>{m.potm && <em>Player of the match: <EntityLink entity={{ kind: 'player', id: m.potmId, name: m.potm }}>{m.potm}</EntityLink></em>}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function overviewTiles(c: Ctx): TileDef[] {
  const test = c.format === 'TEST';
  const single = c.filters.edition !== null;
  return [
    tile('key', 'Key numbers', c.filters.edition === null ? 'Editions' : 'Edition', 'Key numbers', 'Totals for the matches that match the filters.', <KeyBody c={c} />),
    ...(single
      ? [tile('ed', 'Edition summary', 'Edition', `${editionLabel(c.filters.edition!)} summary`, 'The champion, the leaders and each stage of the edition.', <SummaryBody c={c} />)]
      : [
        tile('titles', 'Titles by team', 'Editions', 'Titles by team', 'Titles and final appearances in the editions that match the filters.', <TitlesBody c={c} />),
        tile('win', 'Winners by edition', 'Editions', 'Winners by edition', 'The champion of each edition, from the match tagged Final.', <WinnersBody c={c} />, true),
      ]),
    tile('table', 'Table', 'League stage', c.filters.edition ? `Table, ${editionLabel(c.filters.edition)}` : 'Table, all editions', `Teams ordered by points, then by net run rate. A win is ${test ? '12 points, a draw 4 and a tie 6' : '2 points, a tie with no winner or a no result 1, and a tie settled by a Super Over goes to its winner'}. Net run rate counts a full quota when a side was all out${c.format === 'HUNDRED' ? ', per 100 balls in The Hundred' : ''}. Points are worked out from results, so a table may differ from the official one.`, <TableBody c={c} />, true),
    tile('ko', 'Knockouts', 'Knockouts', 'Knockouts', 'Every knockout match in the filters, with the scores, the result and the player of the match.', <KnockoutsBody c={c} />, true),
  ];
}
