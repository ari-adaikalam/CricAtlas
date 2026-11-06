'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { startBowlCore } from '@/data/views';
import { coreFor } from '@/data/coreCache';
import { loadPitch, type PitchData } from '@/data/pitch';
import { RingBody } from './RingTile';
import type { ReviewGroup } from '@/domain/reviews';
import { ReviewsBody } from './ReviewsTile';
import { WagonWheel } from './wagon/WagonWheel';
import { inShotChoice, shotOptions, topLabels } from '@/domain/shotFilter';
import { inRuns, WAGON_RUNS_DEFAULT, WAGON_RUNS_OPTIONS, type WagonRuns } from '@/domain/runsFilter';
import { type BowlShots } from '@/data/bowlTracking';
import { BowlControlSwitch, ControlBody, DismissalMapBody, FalseShotsBody, LandingBody, LandingSwitch, type BowlControlChoice, type LandingChoice } from './ControlTile';
import type { FalseShotInnings } from '@/domain/control';
import type { Shot } from '@/domain/shots';
import { type BowlBatters } from '@/data/bowlBatters';
import { BattersBody } from './BattersTile';
import type { OpponentCell, OpponentSort } from '@/domain/opponents';
import { OpponentPhasesBody, OpponentsBody } from './OpponentsTile';
import { OpponentSortSwitch } from './OpponentSort';
import { type BowlProgression } from '@/data/bowlProgression';
import { BowlProgressionBody } from './ProgressionTile';
import { lengthByPhase, type LengthCount } from '@/domain/bowling';
import { useChartColours } from './ChartColours';
import type { PhaseFormat } from '@/domain/phases';
import { type BowlDismissals } from '@/data/bowlDismissals';
import { DismissalsBody } from './DismissalsTile';
import { BowlPhasesBody } from './BowlPhasesTile';
import { ConcededBody, LengthMixBody } from './RunSourcesTile';
import type { BowlInningsLine } from '@/domain/form';
import { BowlFormBody, bowlFormTip } from './FormTile';
import type { BowlYearCounts } from '@/domain/seasons';
import { BowlSeasonsBody } from './SeasonsTile';
import { bowlingRates, oversOf, type BowlingSlice, type BowlSourceCounts } from '@/domain/bowling';
import { loadCombos, loadOpponents, type Opponent } from '@/data/scope';
import { DEFAULT_BALL_FILTERS, normaliseBall, options, type BallFilterKey, type BallFilters, type Combo } from '@/domain/ballFilters';
import type { SummaryRow } from '@/domain/batting';
import type { BowlingTotals } from '@/domain/bowling';
import type { PlayerFilters } from '@/domain/filters';
import { formatLabel } from '@/domain/labels';
import { BallFilterBar } from './BallFilterBar';
import { TileCarousel, type TileDef } from './TileCarousel';
import { EmptySlice, NoTracking, TileLoader } from './states/TileStates';
import { KeyGrid, type KeyCell } from './KeyGrid';
import { PITCH_RUNS_OPTIONS, type PitchRuns } from '@/domain/runsFilter';
import { PitchMap } from './wagon/PitchMap';

interface Props {
  playerId: string;
  rows: readonly SummaryRow[];
  filters: PlayerFilters;
  totals: BowlingTotals;
  /** A batter with a few overs: the sample is small and the note says so. */
  partTime: boolean;
  ball: BallFilters;
  onBall: (next: BallFilters) => void;
  onClear: () => void;
  /** The next player's data is still loading: every tile shows its loader and nothing is queried until it arrives, so the view stays where it is. */
  idle?: boolean;
  /** Changing player in the tiles style: the row is already in place and only its contents fade in (TileCarousel). */
  instant?: boolean;
}

const int = new Intl.NumberFormat('en');

