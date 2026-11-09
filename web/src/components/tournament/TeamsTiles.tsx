'use client';

import { useMemo, useState } from 'react';
import { BarChart } from '../charts/BarChart';
import { EntityLink } from '../EntityLink';
import { useFitRows } from '../useFitRows';
import { useMatchRowLink } from '../useMatchRowLink';
import { REVEALED, useTableMotion } from '../useTableMotion';
import { useWindowedRows } from '../useWindowedRows';
import { usePhone } from '../usePhone';
import { pickSide, useSides } from '../analysis/useSides';
import { dateText, Kn, NoMatches, pct, ResultBar, TeamName } from '../team/teamUi';
import type { TileDef } from '../TileCarousel';
import { editionLabel, isLeague, scoreOf, type TMatch } from '@/domain/tournament';
import { editionStatus, standings } from '@/domain/tournamentTables';
import {
  batFirstSplit, biggestWins, closestFinishes, matchList, sortRecords, sortVenues, teamRecords, tossSummary, totals, venueRows,
  type RecordKey, type RecordSort, type VenueKey, type VenueSort,
} from '@/domain/tournamentTeams';
import { matchName, ResultText, TeamText, TpList, tile } from './parts';
import type { Ctx } from './tournamentUi';
import { TipBody } from '../TipBody';

const GOLD = '#EBC862';
const ratio = (a: number | null, d = 0): string => (a === null ? '-' : a.toFixed(d));
const asCounts = (won: number, lost: number, other: number) => ({ played: won + lost + other, won, lost, draw: other, tie: 0, nr: 0, other, rate: null });

const RECORD_COLS: ReadonlyArray<readonly [string, RecordKey]> = [
  ['Team', 'name'], ['Eds', 'editions'], ['Mat', 'played'], ['Won', 'won'], ['Lost', 'lost'], ['Tie', 'other'], ['NR', 'nr'], ['Win %', 'rate'], ['Titles', 'titles'], ['Avg for', 'avgFor'], ['Avg against', 'avgAgainst'],
];

