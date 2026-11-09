'use client';

import { usePhone } from '../usePhone';
import { teamAbbreviation } from '@/domain/profile';
import { useMemo, useState, type ReactNode } from 'react';
import { EntityLink } from '../EntityLink';
import { LineChart } from '../charts/LineChart';
import { CountText } from '../charts/CountUp';
import { useFitRows } from '../useFitRows';
import { REVEALED, useTableMotion } from '../useTableMotion';
import { useWindowedRows } from '../useWindowedRows';
import { StackedBars } from './StackedBars';
import { dateText, int, Kn, MatchLink, monthYear, NoMatches, pct, plural, ResultBar, TeamName, LOST, LOST_INK, OTHER, WON, WON_INK } from './teamUi';
import {
  batFirstSplit, counts, currentRun, resultLine, editions, keyNumbers, knockoutGroups, longestRun, marginText, opponentRows, outcomeText, scoreOf, seasonRows, sortByDate, sortOpponents, tossSummary, trophyRows,
  type Result, type TeamInnings, type TeamMatch, type OpponentSort,
} from '@/domain/team';
import { chartColours, teamColour } from '@/domain/colours';
import { groupMatches, stageLabel, type Series } from '@/domain/teamMatches';
import { useMatchRowLink } from '../useMatchRowLink';
import { TipBody } from '../TipBody';

export interface Ctx {
  team: string;
  teamId: string;
  national: boolean;
  /** The matches under every filter. */
  ms: readonly TeamMatch[];
  /** The matches under every filter except Opponent, for the Opponents table, which keeps showing all opponents. */
  noOpp: readonly TeamMatch[];
  /** Every match of the team, where an edition's champion is read from. */
  all: readonly TeamMatch[];
  innings: ReadonlyMap<number, readonly TeamInnings[]>;
  onClear: () => void;
}

const CHIP: Record<Result, string> = { won: 'W', lost: 'L', draw: 'D', tie: 'T', nr: 'NR' };
const NAME: Record<Result, string> = { won: 'Won', lost: 'Lost', draw: 'Drawn', tie: 'Tied', nr: 'No result' };

/** Key numbers: twelve cells in four columns, from the matches in scope. */
export function KeyBody({ c }: { c: Ctx }) {
  const phone = usePhone();
  const eds = useMemo(() => editions(c.ms), [c.ms]);
  const titles = eds.filter((e) => e.result === 'champion').length;
  const k = useMemo(() => keyNumbers(c.ms, c.innings, titles), [c.ms, c.innings, titles]);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  const link = (m: { matchId: number; opp: string } | null, text: string): ReactNode => {
    const m0 = m ? c.ms.find((x) => x.id === m.matchId) : null;
    return m0 ? <MatchLink m={m0} team={c.team}>{text}</MatchLink> : text;
  };
  const run = currentRun(c.ms);
  const n = k.counts;
  // On a phone the two biggest wins (words, not figures) take a whole row each.
  const wide = phone;
  return (
    <div className="kgrid k12">
      <Kn value={n.played} label="matches" />
      <Kn value={n.won} label="won" />
      <Kn value={n.lost} label="lost" />
      <Kn value={pct(n.rate)} label="win rate (matches with a result)" />
      <Kn value={n.other} label={[n.draw ? 'drawn' : '', n.tie ? 'tied' : '', n.nr ? 'no result' : ''].filter(Boolean).join(', ') || 'drawn, tied or no result'} />
      <Kn value={k.titles} label={k.titles === 1 ? 'title' : 'titles'} />
      <Kn value={k.highest ? k.highest.runs : '-'} label={k.highest ? <>highest total, {link(k.highest, `v ${k.highest.opp}`)}</> : 'highest total'} />
      <Kn value={k.lowest ? k.lowest.runs : '-'} label={k.lowest ? <>lowest total (all out), {link(k.lowest, `v ${k.lowest.opp}`)}</> : 'lowest total (all out)'} />
      <Kn wide={wide} value={k.bigRuns ? k.bigRuns.text : '-'} label={k.bigRuns ? <>biggest win by runs, {link(k.bigRuns, `v ${k.bigRuns.opp}`)}</> : 'biggest win by runs'} />
      <Kn wide={wide} value={k.bigWkts ? k.bigWkts.text : '-'} label={k.bigWkts ? <>biggest win by wickets, {link(k.bigWkts, `v ${k.bigWkts.opp}`)}</> : 'biggest win by wickets'} />
      <Kn value={k.winRun} label="longest winning run" />
      <Kn value={run ? `${NAME[run.result]} ${run.length}` : '-'} label="current run" />
    </div>
  );
}

