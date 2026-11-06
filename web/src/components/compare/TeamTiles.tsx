'use client';

import type { ReactNode } from 'react';
import {
  boardRows, fieldingOf, knockoutRecord, seasonRates, share, teamAgg, trophyCompare, winsByGround, winsByYear, type Scope, type TeamAgg,
} from '@/domain/compareTeams';
import { cell, leader, type CompareRow } from '@/domain/compareStats';
import {
  counts, marginText, scoreOf, seasonOf, type TeamFilters, type TeamMatch, type TeamPhaseRow, type TeamPlayerRow, type TeamWicketRow,
} from '@/domain/team';
import { phaseDefs, scopeKind } from '@/domain/teamBBF';
import { CompareBars, CompareLines } from './CompareCharts';
import { CompareRows, Fig, GOLD, Kn, Mo, SKY, Thin, useSideColours, Who } from './compareUi';
import { inkFor } from '@/domain/colours';

/** The colours of a team's own results (won, lost), which are the same for either team and not the colours of the two sides. */
const WON = '#EBC862', LOST = '#56B4E9';
import { useMatchRowLink } from '../useMatchRowLink';
import { REVEALED } from '../useTableMotion';
import { useWindowedRows } from '../useWindowedRows';
import { WindowSpacer } from '../WindowSpacer';
import { TeamEmblem } from '../TeamEmblem';
import type { TileDef } from '../TileCarousel';
import { TipBody } from '../TipBody';
import { pickSide, useSides } from '../analysis/useSides';
import { usePhone } from '../usePhone';

/** What every tile of the Compare teams views reads: the two teams' matches under the Format, Competition and Season, the matches between them, and the files that load behind the first paint. */
export interface TeamCtx {
  a: Scope;
  b: Scope;
  /** The first team's matches against the second (its wins are the first team's, its losses the second's), with the first team's innings. */
  between: Scope;
  filters: TeamFilters;
  genderA: 'male' | 'female';
  /** The players', wickets' and phases' files of both teams, null until they have loaded. */
  files: { players: { a: TeamPlayerRow[]; b: TeamPlayerRow[] }; wickets: { a: TeamWicketRow[]; b: TeamWicketRow[] }; phases: { a: TeamPhaseRow[]; b: TeamPhaseRow[] } } | null;
  canClear: boolean;
  onClear: () => void;
}

const vkey = (c: TeamCtx, extra = ''): string => `${c.a.id}|${c.b.id}|${c.filters.format}|${c.filters.competition}|${c.filters.season}|${c.a.ms.length}|${c.b.ms.length}|${extra}`;
const short = (name: string): string => { const w = name.split(' '); return w.length > 1 && name.length > 11 ? w[w.length - 1]! : name; };
/** A pill of a side's colour carries the ink that reads on it. */
const Pill = ({ v, colour }: { v: ReactNode; colour: string }) => <b className="hp" style={{ background: colour, ...(colour === GOLD ? { color: 'var(--sai, #111)' } : colour === SKY ? { color: 'var(--sbi, #111)' } : {}) }}>{typeof v === 'string' || typeof v === 'number' ? <Fig text={String(v)} /> : v}</b>;
const pctOf = (n: number, d: number): string => (d > 0 ? `${Math.round((n / d) * 100)}%` : '-');
const rowOf = (label: string, a: ReturnType<typeof cell>, b: ReturnType<typeof cell>, low = false): CompareRow => ({ label, a, b, ...(low ? { low: true } : {}) });

function Empty({ c, message }: { c: TeamCtx; message?: string }) {
  return <Thin>{message ?? 'Neither team has a match in this slice.'}{c.canClear && <> <button type="button" className="clr" onClick={c.onClear}>Clear filters</button></>}</Thin>;
}
const none = (c: TeamCtx): boolean => c.a.ms.length === 0 && c.b.ms.length === 0;

function Head({ name, extra }: { name: string; extra: string; colour: string }) {
  return <div className="h2t"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><TeamEmblem team={name} size={20} />{name}</span><em>{extra}</em></div>;
}