function RecordsBody({ c }: { c: Ctx }) {
  const phone = usePhone();
  const [sort, setSort] = useState<RecordSort>({ key: 'played', dir: -1 });
  const edition = c.filters.edition;
  // One edition: Position (rank in the league stage) and Result replace Eds and Titles.
  const status = useMemo(() => {
    if (edition === null) return null;
    const all = c.inFormat.filter((m) => m.edition === edition);
    const rank = new Map(standings(all.filter(isLeague), c.innings, c.format, c.names).map((r, i) => [r.id, i + 1]));
    const r = c.results.find((e) => e.edition === edition);
    return (id: string) => editionStatus(id, all, rank, r?.championId ?? null, r?.runnerUpId ?? null);
  }, [edition, c.inFormat, c.innings, c.format, c.names, c.results]);
  const rows = useMemo(() => sortRecords(teamRecords(c.ms, c.innings, c.names), sort), [c.ms, c.innings, c.names, sort]);
  const cols = status ? RECORD_COLS.filter(([, k]) => k !== 'editions' && k !== 'titles') : RECORD_COLS;
  const fitRef = useFitRows<HTMLDivElement>(`${rows.length}:${sort.key}:${sort.dir}:${cols.length}`);
  const { ref, motion } = useTableMotion<HTMLDivElement>(`${rows.length}:${c.ms.length}:${cols.length}`, rows.map((r) => r.id).join('|'), fitRef);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  return (
    <div className="tw sc sqb" ref={ref} data-rows={motion}>
      <table className="fst">
        <thead><tr>
          {cols.slice(0, 1).map(([h, k]) => <th key={h} className={`l srt${sort.key === k ? (sort.dir > 0 ? ' asc' : ' desc') : ''}`} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>{h}</th>)}
          {status && <th title="Rank in the league stage">Pos</th>}
          {cols.slice(1).map(([h, k]) => (
            <th key={h} className={`srt${sort.key === k ? (sort.dir > 0 ? ' asc' : ' desc') : ''}`} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>{h}</th>
          ))}
          {status && <th className="l">Result</th>}
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const st = status?.(r.id);
            return (
              <tr key={r.id} data-rk={r.id}>
                <td className="l"><b><TeamName id={r.id} name={r.name} size={16} short={phone} /></b></td>
                {st && <td>{st.position ?? '-'}</td>}
                {!st && <td>{r.editions}</td>}
                <td>{r.played}</td><td>{r.won}</td><td>{r.lost}</td><td>{r.other}</td><td>{r.nr}</td>
                <td className="bold"><span>{pct(r.rate)}</span></td>
                {!st && <td>{r.titles}</td>}
                <td>{ratio(r.avgFor)}</td><td>{ratio(r.avgAgainst)}</td>
                {st && <td className="l">{st.result}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BatChaseBody({ c }: { c: Ctx }) {
  const s = useMemo(() => batFirstSplit(c.ms, c.innings), [c.ms, c.innings]);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  if (s.matches === 0) return <div className="thin">These matches have no record of who batted first.</div>;
  const test = c.format === 'TEST';
  const row = (title: string, won: number, lost: number, mine: number | null, theirs: number | null) => {
    const decidedN = s.matches - s.draws;
    return (
      <div className="bcr">
        <div className="bch"><b>{title}</b><span>{s.matches} matches</span></div>
        <ResultBar c={asCounts(won, lost, s.draws)} />
        <div className="bck">
          <Kn value={pct(decidedN ? won / decidedN : null)} label="win rate (leaves out draws and ties)" />
          <Kn value={ratio(mine)} label={`average ${test ? 'total' : 'score'}`} />
          <Kn value={ratio(theirs)} label={`average ${test ? 'total' : 'score'} of the other side`} />
        </div>
      </div>
    );
  };
  return <div className="bcs">{row('Team batting first', s.batFirstWon, s.batSecondWon, s.avgFirst, s.avgSecond)}{row('Team batting second', s.batSecondWon, s.batFirstWon, s.avgSecond, s.avgFirst)}</div>;
}

function TossBody({ c }: { c: Ctx }) {
  const t = useMemo(() => tossSummary(c.ms), [c.ms]);
  const { bar, side } = useSides(['Chose to bat or field', t.byEdition ? 'By edition' : 'By stage']);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  if (t.decided === 0) return <div className="thin">These matches have no toss record.</div>;
  const rate = (r: number | null): string => pct(r);
  const row = (title: string, x: typeof t.bat) => (
    <div className="bcr">
      <div className="bch"><b>{title}</b><span>{x.matches} matches</span></div>
      {x.matches ? <ResultBar c={asCounts(x.won, x.lost, x.other)} /> : <div className="thin">No matches.</div>}
      <div className="tkl"><b>{rate(x.rate)}</b> toss winner won</div>
    </div>
  );
  const values = t.bars.map((b) => (b.value === null ? 0 : Math.round(b.value)));
  return (
    <>
      <div className="tkh">
        <Kn value={pct(t.withWinner ? t.tossWinnerWon / t.withWinner : null)} label="toss winners won the match" />
        <Kn value={pct(t.batShare)} label="chose to bat" />
        <Kn value={rate(t.bat.rate)} label="won when they chose to bat" />
        <Kn value={rate(t.field.rate)} label="won when they chose to field" />
      </div>
      {bar}
      <div className="tgx">
        {pickSide([
        <div className="tgl" key="c">{row('Chose to bat', t.bat)}{row('Chose to field', t.field)}</div>,
        <div className="art" key="a">
          <BarChart values={values} labels={t.bars.map((b) => b.label)} colour={GOLD} axisLabel="Toss winner won (%)" xTitle={t.byEdition ? 'Edition' : undefined} label="Toss winner win rate"
            reference={{ value: 50, label: '50%' }} tip={(i) => { const b = t.bars[i]!; return <TipBody title={b.label} rows={b.value === null ? undefined : [{ label: 'Toss winner won', value: `${Math.round(b.value)}%` }, { label: 'Decided matches', value: String(b.n) }]} note={b.value === null ? 'No decided matches' : undefined} />; }} />
        </div>,
        ], side)}
      </div>
    </>
  );
}

function MatchListBody({ c }: { c: Ctx }) {
  const rowLink = useMatchRowLink();
  const [newest, setNewest] = useState(false);
  const rows = useMemo(() => matchList(c.ms, c.query, newest), [c.ms, c.query, newest]);
  const fitRef = useFitRows<HTMLDivElement>(`${rows.length}:${newest}`);
  const win = useWindowedRows<HTMLDivElement>(rows.length, `${c.ms.length}:${c.query}:${newest}`);
  const { ref, motion } = useTableMotion<HTMLDivElement>(`${c.ms.length}:${c.query}`, `${newest}:${rows.length}`, fitRef, win.ref);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  const line = (m: TMatch): string => [m.team1Id, m.team2Id].map((id) => `${(c.names.get(id) ?? '').split(' ').map((w) => w[0]).join('')} ${scoreOf(c.innings, m.id, id) || '-'}`).join(', ');
  return (
    <div className="mlwrap">
    <div className="tw sc sqb" ref={ref} data-rows={motion}>
      <table className="fst mltab">
        <colgroup><col style={{ width: '19%' }} /><col style={{ width: '11%' }} /><col style={{ width: '30%' }} /><col style={{ width: '22%' }} /><col style={{ width: '18%' }} /></colgroup>
        <thead><tr><th className={`l srt ${newest ? 'desc' : 'asc'}`} onClick={() => setNewest((v) => !v)}>Date</th><th className="l">Stage</th><th className="l">Match</th><th className="l">Result</th><th className="l">Player of the match</th></tr></thead>
        <tbody>
          {win.before > 0 && <tr data-spacer="" aria-hidden="true"><td colSpan={5} style={{ height: win.before, padding: 0, border: 0 }} /></tr>}
          {rows.slice(win.from, win.to).map((m, k) => (
            <tr key={m.id} data-rk={m.id} data-late={win.windowed && win.from + k >= REVEALED ? '' : undefined} className="go" {...rowLink(m.id, matchName(m))}>
              <td className="l"><b>{dateText(m.date)}</b><em>{m.venue}</em></td>
              <td className="l">{m.stageName ?? (m.stageClass ? '' : 'League stage')}</td>
              <td className="l"><b><TeamText id={m.team1Id} name={m.team1} inRow /> v <TeamText id={m.team2Id} name={m.team2} inRow /></b><em>{line(m)}</em></td>
              <td className="l"><ResultText m={m} innings={c.innings} names={c.names} inRow /></td>
              <td className="l">{m.potm ? <EntityLink entity={{ kind: 'player', id: m.potmId, name: m.potm }}>{m.potm}</EntityLink> : '-'}</td>
            </tr>
          ))}
          {win.after > 0 && <tr data-spacer="" aria-hidden="true"><td colSpan={5} style={{ height: win.after, padding: 0, border: 0 }} /></tr>}
          {rows.length === 0 && <tr><td className="l" colSpan={5}><span className="thin">No match for "{c.query}".</span></td></tr>}
        </tbody>
      </table>
    </div>
    </div>
  );
}

const VENUE_COLS: ReadonlyArray<readonly [string, VenueKey]> = [['Ground', 'venue'], ['Mat', 'played'], ['Avg first innings', 'avgFirst'], ['Bat first win %', 'batFirstRate'], ['Highest', 'highest'], ['Lowest all out', 'lowestOut']];

function VenuesBody({ c }: { c: Ctx }) {
  const [sort, setSort] = useState<VenueSort>({ key: 'played', dir: -1 });
  const rows = useMemo(() => sortVenues(venueRows(c.ms, c.innings), sort), [c.ms, c.innings, sort]);
  const fitRef = useFitRows<HTMLDivElement>(`${rows.length}:${sort.key}:${sort.dir}`);
  const win = useWindowedRows<HTMLDivElement>(rows.length, `${c.ms.length}`);
  const { ref, motion } = useTableMotion<HTMLDivElement>(`${rows.length}:${c.ms.length}`, rows.map((r) => r.venue).join('|'), fitRef, win.ref);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  return (
    <div className="tw sc sqb" ref={ref} data-rows={motion}>
      <table className="fst">
        <thead><tr>{VENUE_COLS.map(([h, k], i) => (
          <th key={h} className={`${i ? '' : 'l '}srt${sort.key === k ? (sort.dir > 0 ? ' asc' : ' desc') : ''}`} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === 'venue' ? 1 : -1 }))}>{h}</th>
        ))}</tr></thead>
        <tbody>
          {win.before > 0 && <tr data-spacer="" aria-hidden="true"><td colSpan={6} style={{ height: win.before, padding: 0, border: 0 }} /></tr>}
          {rows.slice(win.from, win.to).map((r, k) => (
            <tr key={r.venue} data-rk={r.venue} data-late={win.windowed && win.from + k >= REVEALED ? '' : undefined}>
              <td className="l"><b>{r.venue}</b></td><td>{r.played}</td><td>{ratio(r.avgFirst)}</td><td>{r.batFirstRate === null ? '-' : `${r.batFirstRate.toFixed(0)}%`}</td><td>{r.highest ?? '-'}</td><td>{r.lowestOut ?? '-'}</td>
            </tr>
          ))}
          {win.after > 0 && <tr data-spacer="" aria-hidden="true"><td colSpan={6} style={{ height: win.after, padding: 0, border: 0 }} /></tr>}
        </tbody>
      </table>
    </div>
  );
}

