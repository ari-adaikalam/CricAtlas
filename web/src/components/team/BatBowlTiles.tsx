'use client';

import { useMemo } from 'react';
import { usePhone } from '../usePhone';
import { pickSide, useSides } from '../analysis/useSides';
import { useTableMotion } from '../useTableMotion';
import { int, Kn, Loaded, NoMatches, pct, plural, Ready, ResultBar, LOST, WON } from './teamUi';
import type { Ctx } from './ResultsTiles';
import type { PhaseAverage, TeamPhaseRow, TeamPlayerRow, TeamReviewRow, TeamStyleRow, TeamWicketRow } from '@/domain/team';
import { extrasConceded, fieldingKey, phaseCards, reviewSummary, scopeKind, styleSplit, wicketWays, TRACKING_MIN, type PhaseCard } from '@/domain/teamBBF';

function Card({ p, bat, hundred }: { p: PhaseCard; bat: boolean; hundred: boolean }) {
  const unit = bat ? 'strike rate' : hundred ? 'economy per 5 balls' : 'economy';
  const d = p.rate !== null && p.average !== null ? (bat ? p.rate - p.average : p.average - p.rate) : null;
  const dp = bat ? 0 : 2;
  return (
    <div className="phc">
      <h5>{p.name}</h5><span className="g">{p.range || '\u00a0'}</span>
      <div className="big2">{p.rate === null ? '-' : p.rate.toFixed(bat ? 0 : 2)}</div><span className="g">{unit}</span>
      {d !== null && <div className={`dtag ${d >= 0 ? 'up' : 'dn'}`} title="Compared with what an average side does off the same balls in the same kind of match">{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(dp)} vs format</div>}
      <div className="pst"><span>{bat ? 'Runs' : 'Runs conceded'}</span><b>{int.format(p.runs)}</b></div>
      <div className="pst"><span>{bat ? 'Wickets lost' : 'Wickets taken'}</span><b>{int.format(p.wickets)}</b></div>
      <div className="pst"><span>{bat ? 'Average' : 'Bowling average'}</span><b>{p.runsPerWicket === null ? '-' : p.runsPerWicket.toFixed(1)}</b></div>
      <div className="pst"><span>Dot balls</span><b>{pct(p.dotShare)}</b></div>
      <div className="pst"><span>Boundary balls</span><b>{pct(p.boundaryShare)}</b></div>
    </div>
  );
}

/**
 * The Batting and Bowling cards: one card for each phase, with the strike rate (economy for bowling), how it compares with what an average side does off the same balls, the runs, the wickets, the average and the dot
 * and boundary shares. Tests use the new ball and blocks of 30 overs, The Hundred the Powerplay and the rest of the innings. Bowling adds the split between pace and spin bowlers.
 */
export function PhasesBody({ c, side, phases, styles, avgs, gender }: { c: Ctx; side: 'for' | 'against'; phases: Loaded<TeamPhaseRow[]>; styles: Loaded<TeamStyleRow[]>; avgs: Loaded<PhaseAverage[]>; gender: 'male' | 'female' }) {
  const kind = scopeKind(c.ms);
  const cards = useMemo(() => (phases.status === 'ready' ? phaseCards(phases.data, c.ms, side, avgs.status === 'ready' ? avgs.data : [], gender) : []), [phases, c.ms, side, avgs, gender]);
  const split = useMemo(() => (styles.status === 'ready' ? styleSplit(styles.data, c.ms) : []), [styles, c.ms]);
  // On a phone one phase shows at a time, picked by a chip for each.
  const { bar, side: pick } = useSides(cards.map((p) => p.name.replace(/^Overs /, '')));
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  const hundred = kind === 'hundred';
  const bat = side === 'for';
  return (
    <Ready of={phases} what="phase file">{() => (
      <>
        {bar}
        <div className="phrow" style={{ gridTemplateColumns: `repeat(${Math.max(1, cards.length)},1fr)` }}>
          {pickSide(cards.map((p) => <Card key={p.key} p={p} bat={bat} hundred={hundred} />), pick)}
        </div>
        {!bat && split.length > 0 && (
          <div className="psr">
            {split.map((s) => (
              <div className="psc" key={s.group}><b>{s.group === 'pace' ? 'Pace' : s.group === 'spin' ? 'Spin' : 'Other bowlers'}</b><span>{pct(s.share)} of the balls</span><span>{plural(s.wickets, 'wicket')}</span><span>economy {s.economy === null ? '-' : s.economy.toFixed(2)}{hundred ? ' per 5 balls' : ''}</span></div>
            ))}
          </div>
        )}
      </>
    )}</Ready>
  );
}

