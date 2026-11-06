'use client';

import { NameLink } from './NameLink';
import { TeamRef } from './TeamLinks';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMatchRowLink } from './useMatchRowLink';
import { loadRecordsCareer, loadRecordsScope, loadRecordsTrophies } from '@/data/views';
import { applyFilters, type PlayerFilters } from '@/domain/filters';
import { awardCards, fiftyCards, fiveWicketCards, hundredCards, isT20Scope, milestoneSections, paceRows, type MilestoneSection, type PaceFact, type PaceSide } from '@/domain/milestones';
import type { SummaryRow } from '@/domain/batting';
import { battingCards, battingList, bowlingCards, bowlingList, recordSides, searchRows, type BatInnings, type BowlInnings, type Card, type ListRow } from '@/domain/records';
import { TileCarousel, type TileDef } from './TileCarousel';
import { TileLoader } from './states/TileStates';
import { MilestoneCardsBody, PaceBody } from './MilestonesTile';
import { PartnershipsBody } from './PartnershipsTile';
import type { BatPartnership, BowlPartnership } from '@/domain/partnerships';
import { REVEALED, useTableMotion } from './useTableMotion';
import { useWindowedRows } from './useWindowedRows';
import { StreaksBody } from './StreaksTile';
import { TrophiesBody } from './TrophiesTile';
import { battingStreaks, bowlingStreaks, type PlayerMatch } from '@/domain/streaks';
import { inSeason, trophies, type TrophyEdition } from '@/domain/trophies';


interface Props {
  playerId: string;
  rows: readonly SummaryRow[];
  filters: PlayerFilters;
  /** The player's own side, so Best performances opens on bowling for a bowler. */
  role: 'bat' | 'bowl' | 'all';
  /** The player's name, for the partnership bars, and the first international year for the pre-2001 note. */
  name: string;
  firstYear: number | null;
  /** The next player's data is still loading: the tiles show their loaders and nothing is queried until it arrives. */
  idle?: boolean;
  /** Changing player in the tiles style: the row is already in place and only its contents fade in (TileCarousel). */
  instant?: boolean;
}

/** Milestones are career figures: Format and Competition apply and Season does not. */
interface Career { sections: MilestoneSection[]; pace: Record<PaceSide, PaceFact[]> }

type Side = 'bat' | 'bowl';

function none(side: Side): ReactNode {
  return <div className="thin">No {side === 'bat' ? 'batting' : 'bowling'} in this format or competition. Pick another in the strip above.</div>;
}

/** The innings of Best performances. It is memoised because every other tile's state change re-renders the view, and a long career has hundreds of rows. */
const BestRows = memo(function BestRows({ rows, resetKey }: { rows: readonly ListRow[]; resetKey: string }) {
  const win = useWindowedRows<HTMLSpanElement>(rows.length, resetKey, { rows: '.bpr', scroller: 'parent' });
  // The whole row leads to its match (Ari, 2026-10-22). The team's name inside it is its own link.
  const rowLink = useMatchRowLink();
  return <><span ref={win.ref} hidden />{win.before > 0 && <div data-spacer="" aria-hidden="true" style={{ height: win.before, flex: '0 0 auto' }} />}{rows.slice(win.from, win.to).map((r, k) => <div className="bpr go" key={r.key} data-rk={r.key} data-late={win.from + k >= REVEALED ? '' : undefined} title={`${r.main}, ${r.detail}, ${r.opponent}, ${r.where}`} {...rowLink(r.matchId, `${r.opponentName}, ${r.where}`)}><span className="bpn">{r.rank}</span><span className="bpb">{r.main}</span><span className="bps">{r.detail}</span><span className="bpo">v <TeamRef name={r.opponentName} id={r.opponentId} inRow /></span><span className="bpw"><NameLink entity={{ kind: 'match', id: r.matchId, name: `${r.opponent}, ${r.where}` }}>{r.where}</NameLink></span></div>)}{win.after > 0 && <div data-spacer="" aria-hidden="true" style={{ height: win.after, flex: '0 0 auto' }} />}</>;
});

function Cards({ cards }: { cards: readonly Card[] }) {
  return <div className="kgrid k16">{cards.map((c, i) => <div className="kn" key={i}><b>{c.value}</b><span>{c.label}</span></div>)}</div>;
}

/**
 * The Records view: Format, Competition and Season narrow every tile, as in the player page mockup. Career highs shows the sides the player's whole career earns (a batter
 * or a bowler gets one grid, someone who is both gets two halves), never changing with the filters. Best performances lists every innings and has its own side switch.
 */