function TotalsBody({ c }: { c: Ctx }) {
  const t = useMemo(() => totals(c.ms, c.innings, c.format), [c.ms, c.innings, c.format]);
  const rowLink = useMatchRowLink();
  const byId = useMemo(() => new Map(c.ms.map((m) => [m.id, m])), [c.ms]);
  const key = `${t.highest[0]?.matchId}|${t.lowest[0]?.matchId}`;
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key);
  const { bar, side } = useSides(['Highest', 'Lowest all out']);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  if (t.highest.length === 0) return <div className="thin">These matches have no completed innings.</div>;
  const nm = (id: string): string => c.names.get(id) ?? '';
  const score = (x: { runs: number; wkts: number }): string => `${x.runs}${x.wkts < 10 ? `/${x.wkts}` : ''}`;
  const li = (i: number, x: (typeof t.highest)[number]) => {
    const m = byId.get(x.matchId);
    return (
      <div className={`tpr${m ? ' go' : ''}`} key={`${x.matchId}:${x.batId}:${i}`} {...(m ? rowLink(m.id, matchName(m)) : {})}>
        <span className="tpn">{i + 1}</span><span className="tpp"><b><TeamName id={x.batId} name={nm(x.batId)} size={16} inRow /></b><em>v <TeamText id={x.bowlId} name={nm(x.bowlId)} inRow />, {editionLabel(x.edition)}</em></span><span className="tpv">{score(x)}</span>
      </div>
    );
  };
  const h = t.highest[0]!, l = t.lowest[0];
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <Kn value={score(h)} label={<>highest total, <TeamText id={h.batId} name={nm(h.batId)} /> v <TeamText id={h.bowlId} name={nm(h.bowlId)} />, {editionLabel(h.edition)}</>} />
        <Kn value={l ? l.runs : '-'} label={l ? <>lowest all out, <TeamText id={l.batId} name={nm(l.batId)} /> v <TeamText id={l.bowlId} name={nm(l.bowlId)} />, {editionLabel(l.edition)}</> : 'lowest all out'} />
        <Kn value={t.atPar} label={`totals of ${t.par} or more`} />
      </div>
      {bar}
      <div className="tpg two" ref={ref} data-rows={motion}>
        {pickSide([
          <div className="tpc" key="h"><h5 className="sub">Highest</h5><TpList>{t.highest.slice(0, 10).map((x, i) => li(i, x))}</TpList></div>,
          <div className="tpc" key="l"><h5 className="sub">Lowest all out</h5><TpList>{t.lowest.slice(0, 10).map((x, i) => li(i, x))}{t.lowest.length === 0 && <div className="thin">None.</div>}</TpList></div>,
        ], side)}
      </div>
    </>
  );
}