/** Fielding: catches, stumpings and run outs, how often a fielder was involved in a wicket and, where tracking covers at least 30% of the matches, dropped catches. */
export function FieldingBody({ c, players, wickets }: { c: Ctx; players: Loaded<TeamPlayerRow[]>; wickets: Loaded<TeamWicketRow[]> }) {
  const f = useMemo(() => (players.status === 'ready' ? fieldingKey(players.data, wickets.status === 'ready' ? wickets.data : [], c.ms) : null), [players, wickets, c.ms]);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  return (
    <Ready of={players} what="player file">{() => f && (
      <>
        <div className="fkg">
          <Kn value={int.format(f.catches)} label="catches" /><Kn value={int.format(f.stumpings)} label="stumpings" /><Kn value={int.format(f.runOuts)} label="run outs" />
          <Kn value={f.matches ? (f.catches / f.matches).toFixed(1) : '-'} label="catches per match" />
          <Kn value={wickets.status === 'ready' ? int.format(f.wicketsTaken) : '-'} label="wickets taken" /><Kn value={pct(f.involved)} label="of wickets involved a fielder" />
          <Kn value={f.droppedShare === null ? '-' : pct(f.droppedShare)} label="of catching chances dropped" /><Kn value={f.dropped === null ? '-' : f.dropped} label="dropped catches" />
        </div>
        <div className="slnote">{f.dropped !== null ? `Dropped catches are counted in the ${f.trackedMatches} of ${f.matches} matches that have tracking.` : `Tracking covers only ${f.trackedMatches} of ${f.matches} matches (under ${Math.round(TRACKING_MIN * 100)}%), so dropped catches are hidden.`}</div>
      </>
    )}</Ready>
  );
}

/** How wickets were taken: two bars side by side for each way a wicket falls, the wickets the team took and the wickets it lost. */
export function HowBody({ c, wickets }: { c: Ctx; wickets: Loaded<TeamWicketRow[]> }) {
  const w = useMemo(() => (wickets.status === 'ready' ? wicketWays(wickets.data, c.ms) : null), [wickets, c.ms]);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  return (
    <Ready of={wickets} what="wickets file">{() => {
      if (!w) return null;
      const peak = Math.max(1, ...w.ways.flatMap((x) => [x.taken, x.lost]));
      return (
        <>
          <div className="hbw hbw2">
            <div className="hbh"><span /><span>Taken</span><span>Lost</span></div>
            {w.ways.map((x) => (
              <div className="hbr" key={x.key}>
                <span>{x.name}</span>
                <i title={`${x.name}: ${x.taken} taken`}><u style={{ width: `${(x.taken / peak) * 100}%`, background: WON }} /><b>{int.format(x.taken)}</b><em>{w.taken ? Math.round((x.taken / w.taken) * 100) : 0}%</em></i>
                <i title={`${x.name}: ${x.lost} lost`}><u style={{ width: `${(x.lost / peak) * 100}%`, background: LOST }} /><b>{int.format(x.lost)}</b><em>{w.lost ? Math.round((x.lost / w.lost) * 100) : 0}%</em></i>
              </div>
            ))}
          </div>
        </>
      );
    }}</Ready>
  );
}