/** Form: the last ten matches, newest on the right, each a link to its match, with the run the team is on. */
export function FormBody({ c }: { c: Ctx }) {
  const phone = usePhone();
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  const last = sortByDate(c.ms).slice(-10);
  const run = currentRun(c.ms);
  return (
    <div className="fform">
      <div className="fstrip">
        {last.map((m) => (
          <MatchLink key={m.id} m={m} team={c.team}>
            <span className="fcell">
              <span className={`fch ${CHIP[m.result]}`} title={`${NAME[m.result]} v ${m.opp}, ${marginText(m).replace(/^(Won|Lost) /, '')}, ${dateText(m.date)}`}>{CHIP[m.result]}</span>
              {phone && <span className="fcap">vs {teamAbbreviation(m.opp)}</span>}
            </span>
          </MatchLink>
        ))}
      </div>
      <div className="fleg">
        <span><i className="fch W" />Won</span><span><i className="fch D" />Drawn, tied</span><span><i className="fch L" />Lost</span><span><i className="fch NR" />No result</span>
        <span className="g">Latest on the right. The last {last.length} {last.length === 1 ? 'match' : 'matches'} that match the filters.</span>
      </div>
      <div className="fkn">
        <Kn value={run ? `${NAME[run.result]} ${run.length}` : '-'} label="current run" />
        <Kn value={longestRun(c.ms, 'won')} label="longest winning run" />
        <Kn value={longestRun(c.ms, 'lost')} label="longest losing run" />
      </div>
    </div>
  );
}

/** By season: matches won, lost and other in each season as stacked bars, over the win rate of the season as a line. */
export function SeasonBody({ c }: { c: Ctx }) {
  const rows = useMemo(() => seasonRows(c.ms, c.national), [c.ms, c.national]);
  if (rows.length === 0) return <NoMatches onClear={c.onClear} />;
  // "'24" for a year, "'23/24" for a league season that spans two years.
  const labels = rows.map((r) => `'${r.season.slice(2)}`);
  const span = `${rows[0]!.season} to ${rows[rows.length - 1]!.season}`;
  return (
    <div className="charts">
      <div className="art">
        <StackedBars
          stacks={[{ values: rows.map((r) => r.won), colour: WON, ink: WON_INK }, { values: rows.map((r) => r.other), colour: OTHER, ink: '#fff' }, { values: rows.map((r) => r.lost), colour: LOST, ink: LOST_INK }]}
          labels={labels} axisLabel="Matches" label={`Matches won, drawn or tied and lost in each season, ${span}`}
          tip={(i) => { const r = rows[i]!; return <TipBody title={r.season} rows={[{ label: 'Matches', value: String(r.played) }, { label: 'Results', value: resultLine(r) }, { label: 'Win rate', value: pct(r.rate) }]} />; }}
        />
      </div>
      <div className="art">
        <LineChart
          values={rows.map((r) => (r.rate === null ? null : r.rate * 100))} colour={chartColours(teamColour(c.team)).main} axisLabel="Win rate (%)" decimals={0} domain={[0, 100]} labels={labels} labelStep={Math.max(1, Math.ceil(rows.length / 14))} slots label={`Win rate in each season, ${span}`}
          tip={(i) => { const r = rows[i]!; return <TipBody title={r.season} rows={[{ label: 'Win rate', value: pct(r.rate) }, { label: 'Won', value: `${r.won} of ${r.played}` }]} />; }}
        />
      </div>
    </div>
  );
}