function MarginRows({ c, rows, unit }: { c: Ctx; rows: ReturnType<typeof biggestWins>['byRuns']; unit: 'run' | 'wicket' }) {
  const rowLink = useMatchRowLink();
  if (rows.length === 0) return <div className="thin">None.</div>;
  return (
    <>
      {rows.slice(0, 10).map((x, i) => {
        const w = x.m.winnerId!, l = x.m.winnerId === x.m.team1Id ? x.m.team2Id : x.m.team1Id;
        return (
          <div className="tpr go" key={x.m.id} {...rowLink(x.m.id, matchName(x.m))}>
            <span className="tpn">{i + 1}</span>
            <span className="tpp"><b><TeamName id={w} name={c.names.get(w) ?? ''} size={16} inRow /></b><em>v <TeamText id={l} name={c.names.get(l) ?? ''} inRow />, {editionLabel(x.m.edition)}</em></span>
            <span className="tpv">{x.value} {unit}{x.value === 1 ? '' : 's'}{x.ballsLeft ? ` (${x.ballsLeft} left)` : ''}</span>
          </div>
        );
      })}
    </>
  );
}

function BigBody({ c }: { c: Ctx }) {
  const w = useMemo(() => biggestWins(c.ms, c.innings), [c.ms, c.innings]);
  const key = `${w.byRuns[0]?.m.id}|${w.byWickets[0]?.m.id}`;
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key);
  const { bar, side } = useSides(['By runs', 'By wickets']);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  if (w.byRuns.length + w.byWickets.length === 0) return <div className="thin">No decided matches in this slice.</div>;
  const r = w.byRuns[0], k = w.byWickets[0];
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <Kn value={r ? `${r.value} runs` : '-'} label={r ? <>biggest win by runs, <TeamText id={r.m.winnerId} name={c.names.get(r.m.winnerId!) ?? ''} />, {editionLabel(r.m.edition)}</> : 'biggest win by runs'} />
        <Kn value={k ? `${k.value} wickets` : '-'} label={k ? `biggest win by wickets${k.ballsLeft ? `, ${k.ballsLeft} balls left` : ''}` : 'biggest win by wickets'} />
        <Kn value={w.avgRuns === null ? '-' : `${Math.round(w.avgRuns)} runs`} label="average winning margin when batting first" />
      </div>
      {bar}
      <div className="tpg two" ref={ref} data-rows={motion}>
        {pickSide([
          <div className="tpc" key="r"><h5 className="sub">By runs</h5><TpList><MarginRows c={c} rows={w.byRuns} unit="run" /></TpList></div>,
          <div className="tpc" key="w"><h5 className="sub">By wickets</h5><TpList><MarginRows c={c} rows={w.byWickets} unit="wicket" /></TpList></div>,
        ], side)}
      </div>
    </>
  );
}