// ---- Scoreboard, Results, By season, Batting order and toss ---------------------------------------------------

function ScoreboardBody({ c }: { c: TeamCtx }) {
  if (none(c)) return <Empty c={c} />;
  const aa = teamAgg(c.a), bb = teamAgg(c.b);
  const rows = boardRows(aa, bb, c.files ? fieldingOf(c.a, c.files.players.a, c.files.wickets.a) : null, c.files ? fieldingOf(c.b, c.files.players.b, c.files.wickets.b) : null)
    .map((r) => ({ ...r, lead: leader(r) }));
  const la = rows.filter((r) => r.lead === 'a').length, lb = rows.filter((r) => r.lead === 'b').length;
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <Kn side="a" value={la} label={`categories led by ${c.a.name}`} /><Kn value={rows.length - la - lb} label="level or not decided" /><Kn side="b" value={lb} label={`categories led by ${c.b.name}`} />
      </div>
      <Mo k={rows.map((r) => `${r.label}${r.a.s}${r.b.s}`).join('|')} className="cgrid">
        {rows.map((r) => <div key={r.label} className={`cc ${r.lead || 'n'}`} title={`${r.label}: ${r.a.s} to ${r.b.s}`}><span>{r.label}</span><b><Fig text={r.a.s} /></b><em><Fig text={r.b.s} /></em></div>)}
      </Mo>
      <Who a={c.a.name} b={c.b.name} />
    </>
  );
}

function ResultsHalf({ s, colour, drawWord }: { s: Scope; colour: string; drawWord: string }) {
  const k = counts(s.ms), decided = k.played - k.nr || 1;
  const seg = (n: number, bg: string, fg: string, title: string): ReactNode => (n ? <i style={{ width: `${(n / decided) * 100}%`, background: bg, color: fg }} title={`${title} ${n}`}>{n / decided > 0.1 ? n : ''}</i> : null);
  const other = k.draw + k.tie;
  const rows: Array<[string, number]> = [['Won', k.won], ['Lost', k.lost], [drawWord, other], ['No result', k.nr]];
  return (
    <div className="h2s">
      <Head name={s.name} extra={`${k.played} ${k.played === 1 ? 'match' : 'matches'}`} colour={colour} />
      {k.played ? <div className="stk big dsb">{seg(k.won, WON, '#2A1A00', 'Won')}{seg(other, '#6c717a', '#fff', drawWord)}{seg(k.lost, LOST, '#04243A', 'Lost')}</div> : <div className="thin">No matches.</div>}
      {rows.map(([l, n]) => <div className="h2r" key={l}><Pill v={n} colour={colour} /><span>{l}</span><b className="hp" style={{ background: '#2a2a2a', color: '#fff' }}><Fig text={pctOf(n, k.played)} /></b></div>)}
    </div>
  );
}

function ResultsBody({ c }: { c: TeamCtx }) {
  const { bar, side } = useSides([c.a.name, c.b.name]);
  if (none(c)) return <Empty c={c} />;
  const tests = [...c.a.ms, ...c.b.ms].some((m) => m.kind === 'test');
  const word = tests ? 'Drawn' : 'Drawn or tied';
  return <>{bar}<Mo k={`${vkey(c)}|${side}`} className="h2w">{pickSide([<ResultsHalf key="a" s={c.a} colour={GOLD} drawWord={word} />, <ResultsHalf key="b" s={c.b} colour={SKY} drawWord={word} />], side)}</Mo></>;
}