const pct = (n: number): string => `${Math.round(n)}%`;
const one = (n: number): string => n.toFixed(1);
const two = (n: number): string => n.toFixed(2);
const whole = (n: number): string => int.format(Math.round(n));
/** The Key numbers cards for a slice, each with a stable id so a card keeps its place and counts when the filters change. */
function keyCells(slice: BowlingSlice, rates: ReturnType<typeof bowlingRates>, hundred: boolean): KeyCell[] {
  const num = (id: string, n: number | null, format: (n: number) => string, label: string): KeyCell => ({ id, value: { kind: 'num', n, format }, label });
  return [
    num('balls', slice.balls, hundred ? whole : (n) => oversOf(Math.round(n)), hundred ? 'balls bowled' : 'overs'),
    num('wickets', slice.wickets, whole, 'wickets'),
    num('average', rates.average, one, 'average'),
    num('economy', rates.economy, two, hundred ? 'economy per 5 balls' : 'economy'),
    num('bpw', rates.ballsPerWicket, one, 'balls per wicket'),
    num('dots', rates.dotShare, pct, 'dot balls'),
    num('boundaries', rates.boundaryShare, pct, 'balls hit for four or six'),
    rates.best ? { id: 'best', value: { kind: 'pair', a: rates.best.wickets, b: rates.best.runs, format: whole, join: '/' }, label: 'best figures' } : num('best', null, whole, 'best figures'),
    { id: 'five', wide: true, value: { kind: 'num', n: rates.fiveWickets, format: whole }, label: `five-wicket hauls in ${int.format(slice.innings)} innings bowled` },
    { id: 'extras', wide: true, value: { kind: 'num', n: slice.extras, format: whole }, label: 'wides and no-balls charged to the bowler' },
    { id: 'letOffs', wide: true, title: 'Counted in matches that have tracking', value: { kind: 'num', n: slice.letOffs, format: (n) => `${whole(n)} ${Math.round(n) === 1 ? 'let off' : 'let offs'}` }, label: `dropped catches off the bowling, worth ${int.format(slice.letOffRuns)} more runs` },
  ];
}

function activeLabels(filters: PlayerFilters, rows: readonly SummaryRow[]): string[] {
  const labels = [formatLabel(filters.format)];
  if (filters.competition) labels.push(rows.find((r) => r.tournament_key === filters.competition)?.tournament_name ?? filters.competition);
  if (filters.season) labels.push(filters.season);
  return labels;
}

