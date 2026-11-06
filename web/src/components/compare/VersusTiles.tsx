'use client';

import { useMemo, type ReactNode } from 'react';
import { fetchTournamentIndex } from '@/data/tournamentData';
import type { SharedMatch } from '@/data/compareDuel';
import { directionsByInnings, duelDismissals, duelPhase, duelPhaseKeys, duelTotals, duelYears, yearOfDuel, type Direction, type DuelInnings } from '@/domain/compareDuel';
import type { PlayerFilters } from '@/domain/filters';
import { describePhase, phaseOrder, type PhaseFormat } from '@/domain/phases';
import { CompareLines } from './CompareCharts';
import { pickSide, useSides } from '../analysis/useSides';
import { usePhone } from '../usePhone';
import { DISMISSAL_COLOURS, Fig, GOLD, Kn, Mo, SKY, Thin } from './compareUi';
import type { PlayerScope } from './useScopes';
import { useAsync } from './useAsync';
import { useMatchRowLink } from '../useMatchRowLink';
import { REVEALED } from '../useTableMotion';
import { useWindowedRows } from '../useWindowedRows';
import { WindowSpacer } from '../WindowSpacer';
import type { TileDef } from '../TileCarousel';
import { TipBody } from '../TipBody';

/** What every tile of the Versus view reads: the two players, their balls against each other and the matches they shared. */
export interface VersusCtx {
  nameA: string; nameB: string;
  a: PlayerScope; b: PlayerScope;
  filters: PlayerFilters;
  perFive: boolean;
  tests: boolean;
  /** Null until the balls between the two have loaded. */
  innings: readonly DuelInnings[] | null;
  shared: readonly SharedMatch[];
  canClear: boolean;
  onClear: () => void;
}

interface Half { has: boolean; msg: string; html: ReactNode; /** The chip a phone shows for this direction. */ label?: string }

/** What a tile's rows play again for: the two players, the filters and the balls found. */
const vkey = (c: VersusCtx): string => `${c.nameA}|${c.nameB}|${c.filters.format}|${c.filters.competition}|${c.filters.season}|${c.innings?.length ?? '-'}`;
const fixed = (v: number | null, d: number): string => (v === null ? '-' : v.toFixed(d));
const sideOf = (c: VersusCtx, d: Direction) => (d === 'ab' ? { bat: c.nameA, bowl: c.nameB, cb: GOLD, cw: SKY } : { bat: c.nameB, bowl: c.nameA, cb: SKY, cw: GOLD });
const didNotBowl = (c: VersusCtx, d: Direction): string => `${sideOf(c, d).bowl} did not bowl to ${sideOf(c, d).bat} in this slice.`;

/** Two halves side by side, the direction with more innings first. When only one has balls it fills the tile and the other is said in a note under it. */
function Halves({ halves, k }: { halves: Half[]; k: string }): ReactNode {
  const ok = halves.filter((h) => h.has);
  const { bar, side } = useSides(ok.length === 2 ? halves.map((h) => h.label ?? '') : []);
  if (ok.length === 2 || ok.length === 0) return <>{bar}<Mo k={`${k}|${side}`} className="h2w">{pickSide(halves.map((h, i) => <div className="h2s" key={i}>{h.html}</div>), side)}</Mo></>;
  const missing = halves.find((h) => !h.has)!;
  return <><Mo k={k} className="h2w one"><div className="h2s">{ok[0]!.html}</div></Mo><div className="slnote">{missing.msg}</div></>;
}

function Title({ c, d }: { c: VersusCtx; d: Direction }) {
  const s = sideOf(c, d);
  return <div className="h2t"><span>{s.bat} <em>as batter</em></span><span><em>as bowler</em> {s.bowl}</span></div>;
}

function Gate({ c, children }: { c: VersusCtx; children: (xs: readonly DuelInnings[]) => ReactNode }) {
  if (!c.innings) return <Thin>Loading</Thin>;
  if (c.innings.length === 0) {
    const bowled = (s: PlayerScope): boolean => s.bowl.length > 0;
    const why = !bowled(c.a) && !bowled(c.b) ? 'Neither of them bowled in this slice.' : !bowled(c.a) ? `${c.nameA} did not bowl in this slice.` : !bowled(c.b) ? `${c.nameB} did not bowl in this slice.` : 'Neither has bowled to the other in the data.';
    return <Thin>No balls between {c.nameA} and {c.nameB} in this slice. {why}{c.shared.length > 0 && <> They were in {c.shared.length} {c.shared.length === 1 ? 'match' : 'matches'} together (see Matches together).</>}{c.canClear && <> <button type="button" className="clr" onClick={c.onClear}>Clear filters</button></>}</Thin>;
  }
  return <>{children(c.innings)}</>;
}