function SeasonBody({ c }: { c: TeamCtx }) {
  const phone = usePhone();
  if (none(c)) return <Empty c={c} />;
  const r = seasonRates(c.a, c.b, seasonOf);
  if (![...r.a, ...r.b].some((v) => v !== null)) return <Thin>No match with a result in this slice.</Thin>;
  const at = (v: number | null | undefined): string => (v === null || v === undefined ? '-' : `${Math.round(v)}%`);
  return (
    <div className="fcm"><div className="art">
      <CompareLines series={[{ name: c.a.name, colour: GOLD, values: r.a }, { name: c.b.name, colour: SKY, values: r.b }]} labels={r.seasons.map((s) => (s.length === 4 ? `'${s.slice(2)}` : s))} labelStep={r.seasons.length > 16 ? 2 : 1}
        axisLabel="Win rate (%)" xTitle="Season" decimals={0} fixedMax={100} label="Win rate in each season" tip={(i) => <TipBody title={r.seasons[i]!} sub="Win rate" rows={[{ label: c.a.name, value: at(r.a[i]), colour: GOLD }, { label: c.b.name, value: at(r.b[i]), colour: SKY }]} />} />
    </div>{phone && <Who a={c.a.name} b={c.b.name} />}</div>
  );
}

function ConditionsBody({ c }: { c: TeamCtx }) {
  const { bar, side } = useSides(['Batting order', 'Toss']);
  if (none(c)) return <Empty c={c} />;
  const A = teamAgg(c.a), B = teamAgg(c.b);
  const test = A.testSplit || B.testSplit;
  const cats = test ? ['Batting first', 'Bowling first'] : ['Batting first', 'Chasing'];
  const v = (x: number | null | undefined): number | null => (x === null || x === undefined ? null : x * 100);
  const rows: CompareRow[] = [
    rowOf('Win rate batting first', share(A.first?.rate ?? null), share(B.first?.rate ?? null)), rowOf(test ? 'Win rate bowling first' : 'Win rate chasing', share(A.second?.rate ?? null), share(B.second?.rate ?? null)),
    rowOf('Toss won', share(A.tossRate), share(B.tossRate)), rowOf('Win rate after winning the toss', share(A.rateAfterWin), share(B.rateAfterWin)), rowOf('Win rate after losing the toss', share(A.rateAfterLoss), share(B.rateAfterLoss)),
  ];
  const at = (x: number | null): string => (x === null ? '-' : `${Math.round(x)}%`);
  const va = [v(A.first?.rate), v(A.second?.rate)], vb = [v(B.first?.rate), v(B.second?.rate)];
  return (
    <>
      {bar}
      <div className="fpg">
        {pickSide([
          <div className="art" key="chart"><CompareBars series={[{ name: c.a.name, colour: GOLD, values: va }, { name: c.b.name, colour: SKY, values: vb }]} labels={cats} axisLabel="Win rate (%)" decimals={0} label="Win rate batting first and chasing"
            tip={(i) => <TipBody title={cats[i]!} sub="Win rate" rows={[{ label: c.a.name, value: at(va[i] ?? null), colour: GOLD }, { label: c.b.name, value: at(vb[i] ?? null), colour: SKY }]} />} /></div>,
          <CompareRows key="rows" rows={rows} className="one" />,
        ], side)}
      </div>
      <Who a={c.a.name} b={c.b.name} />
    </>
  );
}

// ---- Trophies, Knockouts ---------------------------------------------------------------------------------------