function Case({ title, played, c: cc, extra }: { title: string; played: number; c: ReturnType<typeof counts>; extra: ReactNode }) {
  return (
    <div className="bcr">
      <div className="bch"><b>{title}</b><span>{plural(played, 'match', 'matches')}</span></div>
      {played ? <ResultBar c={cc} /> : <div className="thin">No matches.</div>}
      {played > 0 && <div className="bck">{extra}</div>}
    </div>
  );
}

/** Bat first or chase: results when the team batted first and when it chased, with the average score. A Test has draws, so it shows won, drawn and lost for each. */
export function BatChaseBody({ c }: { c: Ctx }) {
  const s = useMemo(() => batFirstSplit(c.ms, c.innings), [c.ms, c.innings]);
  if (s.limited.length + s.tests.length === 0) return c.ms.length === 0 ? <NoMatches onClear={c.onClear} /> : <div className="thin">These matches have no record of who batted first.</div>;
  const rows = [...s.limited, ...s.tests];
  return (
    <div className={rows.length > 2 ? 'tgr' : 'bcs'}>
      {rows.map((r) => (
        <Case key={r.label} title={r.label} played={r.played} c={r.counts} extra={<>
          <Kn value={pct(r.rate)} label="win rate" />
          {r.counts.draw > 0 || r.label.endsWith('first') && s.tests.includes(r) ? <Kn value={r.counts.draw} label="drawn" /> : null}
          <Kn value={r.avgScore === null ? '-' : Math.round(r.avgScore)} label="average score" />
        </>} />
      ))}
    </div>
  );
}

/** Toss: tosses won and what the team chose, then the four cases: won and batted, won and fielded, lost and batted first, lost and chased. */
export function TossBody({ c }: { c: Ctx }) {
  const t = useMemo(() => tossSummary(c.ms, c.innings), [c.ms, c.innings]);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  if (t.tosses === 0) return <div className="thin">These matches have no toss record.</div>;
  return (
    <>
      <div className="tkh">
        <Kn value={`${t.won} of ${t.tosses}`} label={`tosses won (${pct(t.tosses ? t.won / t.tosses : null)})`} />
        <Kn value={pct(t.batShare)} label="chose to bat after winning" />
        <Kn value={pct(t.rateAfterWin)} label="win rate after winning the toss" />
        <Kn value={pct(t.rateAfterLoss)} label="win rate after losing the toss" />
      </div>
      <div className="tgr">
        {t.cases.map((k) => (
          <Case key={k.key} title={k.label} played={k.played} c={k.counts} extra={<><Kn value={pct(k.rate)} label="win rate" /><Kn value={k.avgScore === null ? '-' : Math.round(k.avgScore)} label="average score" /></>} />
        ))}
      </div>
    </>
  );
}

const OPP_COLS: ReadonlyArray<readonly [string, OpponentSort['key'], string]> = [
  ['Opponent', 'name', 'The opposing team'], ['Mat', 'played', 'Matches played against them'], ['Won', 'won', 'Matches won'], ['Lost', 'lost', 'Matches lost'],
  ['Draw, tie, NR', 'other', 'Drawn, tied or no result'], ['Win rate', 'rate', 'Wins over matches with a result'],
];

/** Opponents: every opponent in the matches under the other filters. A click on a row sets the Opponent filter and the table keeps showing all of them. */
/** Short headings for a phone, where a column is about 45 px wide (the full words stay in the tooltip). */
const OPP_SHORT: Record<string, string> = { 'Draw, tie, NR': 'Other', 'Win rate': 'Win %' };