const Pill = ({ v, colour }: { v: ReactNode; colour: string }) => <b className="hp" style={{ background: colour }}>{typeof v === 'string' || typeof v === 'number' ? <Fig text={String(v)} /> : v}</b>;

function HeadToHead({ c }: { c: VersusCtx }) {
  return (
    <Gate c={c}>{(all) => (
      <Halves k={vkey(c)} halves={directionsByInnings(all).map((d): Half => {
        const xs = all.filter((x) => x.dir === d), t = duelTotals(xs, c.perFive), s = sideOf(c, d);
        const rows: Array<[string, string, ReactNode, ReactNode]> = [
          ['Runs scored', 'Balls bowled', t.runs, t.balls], ['Strike rate', c.perFive ? 'Economy per 5 balls' : 'Economy', fixed(t.strikeRate, 1), fixed(t.economy, 2)],
          ['Dismissed', 'Balls per wicket', t.outs, fixed(t.ballsPerWicket, 1)], ['Highest score', 'Best figures', t.highScore === null ? '-' : `${t.highScore}${t.highScoreNotOut ? '*' : ''}`, t.best ? `${t.best.w}/${t.best.r}` : '-'],
          ['Fours and sixes', 'Runs per wicket', `${t.fours} and ${t.sixes}`, fixed(t.average, 1)],
        ];
        return {
          has: xs.length > 0, msg: didNotBowl(c, d), label: `${s.bat} bats`,
          html: <><Title c={c} d={d} /><div className="h2n">{xs.length ? `${xs.length} innings` : 'No balls'}</div>
            {xs.length ? rows.map(([l1, l2, a, b]) => <div className="h2r" key={l1}><Pill v={a} colour={s.cb} /><span>{l1} <i>/</i> {l2}</span><Pill v={b} colour={s.cw} /></div>) : <div className="thin">{didNotBowl(c, d)}</div>}</>,
        };
      })} />
    )}</Gate>
  );
}

function HowOut({ c }: { c: VersusCtx }) {
  return (
    <Gate c={c}>{(all) => (
      <Halves k={vkey(c)} halves={directionsByInnings(all).map((d): Half => {
        const xs = all.filter((x) => x.dir === d), shares = duelDismissals(xs), n = shares.reduce((a, s) => a + s.wickets, 0);
        return {
          has: xs.length > 0, msg: didNotBowl(c, d), label: `${sideOf(c, d).bat} bats`,
          html: <><Title c={c} d={d} /><div className="h2n">{n} {n === 1 ? 'dismissal' : 'dismissals'} in {xs.length} innings</div>
            {n ? <>
              <div className="stk big dsb">{shares.map((s, k) => (s.wickets ? <i key={s.label} style={{ width: `${s.share * 100}%`, background: DISMISSAL_COLOURS[k], color: '#0b0b0b' }} title={`${s.label}: ${s.wickets}`}>{s.share > 0.12 ? `${Math.round(s.share * 100)}%` : ''}</i> : null))}</div>
              {shares.filter((s) => s.label !== 'Other' || s.wickets > 0).map((s) => { const k = shares.indexOf(s); return <div className="h2r dr" key={s.label}><u style={{ background: DISMISSAL_COLOURS[k] }} /><span>{s.label}</span><b className="hp" style={{ background: '#2a2a2a', color: '#fff' }}>{s.wickets}</b></div>; })}
            </> : <div className="thin">{sideOf(c, d).bowl} has not dismissed {sideOf(c, d).bat} in this slice.</div>}</>,
        };
      })} />
    )}</Gate>
  );
}