function TrophiesBody({ c }: { c: TeamCtx }) {
  const t = trophyCompare(c.a, c.b);
  if (t.rows.length === 0) return <Empty c={c} message="No tournament editions in this slice. Bilateral series are not counted." />;
  const chip = (e: { result: string; label: string; name: string; firstDate: string }, k: number): ReactNode => <span key={k} className={`tch ${e.result === 'champion' ? 'w' : e.result === 'runner-up' ? 'f' : ''}`} title={`${e.name} ${e.label}: ${e.result === 'champion' ? 'Champion' : e.result === 'runner-up' ? 'Runner-up' : 'Played'}`}>{`'${e.firstDate.slice(2, 4)}`}</span>;
  // What a team won or lost in a tournament, in words: only what happened, and "No final reached" when neither (a 0 title, 0 lost pill read as if finals had been played).
  const word = (s: { titles: number; lost: number; editions: readonly unknown[] }): string => (s.editions.length === 0 ? 'Did not play' : s.titles === 0 && s.lost === 0 ? 'No final reached' : [s.titles ? `${s.titles}\u00a0${s.titles === 1 ? 'title' : 'titles'}` : '', s.lost ? `${s.lost}\u00a0lost\u00a0${s.lost === 1 ? 'final' : 'finals'}` : ''].filter(Boolean).join(',\u00a0'));
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Kn side="a" value={t.a.titles} label={`${c.a.name}, titles`} /><Kn side="a" value={t.a.lost} label={`${c.a.name}, lost finals`} /><Kn side="b" value={t.b.titles} label={`${c.b.name}, titles`} /><Kn side="b" value={t.b.lost} label={`${c.b.name}, lost finals`} />
      </div>
      <Mo k={vkey(c, 'tro')} className="trl">
        {t.rows.map((r) => (
          <div className="trb" key={r.tournament}>
            <div className="h2r tro"><Pill v={word(r.a)} colour={GOLD} /><span><b>{r.name}</b><i> / {r.a.editions.length} and {r.b.editions.length} editions</i></span><Pill v={word(r.b)} colour={SKY} /></div>
            <div className="trs"><div>{r.a.editions.map(chip)}</div><div>{r.b.editions.map(chip)}</div></div>
          </div>
        ))}
      </Mo>
      <Who a={c.a.name} b={c.b.name} />
    </>
  );
}

function KnockoutsBody({ c }: { c: TeamCtx }) {
  const A = knockoutRecord(c.a), B = knockoutRecord(c.b);
  if (A.editions === 0 && B.editions === 0) return <Empty c={c} message="No tournament editions in this slice." />;
  const ratio = (n: number, d: number) => (d ? { v: (n / d) * 100, s: `${Math.round((n / d) * 100)}%` } : { v: null, s: '-' });
  const rows: CompareRow[] = [
    rowOf('Editions played', cell(A.editions), cell(B.editions)), rowOf('Reached the knockouts', cell(A.reached), cell(B.reached)), rowOf('Share of editions in the knockouts', ratio(A.reached, A.editions), ratio(B.reached, B.editions)),
    rowOf('Finals played', cell(A.finals), cell(B.finals)), rowOf('Finals won', cell(A.won), cell(B.won)), rowOf('Finals won of finals played', ratio(A.won, A.finals), ratio(B.won, B.finals)),
  ];
  return <><CompareRows rows={rows} className="one" /><Who a={c.a.name} b={c.b.name} /></>;
}

// ---- Phases, Fielding ---------------------------------------------------------------------------------------------

function PhasesBody({ c }: { c: TeamCtx }) {
  const kind0 = scopeKind([...c.a.ms, ...c.b.ms]);
  const { bar, side } = useSides(kind0 ? phaseDefs(kind0).map((d) => d.name) : []);
  const mixed = (c.filters.format === 'INTERNATIONAL' || c.filters.format === 'T20S' || c.filters.format === 'LEAGUE') && c.filters.competition === null;
  if (none(c)) return <Empty c={c} />;
  if (mixed) return <Thin>Phases are defined per format. Pick Tests, ODIs, T20Is or one competition in the filters above.</Thin>;
  if (!c.files) return <Thin>Loading</Thin>;
  const kind = scopeKind([...c.a.ms, ...c.b.ms]);
  if (!kind) return <Empty c={c} />;
  const defs = phaseDefs(kind);
  const card = (s: Scope, rows: TeamPhaseRow[], side: 'for' | 'against', gender: 'male' | 'female', key: string) => {
    const byMatch = new Set(s.ms.map((m) => m.id));
    const mine = rows.filter((r) => r.side === side && byMatch.has(r.matchId) && r.phase === key);
    const balls = mine.reduce((n, r) => n + r.balls, 0), runs = mine.reduce((n, r) => n + r.runs, 0);
    void gender;
    return balls ? (runs / balls) * (side === 'for' ? 100 : kind === 'hundred' ? 5 : 6) : null;
  };
  return (
    <>
      {bar}
      <div className="phg" style={{ gridTemplateColumns: `repeat(${defs.length},1fr)` }}>
        {pickSide(defs.map((d) => {
          const rows: CompareRow[] = [
            rowOf('Batting strike rate', cell(card(c.a, c.files!.phases.a, 'for', c.genderA, d.key), 1), cell(card(c.b, c.files!.phases.b, 'for', c.genderA, d.key), 1)),
            rowOf(kind === 'hundred' ? 'Economy per 5 balls' : 'Bowling economy', cell(card(c.a, c.files!.phases.a, 'against', c.genderA, d.key), 2), cell(card(c.b, c.files!.phases.b, 'against', c.genderA, d.key), 2), true),
          ];
          return <div className="phc" key={d.key}><h5 className="sub">{d.name}{d.range ? <em>{d.range}</em> : null}</h5><CompareRows rows={rows} className="one" /></div>;
        }), side)}
      </div>
      <Who a={c.a.name} b={c.b.name} />
    </>
  );
}