function CloseBody({ c }: { c: Ctx }) {
  const x = useMemo(() => closestFinishes(c.ms, c.innings, c.format), [c.ms, c.innings, c.format]);
  const key = `${x.byRuns[0]?.m.id}|${x.byWickets[0]?.m.id}`;
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key);
  const { bar, side } = useSides(['By runs', 'By wickets']);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  const r = x.byRuns[0], k = x.byWickets[0];
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <Kn value={r ? `${r.value} ${r.value === 1 ? 'run' : 'runs'}` : '-'} label={r ? <>closest win by runs, <TeamText id={r.m.winnerId} name={c.names.get(r.m.winnerId!) ?? ''} />, {editionLabel(r.m.edition)}</> : 'closest win by runs'} />
        <Kn value={k ? `${k.value} ${k.value === 1 ? 'wicket' : 'wickets'}` : '-'} label={k ? `closest win by wickets${k.ballsLeft ? `, ${k.ballsLeft} balls left` : ''}` : 'closest win by wickets'} />
        <Kn value={x.ties} label={x.ties === 1 ? 'tied match' : 'tied matches'} />
      </div>
      {bar}
      <div className="tpg two" ref={ref} data-rows={motion}>
        {pickSide([
          <div className="tpc" key="r"><h5 className="sub">By runs</h5><TpList><MarginRows c={c} rows={x.byRuns} unit="run" /></TpList></div>,
          <div className="tpc" key="w"><h5 className="sub">By wickets</h5><TpList><MarginRows c={c} rows={x.byWickets} unit="wicket" /></TpList></div>,
        ], side)}
      </div>
    </>
  );
}

export function teamsTiles(c: Ctx): TileDef[] {
  return [
    tile('teams', 'Team records', 'Teams', 'Team records', 'How every team did in the matches that match the filters.', <RecordsBody c={c} />, true),
    tile('bc', 'Bat first or chase', 'Conditions', 'Bat first or chase', 'How often the team that batted first and the team that batted second won, and the average score for each side.', <BatChaseBody c={c} />),
    tile('toss', 'Toss', 'Conditions', 'Toss', 'How often the team that won the toss went on to win, what the toss winners chose, and how the toss winner did in each edition.', <TossBody c={c} />),
    tile('mlist', 'Match list', 'Matches', 'Match list', 'Every match in the filters, oldest first.', <MatchListBody c={c} />, true,
      <input className="bpq" type="search" placeholder="Search team, stage or player" aria-label="Search matches" autoComplete="off" value={c.query} onChange={(e) => c.onQuery(e.target.value)} />),
    tile('ven', 'Venues', 'Matches', 'Venues', 'Matches played at each ground, with the average first innings score, how often the side batting first won, and the highest and lowest totals.', <VenuesBody c={c} />, true),
    tile('tot', 'Totals', 'Records', 'Highest and lowest totals', 'The highest totals, and the lowest totals by a team that was all out.', <TotalsBody c={c} />, true),
    tile('big', 'Biggest wins', 'Records', 'Biggest wins', 'The biggest wins by runs, and the biggest wins by wickets (more balls left breaks a tie).', <BigBody c={c} />, true),
    tile('close', 'Closest finishes', 'Records', 'Closest finishes', 'The narrowest wins by runs and by wickets, with the number of ties in the filters.', <CloseBody c={c} />, true),
  ];
}