function ByYear({ c }: { c: VersusCtx }) {
  const phone = usePhone();
  return (
    <Gate c={c}>{(all) => {
      const years = [...new Set(all.map(yearOfDuel))].sort((x, y) => x - y);
      const series = directionsByInnings(all).map((d) => ({ name: `${sideOf(c, d).bat} batting v ${sideOf(c, d).bowl}`, colour: sideOf(c, d).cb, values: duelYears(all.filter((x) => x.dir === d), years) }));
      return (
        <div className="fcm"><div className="art">
          <CompareLines series={series} labels={years.map((y) => `'${String(y).slice(2)}`)} labelStep={Math.max(1, Math.round(years.length / 12))} axisLabel="Strike rate" xTitle="Year" decimals={0} label="Strike rate of each batter against the other bowler by year"
            tip={(k) => <TipBody title={String(years[k])} sub="Strike rate" rows={series.map((s) => ({ label: s.name, value: fixed(s.values[k] ?? null, 1), colour: s.colour }))} />} />
        </div>{phone && <div className="fleg dsl">{series.map((s) => <span key={s.name}><u style={{ background: s.colour }} />{s.name}</span>)}</div>}</div>
      );
    }}</Gate>
  );
}

function ByPhase({ c }: { c: VersusCtx }) {
  const mixed = (c.filters.format === 'INTERNATIONAL' || c.filters.format === 'T20S' || c.filters.format === 'LEAGUE') && c.filters.competition === null;
  return (
    <Gate c={c}>{(all) => {
      if (mixed) return <Thin>Phases are defined per format. Pick Tests, ODIs, T20Is or one competition in the filters above.</Thin>;
      const fmt: PhaseFormat = c.tests ? 'test' : c.filters.format === 'ODI' ? 'odi' : 't20';
      const keys = duelPhaseKeys(all, phaseOrder);
      return (
        <Halves k={vkey(c)} halves={directionsByInnings(all).map((d): Half => {
          const xs = all.filter((x) => x.dir === d), s = sideOf(c, d);
          return {
            has: xs.length > 0, msg: didNotBowl(c, d), label: `${s.bat} bats`,
            html: <><Title c={c} d={d} /><div className="h2n">{xs.length} innings</div>
              {keys.map((k) => { const p = duelPhase(xs, k, c.perFive), nm = describePhase(k, fmt, c.perFive); return <div className="h2r" key={k}><Pill v={fixed(p.strikeRate, 1)} colour={s.cb} /><span>{nm.name} <i>/</i> {p.balls} balls</span><Pill v={fixed(p.economy, 2)} colour={s.cw} /></div>; })}</>,
          };
        })} />
      );
    }}</Gate>
  );
}

const DATE = (d: string): string => d.slice(0, 4);

function useEventNames(): ReadonlyMap<string, string> {
  const list = useAsync('tournament-names', () => fetchTournamentIndex());
  return useMemo(() => new Map((list ?? []).map((t) => [t.key, t.name])), [list]);
}

const FORMAT_WORD: Record<string, string> = { TEST: 'Test', ODI: 'ODI', T20: 'T20' };

function Event({ format, key_, names }: { format: string; key_: string | null; names: ReadonlyMap<string, string> }) {
  const ev = key_ ? names.get(key_) : undefined;
  return <>{ev ?? FORMAT_WORD[format] ?? format}{ev ? <em>{FORMAT_WORD[format] ?? format}</em> : null}</>;
}

function InningsList({ c }: { c: VersusCtx }) {
  return (
    <Gate c={c}>{(all) => <InningsTable c={c} rows={[...all].sort((x, y) => y.date.localeCompare(x.date) || y.matchId - x.matchId || x.innings - y.innings)} />}</Gate>
  );
}

/** The innings of the list, a window of them at a time: two players who meet often have hundreds. */
function InningsTable({ c, rows }: { c: VersusCtx; rows: readonly DuelInnings[] }) {
  const names = useEventNames(), link = useMatchRowLink();
  const win = useWindowedRows<HTMLDivElement>(rows.length, `${vkey(c)}:${rows.length}`);
  return (
    <Mo k={vkey(c)} className="tw sc sqb" winRef={win.ref}><table className="fst">
      <thead><tr><th className="l">Year</th><th className="l">Format</th><th className="l">Batter</th><th className="l">Bowler</th><th>Balls</th><th>Runs</th><th>Strike rate</th><th className="l">Out</th></tr></thead>
      <tbody><WindowSpacer height={win.before} columns={8} />{rows.slice(win.from, win.to).map((x, k) => {
        const s = sideOf(c, x.dir);
        return (
          <tr key={`${x.dir}|${x.matchId}|${x.innings}`} data-late={win.windowed && win.from + k >= REVEALED ? '' : undefined} {...link(x.matchId, `${s.bat} v ${s.bowl}`)}>
            <td className="l"><b>{DATE(x.date)}</b></td><td className="l"><Event format={x.format} key_={x.tournament_key} names={names} /></td>
            <td className="l">{s.bat}</td><td className="l">{s.bowl}</td><td>{x.balls}</td><td>{x.runs}</td><td>{fixed((x.runs / x.balls) * 100, 1)}</td><td className="l">{x.dismissal ? x.dismissal.charAt(0).toUpperCase() + x.dismissal.slice(1) : 'not out'}</td>
          </tr>
        );
      })}<WindowSpacer height={win.after} columns={8} /></tbody>
    </table></Mo>
  );
}