function FieldingBody({ c }: { c: TeamCtx }) {
  if (none(c)) return <Empty c={c} />;
  if (!c.files) return <Thin>Loading</Thin>;
  const A = fieldingOf(c.a, c.files.players.a, c.files.wickets.a), B = fieldingOf(c.b, c.files.players.b, c.files.wickets.b);
  const rows: CompareRow[] = [
    rowOf('Catches', cell(A.catches), cell(B.catches)), rowOf('Catches per match', cell(A.matches ? A.catches / A.matches : null, 2), cell(B.matches ? B.catches / B.matches : null, 2)),
    rowOf('Stumpings', cell(A.stumpings), cell(B.stumpings)), rowOf('Run outs', cell(A.runOuts), cell(B.runOuts)),
  ];
  return <><CompareRows rows={rows} className="one" /><Who a={c.a.name} b={c.b.name} /></>;
}

/** The eight tiles of the Overall view, in the groups of the mockup: Summary, Results, Silverware and Style. */
export function teamOverallTiles(c: TeamCtx): TileDef[] {
  const tile = (id: string, label: string, group: string, tip: string, body: ReactNode): TileDef => ({ id, label, group, title: label, tip, tag: 'Cricsheet', wide: true, body });
  const tests = [...c.a.ms, ...c.b.ms].some((m) => m.kind === 'test');
  return [
    tile('board', 'Scoreboard', 'Summary', 'Who leads each main category in the filters.', <ScoreboardBody c={c} />),
    tile('res', 'Results', 'Results', 'Matches won, lost, drawn or tied and with no result for each team in the filters, with the share of all matches. Gold is a win, grey a draw or tie and sky a loss in the bars.', <ResultsBody c={c} />),
    tile('season', 'By season', 'Results', 'Win rate in each season for both teams. A gap means the team had no match with a result that season.', <SeasonBody c={c} />),
    tile('cond', 'Batting order and toss', 'Results', `Results when batting first and when ${tests ? 'bowling first' : 'chasing'}, and how the toss went. Win rate leaves out matches with no result${tests ? '' : ''}.`, <ConditionsBody c={c} />),
    tile('tro', 'Trophies', 'Silverware', 'Titles and lost finals in every tournament either team played, with the editions played. Bilateral series are not counted.', <TrophiesBody c={c} />),
    tile('ko', 'Knockouts', 'Silverware', 'How far each team gets in tournaments.', <KnockoutsBody c={c} />),
    tile('phase', 'Phases', 'Style', 'Batting strike rate and bowling economy in each phase of the innings.', <PhasesBody c={c} />),
    tile('field', 'Fielding', 'Style', 'Catches, stumpings and run outs for the matches in the filters. The data has no wicketkeeper field, so stumpings go to the fielder who made them.', <FieldingBody c={c} />),
  ];
}

// ---- Versus each other ------------------------------------------------------------------------------------------------

function NoGames({ c, what }: { c: TeamCtx; what: string }) {
  return <Thin>{c.a.name} and {c.b.name} have no match in this slice.{c.canClear && <> <button type="button" className="clr" onClick={c.onClear}>Clear filters</button></>} {what}</Thin>;
}