export function OpponentsBody({ c, chosen, onPick }: { c: Ctx; chosen: string | null; onPick: (id: string | null) => void }) {
  const phone = usePhone();
  const [sort, setSort] = useState<OpponentSort>({ key: 'played', dir: -1 });
  const rows = useMemo(() => sortOpponents(opponentRows(c.noOpp), sort), [c.noOpp, sort]);
  const fitRef = useFitRows<HTMLDivElement>(`${rows.length}:${sort.key}:${sort.dir}:${chosen}`);
  const win = useWindowedRows<HTMLDivElement>(rows.length, `${rows.length}:${chosen}`);
  const { ref, motion } = useTableMotion<HTMLDivElement>(`${rows.length}:${chosen}:${c.noOpp.length}`, rows.map((r) => r.id).join('|'), fitRef, win.ref);
  if (c.noOpp.length === 0) return <NoMatches onClear={c.onClear} />;
  return (
    <div className="tsc" ref={ref} data-rows={motion}>
      <table className="fst opt" style={{ tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: '34%' }} />{OPP_COLS.slice(1).map(([h]) => <col key={h} style={{ width: `${66 / 5}%` }} />)}</colgroup>
        <thead>
          <tr>{OPP_COLS.map(([h, k, hint], i) => (
            <th key={h} title={hint} className={`${i ? '' : 'l '}srt${sort.key === k ? (sort.dir > 0 ? ' asc' : ' desc') : ''}`} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === 'name' ? 1 : -1 }))}>{phone ? (OPP_SHORT[h] ?? h) : h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {win.before > 0 && <tr data-spacer="" aria-hidden="true"><td colSpan={6} style={{ height: win.before, padding: 0, border: 0 }} /></tr>}
          {rows.slice(win.from, win.to).map((r, k) => (
            <tr key={r.id} data-rk={r.id} data-late={win.windowed && win.from + k >= REVEALED ? '' : undefined} className={`oprow${chosen === r.id ? ' on' : ''}`} tabIndex={0}
              title={chosen === r.id ? `Showing only ${r.name}. Click to show every opponent` : `Click to show only ${r.name} in every tile`}
              onClick={() => onPick(chosen === r.id ? null : r.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(chosen === r.id ? null : r.id); } }}>
              <td className="l"><b><TeamName id={r.id} name={r.name} inRow /></b></td>
              <td>{r.played}</td><td className="bold"><span>{r.won}</span></td><td>{r.lost}</td><td>{r.other}</td><td className="bold"><span>{pct(r.rate)}</span></td>
            </tr>
          ))}
          {win.after > 0 && <tr data-spacer="" aria-hidden="true"><td colSpan={6} style={{ height: win.after, padding: 0, border: 0 }} /></tr>}
        </tbody>
      </table>
      {chosen && <p className="onote">Showing only {rows.find((r) => r.id === chosen)?.name ?? 'one opponent'} in every tile, because the Opponent filter is set. <button type="button" className="clr" onClick={() => onPick(null)}>Show all opponents</button></p>}
    </div>
  );
}

/**
 * Trophies and knockouts as one tile (Ari, 2026-10-25): one row of all the numbers, then one list under it. Each tournament the team played has a header line (its titles, lost finals and an edition chip
 * for every edition: gold a title, sky a lost final, grey any other result) and under it that tournament's knockout matches by edition, newest first, with both scores, the result and the player of the match,
 * a Final outlined in gold. The list takes the rest of the tile and scrolls, and a header stays at the top while its matches scroll under it.
 */