function MatchesTogether({ c }: { c: VersusCtx }) {
  const names = useEventNames(), link = useMatchRowLink();
  const ms = c.shared;
  const win = useWindowedRows<HTMLDivElement>(ms.length, `${vkey(c)}:${ms.length}`);
  if (ms.length === 0) return <Thin>No shared matches in this slice.{c.canClear && <> <button type="button" className="clr" onClick={c.onClear}>Clear filters</button></>}</Thin>;
  const opp = ms.filter((m) => m.relation === 'Opponents'), won = opp.filter((m) => m.resultForA === 'won').length;
  // Each player's own score in the match: every innings they batted, a star for not out.
  const score = (s: PlayerScope, id: number): string => { const x = s.bat.filter((b) => b.match_id === id).sort((p, q) => p.innings - q.innings); return x.length ? x.map((b) => `${b.runs}${b.is_out ? '' : '*'}`).join(' & ') : 'did not bat'; };
  return (
    <>
      <div className="tkh" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Kn value={ms.length} label="matches together" /><Kn value={opp.length} label="as opponents" /><Kn value={ms.length - opp.length} label="as teammates" /><Kn value={opp.length ? `${won} of ${opp.length}` : '-'} label={`${c.nameA}'s side won`} />
      </div>
      <Mo k={vkey(c)} className="tw sc sqb" winRef={win.ref}><table className="fst">
        <thead><tr><th className="l">Date</th><th className="l">Format</th><th className="l">Link</th><th className="l">{c.nameA}</th><th className="l">{c.nameB}</th><th className="l">Result for {c.nameA}</th></tr></thead>
        <tbody><WindowSpacer height={win.before} columns={6} />{ms.slice(win.from, win.to).map((m, k) => (
          <tr key={m.matchId} data-late={win.windowed && win.from + k >= REVEALED ? '' : undefined} {...link(m.matchId, `${c.nameA} v ${c.nameB}`)}>
            <td className="l"><b>{DATE(m.date)}</b></td><td className="l"><Event format={m.format} key_={m.tournament_key} names={names} /></td><td className="l">{m.relation}</td>
            <td className="l">{score(c.a, m.matchId)}</td><td className="l">{score(c.b, m.matchId)}</td><td className="l">{m.resultForA === 'won' ? 'Won' : m.resultForA === 'lost' ? 'Lost' : 'No result'}</td>
          </tr>
        ))}<WindowSpacer height={win.after} columns={6} /></tbody>
      </table></Mo>
    </>
  );
}

/** The six tiles of the Versus view, in the groups of the mockup: Duel, Over time and Between them. */
export function versusTiles(c: VersusCtx): TileDef[] {
  const tile = (id: string, label: string, group: string, tip: string, body: ReactNode): TileDef => ({ id, label, group, title: label, tip, tag: 'Cricsheet', wide: true, body });
  return [
    tile('vd', 'Head to head', 'Duel', 'What happened when one of them batted while the other bowled, ball by ball. Batter on the left, bowler on the right. Average is runs per dismissal.', <HeadToHead c={c} />),
    tile('vdis', 'How they got each other out', 'Duel', 'Dismissals by type in each direction, only from balls between the two. Run outs are not a bowler dismissal and are left out.', <HowOut c={c} />),
    tile('vyear', 'Duels by year', 'Over time', 'Strike rate of each batter against the other bowler, year by year. A gap means no balls that year.', <ByYear c={c} />),
    tile('vph', 'Duels by phase', 'Over time', 'Strike rate for the batter and economy for the bowler in each phase, from balls between the two.', <ByPhase c={c} />),
    tile('vlist', 'Innings between them', 'Between them', 'Every innings where one of them batted while the other bowled. Newest first.', <InningsList c={c} />),
    tile('vtog', 'Matches together', 'Between them', 'Matches both players were in. When they were on opposite sides, the result is from the first player\'s side. Scores are each player\'s own.', <MatchesTogether c={c} />),
  ];
}