function HeadToHeadBody({ c }: { c: TeamCtx }) {
  const sides = useSideColours();
  const { bar, side } = useSides(['Last matches', 'Biggest wins']);
  const ms = c.between.ms;
  if (ms.length === 0) return <NoGames c={c} what="" />;
  const k = counts(ms), n = ms.length, other = k.draw + k.tie + k.nr;
  const sorted = [...ms].sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id), last = sorted.slice(0, 5);
  const bigRuns = (res: 'won' | 'lost'): TeamMatch | undefined => ms.filter((m) => m.result === res && m.byRuns !== null).sort((x, y) => Number(y.byInnings) - Number(x.byInnings) || (y.byRuns ?? 0) - (x.byRuns ?? 0))[0];
  const seg = (v: number, bg: string, fg: string, text: string): ReactNode => (v ? <i style={{ width: `${(v / n) * 100}%`, background: bg, color: fg }} title={text}>{v / n > 0.08 ? text : ''}</i> : null);
  const scoreText = (m: TeamMatch): string => `${scoreOf([...c.between.innings.get(m.id) ?? []], m.id, 'for') || '-'} to ${scoreOf([...c.between.innings.get(m.id) ?? []], m.id, 'against') || '-'}`;
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <Kn side="a" value={k.won} label={`${c.a.name} wins`} /><Kn value={other} label="draws, ties and no results" /><Kn side="b" value={k.lost} label={`${c.b.name} wins`} />
      </div>
      <Mo k={vkey(c, 'bar')} className="h2bar">
        <div className="stk big dsb">{seg(k.won, GOLD, inkFor(sides.a), `${short(c.a.name)} ${k.won}`)}{seg(other, '#6c717a', '#fff', String(other))}{seg(k.lost, SKY, inkFor(sides.b), `${short(c.b.name)} ${k.lost}`)}</div>
      </Mo>
      {bar}
      <Mo k={`${vkey(c, 'h2h')}|${side}`} className="h2w fixw" style={{ marginTop: 12 }}>
        {pickSide([
          <div className="h2s" key="last"><div className="h2t"><span>Last matches</span><em>newest first</em></div>
            {last.map((m) => <div className="h2r" key={m.id}><Pill v={m.result === 'won' ? short(c.a.name) : m.result === 'lost' ? short(c.b.name) : m.result === 'nr' ? 'No result' : 'Draw'} colour={m.result === 'won' ? GOLD : m.result === 'lost' ? SKY : '#6c717a'} /><span>{m.year}, {m.tname ?? m.event ?? m.format}, {m.venue ?? 'unknown ground'}</span><b className="hp" style={{ background: '#2a2a2a', color: '#fff' }}>{scoreText(m)}</b></div>)}
          </div>,
          <div className="h2s" key="big"><div className="h2t"><span>Biggest wins</span><em>by runs</em></div>
            {([[bigRuns('won'), c.a.name, GOLD], [bigRuns('lost'), c.b.name, SKY]] as const).map(([m, nm, colour]) => (
              <div className="h2r" key={nm}><Pill v={short(nm)} colour={colour} /><span>{m ? `${m.year}, ${m.tname ?? m.event ?? m.format}` : 'no win by runs'}</span><b className="hp" style={{ background: '#2a2a2a', color: '#fff' }}>{m ? (m.byInnings ? `an innings and ${m.byRuns} runs` : `${m.byRuns} runs`) : '-'}</b></div>
            ))}
          </div>,
        ], side)}
      </Mo>
    </>
  );
}