/** Reviews: the team's own reviews as the fielding side and as the batting side, how many the umpire changed, for the matches that have review data. */
export function ReviewsBody({ c, reviews, has }: { c: Ctx; reviews: Loaded<TeamReviewRow[]>; has: boolean }) {
  const r = useMemo(() => (reviews.status === 'ready' ? reviewSummary(reviews.data, c.ms) : null), [reviews, c.ms]);
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  if (!has) return <div className="thin">This team has no review data.</div>;
  return (
    <Ready of={reviews} what="reviews file">{() => {
      if (!r) return null;
      if (r.matchesWithData === 0) return <div className="thin">No review data for these matches.</div>;
      const side = (title: string, s: typeof r.fielding, note: string) => {
        const kept = s.taken - s.successful;
        const cc = { played: s.taken, won: s.successful, lost: kept, draw: 0, tie: 0, nr: 0, other: 0, rate: s.rate };
        return (
          <div className="bcr" key={title}>
            <div className="bch"><b>{title}</b><span>{plural(s.taken, 'review')}</span></div>
            {s.taken ? <ResultBar c={cc} /> : <div className="thin">No reviews.</div>}
            <div className="bck"><Kn value={pct(s.rate)} label="successful" /><Kn value={(s.taken / r.matchesWithData).toFixed(1)} label="reviews per match" /><Kn value={s.umpiresCall} label="lost on umpire's call" /></div>
            <span className="rvn">{note}</span>
          </div>
        );
      };
      return (
        <>
          <div className="bcs">{side('Fielding side', r.fielding, 'Appeals the team made while fielding.')}{side('Batting side', r.batting, 'Dismissals the team asked to have reviewed while batting.')}</div>
          <div className="slnote">Review data covers {r.matchesWithData} of {c.ms.length} matches.</div>
        </>
      );
    }}</Ready>
  );
}

/** Extras conceded: wides, no balls, byes and leg byes the team gave away while fielding, per innings and per season. Penalty runs are shown when there are any. */
export function ExtrasBody({ c }: { c: Ctx }) {
  const phone = usePhone();
  const e = useMemo(() => extrasConceded(c.innings, c.ms, c.national), [c.innings, c.ms, c.national]);
  const { ref, motion } = useTableMotion<HTMLDivElement>(`${c.ms.length}:${e.seasons.length}`, e.seasons.map((s) => s.season).join('|'));
  if (c.ms.length === 0) return <NoMatches onClear={c.onClear} />;
  const a = e.all;
  const rows: Array<[string, number]> = [['Wides', a.wides], ['No-balls', a.noballs], ['Byes', a.byes], ['Leg byes', a.legbyes], ...(a.penalty ? [['Penalty runs', a.penalty] as [string, number]] : [])];
  const per = (n: number, i: number): string => (i ? (n / i).toFixed(1) : '-');
  return (
    <div className="tsc ext" ref={ref} data-rows={motion}>
      <table className="fst">
        <thead><tr><th className="l">Extra</th><th>Total</th><th>Per innings</th><th>Share</th></tr></thead>
        <tbody>{rows.map(([l, n]) => <tr key={l}><td className="l"><b>{l}</b></td><td><span>{int.format(n)}</span></td><td><span>{per(n, a.innings)}</span></td><td><span>{a.total ? Math.round((n / a.total) * 100) : 0}%</span></td></tr>)}</tbody>
        <tfoot><tr><td className="l"><b>All extras</b></td><td><b>{int.format(a.total)}</b></td><td><b>{per(a.total, a.innings)}</b></td><td /></tr></tfoot>
      </table>
      {e.seasons.length > 1 && (
        <table className="fst bys">
          <thead><tr><th className="l">Season</th><th title="Innings">{phone ? 'Inns' : 'Innings'}</th><th>Wides</th><th title="No-balls">{phone ? 'NB' : 'No-balls'}</th><th>Byes</th><th title="Leg byes">{phone ? 'LB' : 'Leg byes'}</th><th title="Per innings">{phone ? 'Per inn' : 'Per innings'}</th></tr></thead>
          <tbody>{[...e.seasons].reverse().map((s) => <tr key={s.season}><td className="l"><b>{s.season}</b></td><td>{s.innings}</td><td>{per(s.wides, s.innings)}</td><td>{per(s.noballs, s.innings)}</td><td>{per(s.byes, s.innings)}</td><td>{per(s.legbyes, s.innings)}</td><td className="bold"><span>{per(s.total, s.innings)}</span></td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