export function TrophiesKnockoutsBody({ c }: { c: Ctx }) {
  const rowLink = useMatchRowLink();
  const eds = useMemo(() => editions(c.ms), [c.ms]);
  const rows = useMemo(() => trophyRows(eds), [eds]);
  const groups = useMemo(() => knockoutGroups(c.ms, c.all), [c.ms, c.all]);
  const key = rows.map((r) => `${r.tournament}:${r.editions.length}:${r.titles}`).join('|') + '/' + groups.map((g) => g.edition).join('|');
  const { ref, motion, played } = useTableMotion<HTMLDivElement>(key, key);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  if (rows.length === 0 && groups.length === 0) return <div className="thin">No tournament or knockout matches in these filters. Bilateral series are not counted. <button type="button" className="clr" onClick={c.onClear}>Clear filters</button></div>;
  const titles = rows.reduce((a, r) => a + r.titles, 0), lost = rows.reduce((a, r) => a + r.finalsLost, 0);
  const ko = groups.flatMap((g) => g.matches).filter((m) => m.stageClass === 'knockout');
  const finals = ko.filter((m) => m.stageName === 'Final');
  const won = ko.filter((m) => m.result === 'won').length, fw = finals.filter((m) => m.result === 'won').length;
  // A knockout group that belongs to no tournament row (a small event) follows the tournaments, with no header.
  const known = new Set(rows.map((r) => r.tournament));
  const extra = groups.filter((g) => !known.has(g.tournament));
  const edition = (g: (typeof groups)[number]) => (
    <div className="ked" key={g.edition}>
      {(() => {
        // A series whose Final is a best of three (the VB Series, the Commonwealth Bank Series) has several matches tagged Final: they are numbered, and the head says how the Finals went.
        const fs = g.matches.filter((m) => m.stageClass === 'knockout' && m.stageName === 'Final');
        const w = fs.filter((m) => m.result === 'won').length, l = fs.filter((m) => m.result === 'lost').length;
        return <h5 className="sub"><EntityLink entity={{ kind: 'tournament', id: g.tournament, name: g.name }}>{g.name}</EntityLink> {g.label} <em className={g.outcome.startsWith('Out') ? 'out' : undefined}>{g.outcome}</em>{fs.length > 1 && <span className="fser"> Finals series, {w}-{l}</span>}</h5>;
      })()}
      <div className="kcs">
        {g.matches.map((m) => {
          const mine = scoreOf([...(c.innings.get(m.id) ?? [])], m.id, 'for'), theirs = scoreOf([...(c.innings.get(m.id) ?? [])], m.id, 'against');
          const fs = g.matches.filter((x) => x.stageName === 'Final');
          return (
            <div className={`kc go${m.stageName === 'Final' ? ' fin' : ''}`} key={m.id} {...rowLink(m.id, `${c.team} v ${m.opp}`)}>
              <div className="kh"><b>{m.stageName === 'Final' && fs.length > 1 ? `Final ${fs.indexOf(m) + 1} of ${fs.length}` : m.stageName}</b><span>{monthYear(m.date)}{m.venue ? `, ${m.venue}` : ''}</span></div>
              <div className={`kr${m.result === 'won' ? ' win' : ''}`}><span><TeamName id={c.teamId} name={c.team} plain /></span><b>{mine || '-'}</b></div>
              <div className={`kr${m.result === 'lost' ? ' win' : ''}`}><span><TeamName id={m.oppId} name={m.opp} inRow /></span><b>{theirs || '-'}</b></div>
              <div className="kf"><span>{marginText(m)}</span>{m.potm && <em>Player of the match: <EntityLink entity={{ kind: 'player', id: m.potmId, name: m.potm }}>{m.potm}</EntityLink></em>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="tko">
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(8,1fr)' }}>
        {([[titles, 'titles'], [lost, 'finals lost'], [eds.length, 'editions played']] as const).map(([n, label]) => <div className="kn" key={label}><b><CountText value={n} format={(v) => int.format(Math.round(v))} play={played} /></b><span>{label}</span></div>)}
        <Kn value={pct(eds.length ? titles / eds.length : null)} label="of editions won" />
        <Kn value={ko.length} label="knockout matches" /><Kn value={pct(ko.length ? won / ko.length : null)} label="knockouts won" />
        <Kn value={finals.length} label="finals played" /><Kn value={finals.length ? `${fw} of ${finals.length}` : '-'} label="finals won" />
      </div>
      <div className="kos" ref={ref} data-rows={motion}>
        {rows.map((r) => (
          <div className="tbk" key={r.tournament}>
            <div className="trr">
              <b><EntityLink entity={{ kind: 'tournament', id: r.tournament, name: r.name }}>{r.name}</EntityLink></b>
              <span className="tce">{plural(r.editions.length, 'edition')}</span>
              <div className="trc">
                {r.editions.map((e) => <span key={e.edition} className={`tch${e.result === 'champion' ? ' w' : e.result === 'runner-up' ? ' f' : ''}`} title={`${e.name} ${e.label}: ${outcomeText(e)}`}>{e.label.length >= 4 ? `'${e.label.slice(2, 4)}` : e.label}</span>)}
              </div>
              <span className="tcg">
                {r.titles > 0 && <span className="tcn w">{plural(r.titles, 'title')}</span>}
                {r.finalsLost > 0 && <span className="tcn f">{r.finalsLost} lost {r.finalsLost === 1 ? 'final' : 'finals'}</span>}
                {r.titles === 0 && r.finalsLost === 0 && <span className="tcn n">No final reached</span>}
              </span>
            </div>
            {groups.filter((g) => g.tournament === r.tournament).map(edition)}
          </div>
        ))}
        {extra.map(edition)}
      </div>
    </div>
  );
}

// ---- Matches ------------------------------------------------------------------------------------------

type Item = { type: 'season'; key: string; season: string; played: number; line: string } | { type: 'series'; key: string; s: Series };

/**
 * Matches: a national team's matches grouped by season, then by series (a tournament edition, or a bilateral tour split by format); a league team's by season. A series opens to its matches,
 * each a link to the Match page. Long lists draw only the rows on screen.
 */
export function MatchesBody({ c }: { c: Ctx }) {
  const rowLink = useMatchRowLink();
  const groups = useMemo(() => groupMatches(c.ms, c.team, c.national, c.all), [c.ms, c.team, c.national, c.all]);
  const items = useMemo<Item[]>(() => groups.flatMap((g) => [
    { type: 'season', key: `s${g.season}`, season: g.season, played: g.counts.played, line: resultLine(g.counts) } as Item,
    ...g.series.map((s) => ({ type: 'series', key: s.key, s }) as Item),
  ]), [groups]);
  const total = groups.reduce((a, g) => a + g.series.length, 0);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const isOpen = (k: string): boolean => open.has(k) || (total <= 3 && !open.has(`-${k}`));
  const toggle = (k: string): void => setOpen((was) => { const next = new Set(was); const now = isOpen(k); next.delete(k); next.delete(`-${k}`); next.add(now ? `-${k}` : k); return next; });
  // About 330 collapsed rows for a whole national career: all are drawn, because windowing rows whose height changes when they open made the list jump (Ari, 2026-10-22).
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  return (
    <div className="mtl tsc">
      {items.map((it) => it.type === 'season' ? (
        <div className="mrow msn" key={it.key}><h5>{it.season}</h5><span>{plural(it.played, 'match', 'matches')}, {it.line}</span></div>
      ) : (
        <div className={`mrow msr${isOpen(it.key) ? ' on' : ''}`} key={it.key}>
          <button type="button" className="msh" aria-expanded={isOpen(it.key)} onClick={() => toggle(it.key)}>
            <i className="chev" aria-hidden="true" />
            <span className="mst"><b>{it.s.kind === 'bilateral' ? it.s.title : <EntityLink entity={{ kind: 'tournament', id: it.s.tournament, name: it.s.title }}>{it.s.title}</EntityLink>}</b><em>{it.s.subtitle}{it.s.where ? `, ${it.s.where}` : ''}</em></span>
            <span className={`mres2${it.s.result.startsWith('Champion') || it.s.result.startsWith(c.team) ? ' win' : ''}`}>{it.s.result}</span>
            <span className="mdt">{it.s.from === it.s.to ? dateText(it.s.from) : `${monthYear(it.s.from)} to ${monthYear(it.s.to)}`}</span>
          </button>
          {isOpen(it.key) && (
            <div className="msl">
              {it.s.matches.map((m) => {
                const mine = scoreOf([...(c.innings.get(m.id) ?? [])], m.id, 'for'), theirs = scoreOf([...(c.innings.get(m.id) ?? [])], m.id, 'against');
                const stage = stageLabel(m);
                return (
                  <div className="mln go" key={m.id} {...rowLink(m.id, `${c.team} v ${m.opp}`)}>
                    <time dateTime={m.date}>{dateText(m.date)}</time>
                    <span className="mv">v <TeamName id={m.oppId} name={m.opp} size={16} inRow /></span>
                    <span className="mg">{[stage, m.venue].filter(Boolean).join(', ')}</span>
                    <span className={`mr2 ${m.result}`}>{mine && theirs ? `${mine} v ${theirs}, ` : ''}{marginText(m)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