function MatchesBetweenBody({ c }: { c: TeamCtx }) {
  const link = useMatchRowLink();
  const ms = [...c.between.ms].sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id);
  // A long rivalry has hundreds of matches: only the rows on screen are drawn.
  const win = useWindowedRows<HTMLDivElement>(ms.length, `${vkey(c, 'list')}:${ms.length}`);
  if (ms.length === 0) return <NoGames c={c} what="" />;
  const inn = (m: TeamMatch, side: 'for' | 'against'): string => scoreOf([...c.between.innings.get(m.id) ?? []], m.id, side) || '-';
  return (
    <Mo k={vkey(c, 'list')} className="tw sc sqb" winRef={win.ref}><table className="fst">
      <thead><tr><th className="l">Year</th><th className="l">Competition</th><th className="l">Ground</th><th className="l">Batting first</th><th className="l">{c.a.name}</th><th className="l">{c.b.name}</th><th className="l">Result</th></tr></thead>
      <tbody><WindowSpacer height={win.before} columns={7} />{ms.slice(win.from, win.to).map((m, k) => (
        <tr key={m.id} data-late={win.windowed && win.from + k >= REVEALED ? '' : undefined} {...link(m.id, `${c.a.name} v ${c.b.name}`)}>
          <td className="l"><b>{m.year}</b></td><td className="l">{m.tname ?? m.event ?? m.format}</td><td className="l">{m.venue ?? '-'}</td>
          <td className="l">{m.batFirst === null ? '-' : m.batFirst ? c.a.name : c.b.name}</td><td className="l">{inn(m, 'for')}</td><td className="l">{inn(m, 'against')}</td>
          <td className="l">{m.result === 'won' ? `${c.a.name} won` : m.result === 'lost' ? `${c.b.name} won` : marginText(m).replace(/^./, (x) => x.toUpperCase())}</td>
        </tr>
      ))}<WindowSpacer height={win.after} columns={7} /></tbody>
    </table></Mo>
  );
}

function ByYearBody({ c }: { c: TeamCtx }) {
  const phone = usePhone();
  const years = winsByYear(c.between.ms);
  if (years.length === 0) return <NoGames c={c} what="" />;
  const va = years.map((y) => y.a), vb = years.map((y) => y.b);
  return (
    <div className="fcm"><div className="art">
      <CompareBars series={[{ name: c.a.name, colour: GOLD, values: va }, { name: c.b.name, colour: SKY, values: vb }]} labels={years.map((y) => `'${String(y.year).slice(2)}`)} axisLabel="Wins" decimals={0} label="Wins in each year"
        tip={(i) => <TipBody title={String(years[i]!.year)} sub="Wins" rows={[{ label: c.a.name, value: String(va[i]), colour: GOLD }, { label: c.b.name, value: String(vb[i]), colour: SKY }]} />} />
    </div>{phone && <Who a={c.a.name} b={c.b.name} />}</div>
  );
}

function WhereBody({ c }: { c: TeamCtx }) {
  const rows = winsByGround(c.between.ms);
  if (rows.length === 0) return <NoGames c={c} what="" />;
  return (
    <Mo k={vkey(c, 'ground')} className="tw sc sqb"><table className="fst">
      <thead><tr><th className="l">Ground</th><th>Matches</th><th>{c.a.name} wins</th><th>{c.b.name} wins</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.ground}><td className="l"><b>{r.ground}</b></td><td>{r.matches}</td><td>{r.a}</td><td>{r.b}</td></tr>)}</tbody>
    </table></Mo>
  );
}

/** The four tiles of the Versus view: Record, and Over time and place. */
export function teamVersusTiles(c: TeamCtx): TileDef[] {
  const tile = (id: string, label: string, group: string, tip: string, body: ReactNode): TileDef => ({ id, label, group, title: label, tip, tag: 'Cricsheet', wide: true, body });
  return [
    tile('vd', 'Head to head', 'Record', "Every match between the two teams in the filters. The bar is each team's share of the wins, with draws and ties in grey. Scores are from the first team's side.", <HeadToHeadBody c={c} />),
    tile('vlist', 'Matches between them', 'Record', `Every match between the two teams in the filters, newest first, from ${c.a.name}'s side. A row opens the match page.`, <MatchesBetweenBody c={c} />),
    tile('vyear', 'Head to head by year', 'Over time and place', 'Wins for each team in the matches between them, year by year.', <ByYearBody c={c} />),
    tile('vven', 'Where they met', 'Over time and place', 'Matches between the two teams at each ground, with the wins for each team.', <WhereBody c={c} />),
  ];
}

export type { TeamAgg };