/** The Bowling analysis view. Only the tiles built so far are listed. */
export function BowlingAnalysis({ playerId, rows, filters, partTime, ball, onBall, onClear, idle = false, instant = false }: Props) {
  // The counts for every combination of the ball filters, for this scope. They drive the greyed options and the ball count.
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const test = filters.format === 'TEST';
  const scopeKey = `${filters.format}|${filters.competition ?? ''}|${filters.season ?? ''}`;
  useEffect(() => {
    let cancelled = false;
    setCombos(null);
    if (idle) return;
    loadCombos(playerId, filters, 'bowl', ball)
      .then((loaded) => {
        if (cancelled) return;
        setCombos(loaded);
        const kept = normaliseBall(loaded, ball, test);
        if (kept !== ball) onBall(kept);
      })
      .catch((error: unknown) => console.error('Ball counts failed to load', playerId, error));
    return () => { cancelled = true; };
    // The counts depend on the scope and on the hand and opponent, which narrow the table. The other ball filters are read from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, scopeKey, ball.hand, ball.type, ball.opponent, idle]);

  // The opponents to choose from, under the same balls except for the opponent filter itself.
  const [opponents, setOpponents] = useState<Opponent[] | null>(null);
  const listKey = `${scopeKey}|${JSON.stringify({ ...ball, opponent: '' })}`;
  useEffect(() => {
    let cancelled = false;
    setOpponents(null);
    if (idle) return;
    loadOpponents(playerId, filters, 'bowl', ball)
      .then((loaded) => { if (!cancelled) setOpponents(loaded); })
      .catch((error: unknown) => console.error('Opponents failed to load', playerId, error));
    return () => { cancelled = true; };
    // filters and ball are read through listKey, which changes exactly when the list would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, listKey, idle]);

  const [runs, setRuns] = useState<PitchRuns>('all');
  // The totals behind Key numbers reload with the scope and every ball filter.
  const [slice, setSlice] = useState<BowlingSlice | null>(null);
  const [phases, setPhases] = useState<BowlSourceCounts[] | null>(null);
  const [innings, setInnings] = useState<BowlInningsLine[] | null>(null);
  const [seasons, setSeasons] = useState<BowlYearCounts[] | null>(null);
  const [dismissals, setDismissals] = useState<BowlDismissals | null>(null);
  const [cells, setCells] = useState<OpponentCell[] | null>(null);
  const [sort, setSort] = useState<OpponentSort>('balls');
  const [reviewGroups, setReviewGroups] = useState<ReviewGroup[] | null>(null);
  const [landing, setLanding] = useState<PitchData | null>(null);
  const [landingMode, setLandingMode] = useState<LandingChoice>('dots');
  const [ctlMode, setCtlMode] = useState<BowlControlChoice>('control');
  const [falseInnings, setFalseInnings] = useState<FalseShotInnings[] | null>(null);
  const [located, setLocated] = useState<Shot[] | null>(null);
  const [bowlShots, setBowlShots] = useState<BowlShots | null>(null);
  const [wagonHand, setWagonHand] = useState<'R' | 'L' | null>(null);
  const [wagonShot, setWagonShot] = useState('');
  const [wagonRuns, setWagonRuns] = useState<WagonRuns>(WAGON_RUNS_DEFAULT);
  const [batters, setBatters] = useState<BowlBatters | null>(null);
  const [progression, setProgression] = useState<BowlProgression | null>(null);
  const [lengths, setLengths] = useState<{ rows: LengthCount[]; bowled: number } | null>(null);
  const colours = useChartColours();
  const sliceKey = `${scopeKey}|${JSON.stringify(ball)}`;
  const shownFor = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  // The player whose answers have all arrived once: only then is there something old to dim while a filter change loads. A first open has none, and each tile shows its own loader.
  const answered = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    // A filter change for the same player keeps the last answers on screen, dimmed, until the new ones arrive. Another player's are cleared.
    const same = shownFor.current === playerId; shownFor.current = playerId;
    if (!same) {
      setSlice(null); setPhases(null); setInnings(null); setSeasons(null); setDismissals(null); setLengths(null); setProgression(null); setBatters(null); setCells(null); setLanding(null); setReviewGroups(null); setFalseInnings(null); setLocated(null); setBowlShots(null);
    }
    setPending(!idle && answered.current === playerId);
    if (idle) return;
    // Each tile fills in as soon as its own data is ready: the recorded answers at once, the per-ball ones when the engine has them.
    const core = coreFor(`bowl|${playerId}|${sliceKey}`, () => startBowlCore(playerId, filters, ball));
    const put = <T,>(promise: Promise<T>, apply: (value: T) => void): Promise<void> => promise.then((value) => { if (!cancelled) apply(value); });
    Promise.all([put(core.reviews, setReviewGroups), put(core.landing, setLanding), put(core.falseInnings, setFalseInnings), put(core.located, setLocated), put(core.shots, setBowlShots), put(core.cells, setCells), put(core.progression, setProgression), put(core.batters, setBatters), put(core.slice, setSlice), put(core.phases, setPhases), put(core.innings, setInnings), put(core.seasons, setSeasons), put(core.dismissals, setDismissals), put(core.lengths, setLengths)])
      .then(() => { if (!cancelled) { answered.current = playerId; setPending(false); } })
      .catch((error: unknown) => console.error('Bowling numbers failed to load', playerId, error));
    return () => { cancelled = true; };
    // filters and ball are read through sliceKey, which changes exactly when the query would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, sliceKey, idle]);
  // The Hundred counts balls and an over of five. A scope with its balls only (the Powerplay and Rest of innings phases, no Middle or Death) is the Hundred.
  const hundred = !!combos && combos.some((c) => c.phase === 'rest') && !combos.some((c) => c.phase === 'middle' || c.phase === 'death');
  const rates = slice ? bowlingRates(slice, hundred ? 5 : 6) : null;
  const [pitch, setPitch] = useState<PitchData | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = `${scopeKey}|${JSON.stringify(ball)}|${runs}`;
  useEffect(() => {
    let cancelled = false;
    setPitch(null); setFailed(false);
    if (idle) return;
    loadPitch(playerId, filters, ball, runs)
      .then((loaded) => { if (!cancelled) setPitch(loaded); })
      .catch((error: unknown) => { console.error('Pitch map failed to load', playerId, error); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // filters and ball are read through key, which changes exactly when the query would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, key, retry, idle]);

  const ballLabels = (Object.keys(DEFAULT_BALL_FILTERS) as BallFilterKey[]).filter((k) => ball[k] !== DEFAULT_BALL_FILTERS[k]).map((k) => (k === 'opponent' ? (opponents?.find((o) => o.id === ball.opponent)?.name ?? 'One batter') : options(k, 'bowl', test).find((o) => o.value === ball[k])?.label ?? ball[k]));
  const labels = [...activeLabels(filters, rows), ...ballLabels, ...(runs === 'all' ? [] : [PITCH_RUNS_OPTIONS.find((o) => o.value === runs)?.label ?? runs])];
  const dirty = Boolean(filters.competition || filters.season) || ballLabels.length > 0 || runs !== 'all' || (wagonRuns !== 'all' && wagonRuns !== WAGON_RUNS_DEFAULT);
  const clear = dirty ? () => { setRuns('all'); setWagonRuns('all'); onClear(); } : undefined;
  const format: PhaseFormat = test ? 'test' : filters.format === 'ODI' ? 'odi' : 't20';

  // The wagon wheel shows the batters of one hand at a time (a left-hander's shots are drawn on the true ground, with the zone names mirrored). It opens on the hand
  // the bowler bowled to most, and the Shot choice is one of the nine most common labels, Other shots, or all.
  const handShots = bowlShots ? { R: bowlShots.right, L: bowlShots.left } : null;
  const shownHand: 'R' | 'L' = wagonHand ?? (handShots && handShots.L.length > handShots.R.length ? 'L' : 'R');
  const handList = handShots ? handShots[shownHand] : null;
  const wagonTop = useMemo(() => topLabels(Object.entries((handList ?? []).reduce<Record<string, number>>((m, x) => (x.shot ? { ...m, [x.shot]: (m[x.shot] ?? 0) + 1 } : m), {})).map(([shot, balls]) => ({ shot, balls }))), [handList]);
  const wagonOptions = useMemo(() => (handList ? shotOptions(wagonTop, handList) : []), [handList, wagonTop]);
  const wagonChoice = wagonOptions.some((o) => o.value === wagonShot) ? wagonShot : '';
  const wagonShown = useMemo(() => handList && inRuns(inShotChoice(handList, wagonChoice, wagonTop), wagonRuns), [handList, wagonChoice, wagonTop, wagonRuns]);

  const tiles: TileDef[] = [
    {
      id: 'key', label: 'Key numbers', group: 'Summary', title: 'Key numbers', tag: 'Cricsheet',
      tip: 'Totals for the current filters.',
      body: slice !== null && rates !== null && slice.balls === 0 ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div> : (
        <KeyGrid label="Key numbers" cells={slice === null || rates === null ? null : keyCells(slice, rates, hundred)} />
      ),
    },
    {
      id: 'form', label: 'Form', group: 'Summary', title: 'Form', tag: 'Cricsheet', tip: bowlFormTip(innings?.length ?? 30, hundred),
      body: innings === null ? <TileLoader label="Form" /> : innings.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <BowlFormBody innings={innings} hundred={hundred} onClear={clear} />,
    },
    {
      id: 'seasons', label: 'By season', group: 'Summary', title: 'By season', tag: 'Cricsheet',
      tip: 'Wickets (bars) and economy (line) in each year.',
      body: seasons === null ? <TileLoader label="By season" /> : seasons.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <BowlSeasonsBody rows={seasons} hundred={hundred} />,
    },
    {
      id: 'progression', label: 'Progression', group: 'Innings', title: 'Progression', tag: 'Cricsheet',
      tip: 'Economy by balls bowled in an innings (the line is the typical innings, the band the middle half) and the chance of a wicket in each stretch.',
      body: progression === null ? <TileLoader label="Progression" /> : progression.balls.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <BowlProgressionBody data={progression} hundred={hundred} />,
    },
    {
      id: 'phases', label: 'Phases', group: 'Innings', title: 'Phases', tag: 'Cricsheet',
      tip: test
        ? 'Economy, wickets and other numbers by band of 20 overs. The data has no sessions.'
        : 'Economy, wickets and other numbers in each phase.',
      body: phases === null ? <TileLoader label="Phases" /> : phases.every((p) => p.balls === 0)
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <BowlPhasesBody rows={phases} format={format} hundred={hundred} />,
    },
    {
      id: 'conceded', label: 'Runs by type', group: 'Innings', title: 'Runs by type', tag: 'Cricsheet',
      tip: test
        ? 'Share of runs conceded from singles to sixes and extras (wides, no balls), overall and by band of 20 overs. Byes and leg byes are not charged to the bowler.'
        : 'Share of runs conceded from singles to sixes and extras (wides, no balls), overall and in each phase. Byes and leg byes are not charged to the bowler.',
      body: phases === null ? <TileLoader label="Runs by type" /> : phases.every((p) => p.balls === 0)
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <ConcededBody rows={phases} format={format} />,
    },
    {
      id: 'batters', label: 'Batter types', group: 'Against', title: 'Batter types', tag: 'Cricsheet',
      tip: 'Results against right-hand and left-hand batters, and against openers, top order, middle order and tail.',
      body: batters === null ? <TileLoader label="Batter types" /> : batters.hand.every((r) => r.balls === 0)
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <BattersBody data={batters} hundred={hundred} />,
    },
    {
      id: 'opponents', label: 'Batters faced', group: 'Against', title: 'Batters faced', tag: 'Cricsheet', wide: true, control: <OpponentSortSwitch view="bowl" value={sort} onChange={setSort} />,
      tip: 'Every batter bowled to: balls, runs, wickets, average, economy, dot ball share and control.',
      body: cells === null ? <TileLoader label="Batters faced" /> : cells.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <OpponentsBody cells={cells} view="bowl" test={test} hundred={hundred} chosen={ball.opponent} sort={sort} onPick={(id) => onBall({ ...ball, opponent: id })} onShowAll={() => onBall({ ...ball, opponent: '' })} />,
    },
    {
      id: 'opphase', label: 'Vs batters by phase', group: 'Against', title: 'Vs batters by phase', tag: 'Cricsheet', wide: true,
      tip: 'Economy and wickets against each batter in each phase (20 over bands in Tests).',
      body: cells === null ? <TileLoader label="Vs batters by phase" /> : cells.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <OpponentPhasesBody cells={cells} view="bowl" test={test} hundred={hundred} format={format} chosen={ball.opponent} onPick={(id) => onBall({ ...ball, opponent: id })} onShowAll={() => onBall({ ...ball, opponent: '' })} />,
    },
    {
      id: 'pitch', label: 'Pitch map', group: 'Landing', title: 'Pitch map', tag: 'Tracking', wide: true,
      control: (
        <label className="shf"><span>Runs</span>
          <select aria-label="Runs" value={runs} onChange={(e) => setRuns(e.target.value as PitchRuns)}>
            {PITCH_RUNS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      ),
      tip: 'Where deliveries landed, by length and line, with the results for each length.',
      body: failed
        ? <p className="thin">The pitch map could not be loaded. <button type="button" className="mini" onClick={() => setRetry((n) => n + 1)}>Try again</button></p>
        : pitch !== null && pitch.bowled > 0 && pitch.tracked === 0 ? <div className="art"><NoTracking /></div>
        : <div className="art"><PitchMap owner={playerId} rows={pitch?.rows ?? null} tracked={pitch?.tracked ?? 0} bowled={pitch?.bowled ?? 0} runs={runs} onRuns={setRuns} filters={labels} onClear={clear} /></div>,
    },
    {
      id: 'lengthphase', label: 'Length by phase', group: 'Landing', title: 'Length by phase', tag: 'Tracking',
      tip: test
        ? 'Mix of lengths in each band of 20 overs and overall, as shares of balls with a tracked length.'
        : 'Mix of lengths in each phase and overall, as shares of balls with a tracked length.',
      body: lengths === null ? <TileLoader label="Length by phase" />
        : lengths.bowled > 0 && lengths.rows.length === 0 ? <div className="art"><NoTracking /></div>
        : lengths.rows.length === 0 ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <LengthMixBody sources={lengthByPhase(lengths.rows, format, hundred, colours)} note={[`Based on ${int.format(lengths.rows.reduce((a, r) => a + r.n, 0))} of ${int.format(lengths.bowled)} balls with a length`].filter(Boolean).join('. ')} />,
    },
    {
      id: 'landing', label: 'Line and length', group: 'Landing', title: 'Line and length results', tag: 'Tracking', control: <LandingSwitch value={landingMode} onChange={setLandingMode} />,
      tip: 'Dot ball share, four or six share, or runs per ball for each line and length, as the batter sees it.',
      body: landing === null ? <TileLoader label="Line and length results" /> : landing.bowled > 0 && landing.tracked === 0 ? <div className="art"><NoTracking /></div>
        : landing.rows.length === 0 ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <LandingBody rows={landing.rows} mode={landingMode} test={test} />,
    },
    {
      id: 'control', label: 'Batter control', group: 'Landing', title: 'Batter control', tag: 'Tracking', control: <BowlControlSwitch value={ctlMode} onChange={setCtlMode} />,
      tip: 'How often batters were in control against this bowler, by line and length, or the share of false shots by innings.',
      body: landing === null || falseInnings === null ? <TileLoader label="Batter control" /> : landing.bowled > 0 && landing.tracked === 0 ? <div className="art"><NoTracking /></div>
        : landing.bowled === 0 ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : ctlMode === 'false' ? <FalseShotsBody innings={falseInnings} />
        : <ControlBody rows={landing.rows.filter((r) => r.controlKnown > 0).map((r) => ({ length: r.length, line: r.line, known: r.controlKnown, inControl: r.inControl }))} hand="R" test={test} />,
    },
    {
      id: 'wagon', label: 'Wagon wheel', group: 'Hit', title: 'Wagon wheel', tag: 'Tracking',
      control: (
        <>
          <label className="shf"><span>Batter hand</span>
            <select aria-label="Batter hand" value={shownHand} onChange={(e) => { setWagonHand(e.target.value as 'R' | 'L'); setWagonShot(''); }}>
              <option value="R">Right-handers</option><option value="L">Left-handers</option>
            </select>
          </label>
          <label className="shf"><span>Shot</span>
            <select aria-label="Shot" value={wagonChoice} onChange={(e) => setWagonShot(e.target.value)}>
              {wagonOptions.length === 0 ? <option value="">All shots</option> : wagonOptions.map((o) => <option key={o.value} value={o.value} disabled={o.count === 0 && o.value !== wagonChoice}>{o.label}{o.count === 0 && o.value !== '' ? ' (no shots)' : ''}</option>)}
            </select>
          </label>
          <label className="shf"><span>Runs</span>
            <select aria-label="Runs" value={wagonRuns} onChange={(e) => setWagonRuns(e.target.value as WagonRuns)}>
              {WAGON_RUNS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </>
      ),
      tip: `Where batters scored off this bowler, from above, shown for ${shownHand === 'L' ? 'left' : 'right'}-handers.`,
      body: bowlShots === null ? <TileLoader label="Wagon wheel" /> : bowlShots.right.length + bowlShots.left.length === 0
        ? <div className="art">{slice?.balls === 0 ? <EmptySlice filters={labels} onClear={clear} /> : <NoTracking />}</div>
        : <div className="art"><WagonWheel owner={playerId} shots={wagonShown} hand={shownHand} label={`Wagon wheel of ${wagonShown?.length ?? 0} shots against this bowling`} runs={wagonRuns} onRuns={setWagonRuns} coverage={`Based on ${int.format(bowlShots.right.length + bowlShots.left.length)} of ${int.format(bowlShots.scoring)} scoring shots and wickets`} filters={labels} onClear={clear} /></div>,
    },
    {
      id: 'ring', label: 'Ring', group: 'Hit', title: 'Runs conceded in the ring', tag: 'Tracking',
      tip: 'Runs conceded inside the 30 yard ring, from the ring to halfway, from halfway to the boundary, and beyond it.',
      body: located === null ? <TileLoader label="Runs conceded in the ring" /> : located.length === 0 ? <div className="art">{slice?.balls === 0 ? <EmptySlice filters={labels} onClear={clear} /> : <NoTracking />}</div> : <RingBody balls={located} />,
    },
    {
      id: 'outmap', label: 'Dismissal map', group: 'Wickets', title: 'Dismissal map', tag: 'Tracking',
      tip: 'Where the wickets came, by line and length.',
      body: landing === null || slice === null ? <TileLoader label="Dismissal map" /> : slice.wickets === 0 ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : landing.rows.every((r) => r.wickets === 0) ? <div className="art"><NoTracking /></div>
        : <DismissalMapBody rows={landing.rows.map((r) => ({ length: r.length, line: r.line, outs: r.wickets }))} all={slice.wickets} hand="R" noun="wickets" />,
    },
    {
      id: 'dismissals', label: 'Dismissal types', group: 'Wickets', title: 'Dismissal types', tag: 'Cricsheet',
      tip: 'How the bowler takes wickets, the shot the batter played, and the balls or runs the batter had.',
      body: dismissals === null ? <TileLoader label="Dismissal types" /> : dismissals.types.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <DismissalsBody data={dismissals} kind="bowl" />,
    },
    {
      id: 'reviews', label: 'Reviews', group: 'Wickets', title: 'Reviews', tag: 'Cricsheet',
      tip: 'Reviews on this bowler\'s deliveries.',
      body: reviewGroups === null ? <TileLoader label="Reviews" /> : <ReviewsBody groups={reviewGroups} />,
    },
  ];

  return (
    <>
      <BallFilterBar view="bowl" test={test} combos={combos} opponents={opponents} styleCounts={null} value={ball} onChange={onBall} totals={slice === null ? null : slice.balls > 0 ? `${int.format(slice.wickets)} ${slice.wickets === 1 ? 'wicket' : 'wickets'}, avg ${rates?.average != null ? rates.average.toFixed(1) : '-'}` : '- wickets, avg -'} />
      <TileCarousel stale={pending} resetKey={playerId} instant={instant} name="Bowling analysis" note={partTime ? 'Part-time bowler, so the sample is small. Read with care. The filters above apply to every tile.' : 'The filters above apply to every tile.'} tiles={tiles} />
    </>
  );
}