export function RecordsView({ playerId, rows, filters, role, name, firstYear, idle = false, instant = false }: Props) {
  const sides = useMemo(() => recordSides(rows), [rows]);
  const [bat, setBat] = useState<BatInnings[] | null>(null);
  const [bowl, setBowl] = useState<BowlInnings[] | null>(null);
  const [partnership, setPartnership] = useState<number | null>(null);
  const [batParts, setBatParts] = useState<BatPartnership[]>([]);
  const [bowlParts, setBowlParts] = useState<BowlPartnership[]>([]);
  const [matches, setMatches] = useState<PlayerMatch[]>([]);
  const [editions, setEditions] = useState<TrophyEdition[] | null>(null);
  const [streakSide, setStreakSide] = useState<Side>(role === 'bowl' ? 'bowl' : 'bat');
  const [partSide, setPartSide] = useState<Side>(role === 'bowl' ? 'bowl' : 'bat');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [side, setSide] = useState<Side>(role === 'bowl' ? 'bowl' : 'bat');
  const [text, setText] = useState('');
  const scopeKey = `${filters.format}|${filters.competition ?? ''}|${filters.season ?? ''}`;
  const careerKey = `${filters.format}|${filters.competition ?? ''}`;
  const [career, setCareer] = useState<Career | null>(null);
  const [paceSide, setPaceSide] = useState<PaceSide>(role === 'bowl' ? 'bowl' : 'bat');
  const t20 = useMemo(() => isT20Scope([...new Set(applyFilters(rows, { ...filters, season: null }).map((r) => r.format))]), [rows, filters]);

  // A filter change for the same player keeps the last answers on screen, dimmed, until the new ones arrive. Another player's are cleared.
  const shownFor = useRef<string | null>(null);
  const [busy, setBusy] = useState({ scope: false, editions: false, career: false });
  const sameAsShown = (): boolean => { const same = shownFor.current === playerId; return same; };
  useEffect(() => {
    let cancelled = false;
    if (!sameAsShown()) { setBat(null); setBowl(null); setBatParts([]); setBowlParts([]); setMatches([]); }
    setFailed(false);
    if (idle) return;
    setBusy((b) => ({ ...b, scope: true }));
    loadRecordsScope(playerId, filters)
      .then(([b, w, p, bp, wp, pm]) => { if (!cancelled) { setBusy((x) => ({ ...x, scope: false })); setBat(b); setBowl(w); setPartnership(p); setBatParts(bp); setBowlParts(wp); setMatches(pm); } })
      .catch((error: unknown) => { console.error('Records failed to load', playerId, error); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; setBusy((b) => ({ ...b, scope: false })); };
    // filters is read through scopeKey, which changes exactly when the queries would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, scopeKey, retry, idle]);

  // The Season choice is applied to the editions in the browser, so the editions are asked for again only when the Format or Competition changes.
  useEffect(() => {
    let cancelled = false;
    if (!sameAsShown()) setEditions(null);
    if (idle) return;
    setBusy((b) => ({ ...b, editions: true }));
    loadRecordsTrophies(playerId, filters)
      .then((e) => { if (!cancelled) { setEditions(e); setBusy((x) => ({ ...x, editions: false })); } })
      .catch((error: unknown) => { console.error('Trophies failed to load', playerId, error); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; setBusy((b) => ({ ...b, editions: false })); };
    // filters is read through careerKey, which changes exactly when the query would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, careerKey, retry, idle]);

  useEffect(() => {
    let cancelled = false;
    if (!sameAsShown()) setCareer(null);
    if (idle) return;
    setBusy((b) => ({ ...b, career: true }));
    loadRecordsCareer(playerId, filters)
      .then(([b, w, awards, paceBat, paceBowl]) => {
        if (cancelled) return;
        setBusy((x) => ({ ...x, career: false }));
        shownFor.current = playerId;
        setCareer({ sections: milestoneSections({ awards: awardCards(awards), fifties: fiftyCards(b), hundreds: hundredCards(b), fiveWickets: fiveWicketCards(w) }), pace: { bat: paceBat, bowl: paceBowl } });
      })
      .catch((error: unknown) => { console.error('Milestones failed to load', playerId, error); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; setBusy((b) => ({ ...b, career: false })); };
    // filters is read through careerKey, which changes exactly when the queries would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, careerKey, retry, idle]);

  const batCards = useMemo(() => (bat ? battingCards(bat, partnership) : null), [bat, partnership]);
  const bowlCards = useMemo(() => (bowl ? bowlingCards(bowl) : null), [bowl]);
  const batList = useMemo(() => (bat ? battingList(bat) : null), [bat]);
  const bowlList = useMemo(() => (bowl ? bowlingList(bowl) : null), [bowl]);
  const list: ListRow[] | null = side === 'bat' ? batList : bowlList;
  const found = useMemo(() => (list ? searchRows(list, text) : []), [list, text]);
  // The list plays in when the innings change, and the rows that stay slide into place as a search narrows it.
  const listMotion = useTableMotion<HTMLDivElement>(`${side}:${list?.length ?? 0}:${list?.[0]?.key ?? ''}`, `${side}:${text.trim()}:${found.length}`);
  const bothSides = sides.bat && sides.bowl;
  const shownStreak: Side = bothSides ? streakSide : sides.bowl ? 'bowl' : 'bat';
  const streakCards = useMemo(() => (bat === null || bowl === null ? null : shownStreak === 'bat' ? battingStreaks(bat, matches) : bowlingStreaks(bowl, matches)), [bat, bowl, matches, shownStreak]);
  const trophyData = useMemo(() => (editions === null ? null : trophies(inSeason(editions, filters.season))), [editions, filters.season]);
  const retryNote = <p className="thin">Records could not be loaded. <button type="button" className="mini" onClick={() => setRetry((n) => n + 1)}>Try again</button></p>;

  const highsBody = failed ? retryNote : batCards === null || bowlCards === null || bat === null || bowl === null ? <TileLoader label="Career highs" /> : sides.bat && sides.bowl ? (
    <div className="wsplit hs2">
      <div className="hsc"><h5 className="sub">Batting</h5>{bat.length ? <Cards cards={batCards} /> : none('bat')}</div>
      <div className="hsc"><h5 className="sub">Bowling</h5>{bowl.length ? <Cards cards={bowlCards} /> : none('bowl')}</div>
    </div>
  ) : sides.bowl ? (bowl.length ? <Cards cards={bowlCards} /> : none('bowl')) : (bat.length ? <Cards cards={batCards} /> : none('bat'));

  const bestBody = failed ? retryNote : list === null ? <TileLoader label="Best performances" /> : (side === 'bat' ? bat?.length : bowl?.length) === 0 ? (
    <div className="thin">No {side === 'bat' ? 'batting' : 'bowling'} in this format or competition. Pick another in the strip above, or use the switch.</div>
  ) : (
    <div className="bpl" ref={listMotion.ref} data-rows={listMotion.motion}>
      <div className="bph"><span>#</span><span>{side === 'bat' ? 'Score' : 'Figures'}</span><span>{side === 'bat' ? 'Balls and strike rate' : 'Overs and economy'}</span><span>Opponent</span><span style={{ textAlign: 'right' }}>Ground and date</span></div>
      <div className="bpc">
        {found.length ? <BestRows rows={found} resetKey={`${side}:${list?.length ?? 0}:${text.trim()}`} /> : <div className="thin">No innings match &ldquo;{text}&rdquo;.</div>}
      </div>
    </div>
  );

  const tiles: TileDef[] = [
    {
      id: 'highs', label: 'Career highs', group: 'Highs', title: 'Career highs', tag: 'Cricsheet', wide: sides.bat && sides.bowl,
      tip: sides.bat && sides.bowl
        ? 'Best innings, fastest scores and totals for batting, and best spells, matches and economy for bowling. Super Overs are not counted.'
        : sides.bowl ? 'Best spell, match and season. Super Overs are not counted.'
          : 'Best innings, fastest scores and totals. Super Overs are not counted.',
      body: highsBody,
    },
    {
      id: 'best', label: 'Best performances', group: 'Performances', title: 'Best performances', tag: 'Cricsheet',
      tip: side === 'bat'
        ? 'Every innings, highest score first, then fewest balls, then the latest match. Search by opponent, ground, year or score.'
        : 'Every bowling innings, most wickets first, then fewest runs, then the latest match. Search by opponent, ground, year or figures.',
      control: (
        <>
          <span className="sw msw">
            {([['bat', 'Batting'], ['bowl', 'Bowling']] as const).map(([value, label]) => <button key={value} type="button" className={side === value ? 'on' : undefined} onClick={() => setSide(value)}>{label}</button>)}
          </span>
          <input className="bpq" type="search" placeholder="Search opponent, ground, year" aria-label="Search innings" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
        </>
      ),
      body: bestBody,
    },
    {
      id: 'partnerships', label: 'Best partnerships', group: 'Partnerships', title: 'Best partnerships', tag: 'Cricsheet',
      tip: partSide === 'bat'
        ? 'Every partnership, biggest first, with the wicket, partner, balls, opponent and month. The bar splits the runs between the two batters and extras. A star means no wicket ended it.'
        : 'Every bowling pair, most wickets together first, then most wickets per over. A pair bowls in turn in one innings, for 10 overs in Tests, 8 in ODIs, 4 in T20 or 20 balls in The Hundred.',
      control: sides.bat && sides.bowl ? (
        <span className="sw msw">
          {([['bat', 'Batting'], ['bowl', 'Bowling']] as const).map(([value, label]) => <button key={value} type="button" className={partSide === value ? 'on' : undefined} onClick={() => setPartSide(value)}>{label}</button>)}
        </span>
      ) : undefined,
      body: failed ? retryNote : bat === null || bowl === null ? <TileLoader label="Best partnerships" /> : <PartnershipsBody side={sides.bat && sides.bowl ? partSide : sides.bowl ? 'bowl' : 'bat'} name={name} bat={batParts} bowl={bowlParts} />,
    },
    {
      id: 'streaks', label: 'Streaks', group: 'Streaks', title: 'Streaks', tag: 'Cricsheet', wide: true,
      tip: shownStreak === 'bat'
        ? 'The longest runs of consecutive innings meeting a condition. A match without a bat does not break a streak. Match streaks count every match played, and a tie, no result or draw ends both winning and losing runs.'
        : 'The longest runs of consecutive innings meeting a condition. A match without a bowl does not break a streak. The economy streak counts spells of 4 overs or more in T20 (5 in ODIs, 10 in Tests, 10 balls in The Hundred) against 6.5 an over in T20 (4.8 in ODIs, 2.6 in Tests, 5.4 per 5 balls in The Hundred).',
      control: bothSides ? (
        <span className="sw msw">
          {([['bat', 'Batting'], ['bowl', 'Bowling']] as const).map(([value, label]) => <button key={value} type="button" className={shownStreak === value ? 'on' : undefined} onClick={() => setStreakSide(value)}>{label}</button>)}
        </span>
      ) : undefined,
      body: failed ? retryNote : streakCards === null ? <TileLoader label="Streaks" /> : (shownStreak === 'bat' ? bat?.length : bowl?.length) === 0 ? none(shownStreak) : <StreaksBody cards={streakCards} />,
    },
    {
      id: 'trophies', label: 'Trophies', group: 'Trophies', title: 'Trophies', tag: 'Cricsheet', wide: true,
      tip: 'Titles and lost finals in every major tournament and league the player played in.',
      body: failed ? retryNote : trophyData === null ? <TileLoader label="Trophies" /> : <TrophiesBody data={trophyData} />,
    },
  ];
  const shownPace: PaceSide = bothSides ? paceSide : sides.bowl ? 'bowl' : 'bat';
  const rowsOfPace = useMemo(() => (career ? paceRows(shownPace, t20, playerId, career.pace[shownPace]) : null), [career, shownPace, t20, playerId]);
  tiles.push(
    {
      id: 'milestones', label: 'Milestones', group: 'Milestones', title: 'Fifties, hundreds and five-wicket hauls', tag: 'Cricsheet',
      tip: 'The 1st, 10th, 25th, 50th, 75th and 100th Player of the match award, fifty, hundred and five-wicket haul, with the innings or match number and month.',
      body: failed ? retryNote : career === null ? <TileLoader label="Milestones" /> : <MilestoneCardsBody sections={career.sections} />,
    },
    {
      id: 'pace', label: 'Milestone pace', group: 'Milestones', title: 'Milestone pace', tag: 'Cricsheet',
      tip: `The ${shownPace === 'bat' ? 'runs' : 'wickets'} landmarks, with the innings number, the month and the player's place among players of the same gender, format and competition by fewest innings (balls break a tie).`,
      control: bothSides ? (
        <span className="sw msw">
          {([['bat', 'Batting'], ['bowl', 'Bowling']] as const).map(([value, label]) => <button key={value} type="button" className={shownPace === value ? 'on' : undefined} onClick={() => setPaceSide(value)}>{label}</button>)}
        </span>
      ) : undefined,
      body: failed ? retryNote : rowsOfPace === null ? <TileLoader label="Milestone pace" /> : <PaceBody rows={rowsOfPace} side={shownPace} earlyCareer={firstYear !== null && firstYear < 2001} />,
    },
  );
  return <TileCarousel stale={busy.scope || busy.editions || busy.career} resetKey={playerId} instant={instant} name="Records" note="Click a stop to jump to it." tiles={tiles} />;
}
