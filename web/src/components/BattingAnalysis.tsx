'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { startBatCore } from '@/data/views';
import { coreFor } from '@/data/coreCache';
import type { Player } from '@/data/player';
import { type BattingSlice } from '@/data/profile';
import type { YearCounts } from '@/domain/seasons';
import { SeasonsBody } from './SeasonsTile';
import type { InningsLine } from '@/domain/form';
import { FormBody, formTip } from './FormTile';
import type { PhaseCounts, PhaseFormat } from '@/domain/phases';
import { loadCombos, loadOpponents, loadStyleCounts, type Opponent } from '@/data/scope';
import { RingBody } from './RingTile';
import type { ControlRow, FalseShotInnings } from '@/domain/control';
import { ControlBody, DismissalMapBody, FalseShotsBody } from './ControlTile';
import { sliceRates, type SummaryRow } from '@/domain/batting';
import { DEFAULT_BALL_FILTERS, normaliseBall, options, type BallFilterKey, type BallFilters, type Combo } from '@/domain/ballFilters';
import type { PlayerFilters } from '@/domain/filters';
import { formatLabel } from '@/domain/labels';
import { inRuns, WAGON_RUNS_DEFAULT, WAGON_RUNS_OPTIONS, type WagonRuns } from '@/domain/runsFilter';
import { inRing, inShotChoice, RING_OPTIONS, sentence, shotOptions, topLabels, type Ring } from '@/domain/shotFilter';
import { handOf, type Shot } from '@/domain/shots';
import { BallFilterBar } from './BallFilterBar';
import { typeOptions } from '@/domain/bowlerType';
import { type BatProgression } from '@/data/batProgression';
import { BatProgressionBody } from './ProgressionTile';
import type { ShotMixCell } from '@/domain/shotMix';
import { ShotMixBody, ShotMixSwitch, type ShotMixMode } from './ShotMixTile';
import type { ShotTypeCounts } from '@/domain/bowlerType';
import { ShotsByTypeBody, ShotsByTypeSwitch, type ShotsByTypeMode } from './ShotsByTypeTile';
import type { TypeCounts } from '@/domain/bowlerType';
import { BowlerTypeBody } from './BowlerTypeTile';
import type { OpponentCell, OpponentSort } from '@/domain/opponents';
import { OpponentPhasesBody, OpponentsBody } from './OpponentsTile';
import { OpponentSortSwitch } from './OpponentSort';
import type { ReviewGroup } from '@/domain/reviews';
import { ReviewsBody } from './ReviewsTile';
import type { DismissalData } from '@/data/bowlDismissals';
import { DismissalsBody } from './DismissalsTile';
import { PhasesBody } from './PhasesTile';
import { RunSourcesBody } from './RunSourcesTile';
import { TileCarousel, type TileDef } from './TileCarousel';
import { WagonWheel } from './wagon/WagonWheel';
import { EmptySlice, NoTracking, TileLoader } from './states/TileStates';
import { KeyGrid, type KeyCell } from './KeyGrid';

interface Props {
  playerId: string;
  player: Player;
  rows: readonly SummaryRow[];
  filters: PlayerFilters;
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
const whole = (n: number): string => int.format(Math.round(n));
/** The Key numbers cards for a slice, each with a stable id so a card keeps its place and counts when the filters change. */
function keyCells(slice: BattingSlice, rates: ReturnType<typeof sliceRates>): KeyCell[] {
  const num = (id: string, n: number | null, format: (n: number) => string, label: string): KeyCell => ({ id, value: { kind: 'num', n, format }, label });
  return [
    num('runs', slice.runs, whole, 'runs'),
    num('average', rates.average, one, 'average'),
    num('sr', rates.strikeRate, one, 'strike rate'),
    num('innings', slice.innings, whole, 'innings'),
    num('dots', rates.dotShare, pct, 'dot balls'),
    num('boundaries', rates.boundaryShare, pct, 'balls hit for four or six'),
    num('control', rates.controlShare, pct, 'in control'),
    { id: 'milestones', value: { kind: 'pair', a: slice.hundreds, b: slice.fifties, format: whole }, label: '100s / 50s' },
    ...(slice.mostRuns ? [{ id: 'mostRuns', wide: true, value: { kind: 'text', text: sentence(slice.mostRuns.shot) } as const, label: `most runs from one shot, ${int.format(slice.mostRuns.runs)}` }] : []),
    ...(slice.mostOut ? [{ id: 'mostOut', wide: true, value: { kind: 'text', text: sentence(slice.mostOut.shot) } as const, label: `out playing it most, ${slice.mostOut.outs} times` }] : []),
    { id: 'letOffs', wide: true, title: 'Counted in matches that have tracking', value: { kind: 'num', n: slice.letOffs, format: (n) => `${whole(n)} ${Math.round(n) === 1 ? 'let off' : 'let offs'}` }, label: `dropped catches and chances, worth ${int.format(slice.letOffRuns)} more runs` },
  ];
}

/** Names the filters that are set, for the empty state. */
function activeLabels(filters: PlayerFilters, rows: readonly SummaryRow[]): string[] {
  const labels = [formatLabel(filters.format)];
  if (filters.competition) labels.push(rows.find((r) => r.tournament_key === filters.competition)?.tournament_name ?? filters.competition);
  if (filters.season) labels.push(filters.season);
  return labels;
}

/** The Batting analysis view: its filter row and tiles in the order of the player page. Only the tiles built so far are listed. */
export function BattingAnalysis({ playerId, player, rows, filters, ball, onBall, onClear, idle = false, instant = false }: Props) {
  // The counts for every combination of the ball filters, for this scope. They drive the greyed options and the ball count.
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const test = filters.format === 'TEST';
  const scopeKey = `${filters.format}|${filters.competition ?? ''}|${filters.season ?? ''}`;
  useEffect(() => {
    let cancelled = false;
    setCombos(null);
    if (idle) return;
    loadCombos(playerId, filters, 'bat', ball)
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

  // Balls by first bowling style, for the Bowler type options. They follow every other filter.
  const [styleCounts, setStyleCounts] = useState<Map<string, number> | null>(null);
  const styleKey = `${scopeKey}|${JSON.stringify({ ...ball, type: 'all' })}`;
  useEffect(() => {
    let cancelled = false;
    setStyleCounts(null);
    if (idle) return;
    loadStyleCounts(playerId, filters, ball)
      .then((loaded) => { if (!cancelled) setStyleCounts(loaded); })
      .catch((error: unknown) => console.error('Bowler styles failed to load', playerId, error));
    return () => { cancelled = true; };
    // filters and ball are read through styleKey, which changes exactly when the counts would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, styleKey, idle]);

  // The opponents to choose from, under the same balls except for the opponent filter itself.
  const [opponents, setOpponents] = useState<Opponent[] | null>(null);
  const listKey = `${scopeKey}|${JSON.stringify({ ...ball, opponent: '' })}`;
  useEffect(() => {
    let cancelled = false;
    setOpponents(null);
    if (idle) return;
    loadOpponents(playerId, filters, 'bat', ball)
      .then((loaded) => { if (!cancelled) setOpponents(loaded); })
      .catch((error: unknown) => console.error('Opponents failed to load', playerId, error));
    return () => { cancelled = true; };
    // filters and ball are read through listKey, which changes exactly when the list would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, listKey, idle]);

  // Shots and shot numbers reload when the scope or any ball filter changes. null means loading.
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [slice, setSlice] = useState<BattingSlice | null>(null);
  const [phases, setPhases] = useState<PhaseCounts[] | null>(null);
  const [innings, setInnings] = useState<InningsLine[] | null>(null);
  const [seasons, setSeasons] = useState<YearCounts[] | null>(null);
  const [dismissals, setDismissals] = useState<DismissalData | null>(null);
  const [cells, setCells] = useState<OpponentCell[] | null>(null);
  const [progression, setProgression] = useState<BatProgression | null>(null);
  const [typeCounts, setTypeCounts] = useState<TypeCounts[] | null>(null);
  const [shotTypes, setShotTypes] = useState<ShotTypeCounts[] | null>(null);
  const [mix, setMix] = useState<ShotMixCell[] | null>(null);
  const [located, setLocated] = useState<Shot[] | null>(null);
  const [outMap, setOutMap] = useState<{ rows: Array<{ length: string; line: string; outs: number }>; all: number } | null>(null);
  const [controlRows, setControlRows] = useState<ControlRow[] | null>(null);
  const [falseInnings, setFalseInnings] = useState<FalseShotInnings[] | null>(null);
  const [reviewGroups, setReviewGroups] = useState<ReviewGroup[] | null>(null);
  const [mixMode, setMixMode] = useState<ShotMixMode>('career');
  const [stpMode, setStpMode] = useState<ShotsByTypeMode>('share');
  const [sort, setSort] = useState<OpponentSort>('balls');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = `${scopeKey}|${JSON.stringify(ball)}`;
  const shownFor = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  // The player whose answers have all arrived once: only then is there something old to dim while a filter change loads. A first open has none, and each tile shows its own loader.
  const answered = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    // A filter change for the same player keeps the last answers on screen, dimmed, until the new ones arrive. Another player's are cleared.
    const same = shownFor.current === playerId; shownFor.current = playerId;
    if (!same) {
      setShots(null); setSlice(null); setPhases(null); setInnings(null); setSeasons(null); setDismissals(null); setCells(null); setProgression(null); setTypeCounts(null); setShotTypes(null); setMix(null); setLocated(null); setControlRows(null); setFalseInnings(null); setOutMap(null); setReviewGroups(null); setFailed(false);
    }
    setPending(!idle && answered.current === playerId);
    if (idle) return;
    // Each tile fills in as soon as its own data is ready: the recorded answers at once, the per-ball ones when the engine has them.
    const core = coreFor(`bat|${playerId}|${key}`, () => startBatCore(playerId, filters, ball));
    const put = <T,>(promise: Promise<T>, apply: (value: T) => void): Promise<void> => promise.then((value) => { if (!cancelled) apply(value); });
    Promise.all([put(core.reviews, setReviewGroups), put(core.outMap, setOutMap), put(core.control, setControlRows), put(core.falseInnings, setFalseInnings), put(core.located, setLocated), put(core.types, setTypeCounts), put(core.shotTypes, setShotTypes), put(core.mix, setMix), put(core.cells, setCells), put(core.progression, setProgression), put(core.shots, setShots), put(core.slice, setSlice), put(core.phases, setPhases), put(core.innings, setInnings), put(core.seasons, setSeasons), put(core.dismissals, setDismissals)])
      .then(() => { if (!cancelled) { answered.current = playerId; setPending(false); } })
      .catch((error: unknown) => { console.error('Shots failed to load', playerId, error); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // filters and ball are read through key, which changes exactly when the queries would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, key, retry, idle]);

  // The Shot choice is one setting shared by the wagon wheel and the Sixes tile. Where the ball went is the wagon wheel's own.
  const [shotChoice, setShotChoice] = useState('');
  const [ring, setRing] = useState<Ring>('any');
  // The wagon wheel opens on fours. Its legend sets this too.
  const [runs, setRuns] = useState<WagonRuns>(WAGON_RUNS_DEFAULT);
  const top = useMemo(() => topLabels(slice?.shotBalls ?? []), [slice]);
  const options_ = useMemo(() => (shots ? shotOptions(top, shots) : []), [top, shots]);
  // A choice the new scope no longer lists goes back to All shots.
  const choice = options_.some((o) => o.value === shotChoice) || options_.length === 0 ? shotChoice : '';
  const shotShots = useMemo(() => shots && inShotChoice(shots, choice, top), [shots, choice, top]);
  const shown = useMemo(() => shotShots && inRuns(inRing(shotShots, ring), runs), [shotShots, ring, runs]);
  const hand = handOf(player['batting style']);

  const ballLabels = (Object.keys(DEFAULT_BALL_FILTERS) as BallFilterKey[]).filter((k) => ball[k] !== DEFAULT_BALL_FILTERS[k]).map((k) => (k === 'type' ? (typeOptions(null).find((o) => o.value === ball.type)?.label ?? ball.type) : k === 'opponent' ? (opponents?.find((o) => o.id === ball.opponent)?.name ?? 'One bowler') : options(k, 'bat', test).find((o) => o.value === ball[k])?.label ?? ball[k]));
  const choiceLabel = options_.find((o) => o.value === choice)?.label;
  const ringLabel = RING_OPTIONS.find((o) => o.value === ring)?.label;
  const labels = [...activeLabels(filters, rows), ...ballLabels, ...(choiceLabel && choice ? [choiceLabel] : []), ...(ring !== 'any' && ringLabel ? [ringLabel] : [])]
  const wagonLabels = runs === 'all' ? labels : [...labels, WAGON_RUNS_OPTIONS.find((o) => o.value === runs)?.label ?? runs];
  // The empty state offers Clear filters only when something is set, so the button never does nothing.
  const dirty = Boolean(filters.competition || filters.season) || ballLabels.length > 0 || Boolean(choice) || ring !== 'any' || (runs !== 'all' && runs !== WAGON_RUNS_DEFAULT);
  const clear = dirty ? () => { setShotChoice(''); setRing('any'); setRuns('all'); onClear(); } : undefined;
  const shotSelect = (
    <label className="shf"><span>Shot</span>
      <select aria-label="Shot" value={choice} onChange={(e) => setShotChoice(e.target.value)}>
        {options_.length === 0 ? <option value="">All shots</option> : options_.map((o) => <option key={o.value} value={o.value} disabled={o.count === 0 && o.value !== choice}>{o.label}{o.count === 0 && o.value !== '' ? ' (no shots)' : ''}</option>)}
      </select>
    </label>
  );
  const ringSelect = (
    <label className="shf"><span>Ball went</span>
      <select aria-label="Ball went" value={ring} onChange={(e) => setRing(e.target.value as Ring)}>
        {RING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  const runsSelect = (
    <label className="shf"><span>Runs</span>
      <select aria-label="Runs" value={runs} onChange={(e) => setRuns(e.target.value as WagonRuns)}>
        {WAGON_RUNS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  // Under a tile's title it says which filters narrowed it.
  const retryNote = <p className="thin">Shots could not be loaded. <button type="button" className="mini" onClick={() => setRetry((n) => n + 1)}>Try again</button></p>;
  const rates = slice ? sliceRates(slice) : null;
  const format: PhaseFormat = test ? 'test' : filters.format === 'ODI' ? 'odi' : 't20';
  // Balls are there but none has a position: say so, since an empty chart would blame the filters.
  const noTrackingWagon = shots !== null && slice !== null && slice.scoring > 0 && shots.length === 0;

  const tiles: TileDef[] = [
    {
      id: 'key', label: 'Key numbers', group: 'Summary', title: 'Key numbers', tag: 'Cricsheet', tip: 'Totals for the current filters.',
      body: slice !== null && rates !== null && slice.balls === 0 ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div> : (
        <KeyGrid label="Key numbers" cells={slice === null || rates === null ? null : keyCells(slice, rates)} />
      ),
    },
    {
      id: 'form', label: 'Form', group: 'Summary', title: 'Form', tag: 'Cricsheet', tip: formTip(innings?.length ?? 30),
      body: failed ? retryNote : innings === null ? <TileLoader label="Form" /> : innings.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <FormBody innings={innings} onClear={clear} />,
    },
    {
      id: 'seasons', label: 'By season', group: 'Summary', title: 'By season', tag: 'Cricsheet',
      tip: 'Runs (bars) and strike rate (line) in each year.',
      body: failed ? retryNote : seasons === null ? <TileLoader label="By season" /> : seasons.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <SeasonsBody rows={seasons} />,
    },
    {
      id: 'progression', label: 'Progression', group: 'Innings', title: 'Innings progression', tag: 'Cricsheet',
      tip: 'Strike rate by balls faced.',
      body: failed ? retryNote : progression === null ? <TileLoader label="Innings progression" /> : progression.balls.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <BatProgressionBody data={progression} />,
    },
    {
      id: 'phases', label: 'Phases', group: 'Innings', title: 'Phases', tag: 'Cricsheet',
      tip: test
        ? 'Strike rate and other numbers by band of 20 overs. The data has no sessions.'
        : 'Strike rate and other numbers in each phase.',
      body: failed ? retryNote : phases === null ? <TileLoader label="Phases" /> : phases.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <PhasesBody rows={phases} format={format} />,
    },
    {
      id: 'sources', label: 'Run sources', group: 'Innings', title: 'Run sources', tag: 'Cricsheet',
      tip: test
        ? 'The share of runs from singles, twos, threes, fours and sixes, overall and by band of 20 overs.'
        : 'The share of runs from singles, twos, threes, fours and sixes, overall and in each phase.',
      body: failed ? retryNote : phases === null ? <TileLoader label="Run sources" /> : phases.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <RunSourcesBody rows={phases} format={format} />,
    },
    {
      id: 'bowlertype', label: 'Bowler type', group: 'Against', title: 'Against each bowler type', tag: 'Cricsheet', wide: true,
      tip: 'Strike rate against each bowler type, next to the rate against all bowlers.',
      body: failed ? retryNote : typeCounts === null ? <TileLoader label="Against each bowler type" /> : typeCounts.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <BowlerTypeBody counts={typeCounts} />,
    },
    {
      id: 'shotsbytype', label: 'Shots vs bowler type', group: 'Against', title: 'Shots vs bowler type', tag: 'Tracking', wide: true, control: <ShotsByTypeSwitch value={stpMode} onChange={setStpMode} />,
      tip: 'How often each shot was played against each bowler type, or its strike rate.',
      body: failed ? retryNote : shotTypes === null ? <TileLoader label="Shots vs bowler type" /> : shotTypes.length === 0
        ? <div className="art"><NoTracking /></div>
        : <ShotsByTypeBody counts={shotTypes} mode={stpMode} test={test} />,
    },
    {
      id: 'opponents', label: 'Bowlers', group: 'Against', title: 'Bowlers', tag: 'Cricsheet', wide: true, control: <OpponentSortSwitch view="bat" value={sort} onChange={setSort} />,
      tip: 'Every bowler faced: balls, runs, dismissals, average, strike rate, dot ball share and control.',
      body: failed ? retryNote : cells === null ? <TileLoader label="Bowlers" /> : cells.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <OpponentsBody cells={cells} view="bat" test={test} hundred={false} chosen={ball.opponent} sort={sort} onPick={(id) => onBall({ ...ball, opponent: id, type: 'all' })} onShowAll={() => onBall({ ...ball, opponent: '' })} />,
    },
    {
      id: 'opphase', label: 'Vs bowlers by phase', group: 'Against', title: 'Vs bowlers by phase', tag: 'Cricsheet', wide: true,
      tip: 'Strike rate and dismissals against each bowler in each phase (20 over bands in Tests).',
      body: failed ? retryNote : cells === null ? <TileLoader label="Vs bowlers by phase" /> : cells.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <OpponentPhasesBody cells={cells} view="bat" test={test} hundred={false} format={format} chosen={ball.opponent} onPick={(id) => onBall({ ...ball, opponent: id, type: 'all' })} onShowAll={() => onBall({ ...ball, opponent: '' })} />,
    },
    {
      id: 'mix', label: 'Shot mix', group: 'Shots', title: 'Shot mix', tag: 'Tracking', wide: true, control: ball.phase === 'all' ? <ShotMixSwitch value={mixMode} onChange={setMixMode} /> : undefined,
      tip: 'Each shot played: balls, runs, strike rate, control and dismissals.',
      body: failed ? retryNote : mix === null ? <TileLoader label="Shot mix" /> : mix.length === 0
        ? <div className="art"><NoTracking /></div>
        : <ShotMixBody cells={mix} mode={ball.phase === 'all' ? mixMode : 'career'} format={format} />,
    },
    {
      id: 'ring', label: 'Ring', group: 'Shots', title: 'Scoring in the ring', tag: 'Tracking',
      tip: 'Runs inside the 30 yard ring, from the ring to halfway, from halfway to the boundary, and beyond it.',
      body: failed ? retryNote : located === null ? <TileLoader label="Scoring in the ring" /> : located.length === 0
        ? <div className="art"><NoTracking /></div>
        : <RingBody balls={located} />,
    },
    {
      id: 'wagon', label: 'Wagon wheel', group: 'Shots', title: 'Wagon wheel', tag: 'Tracking', control: <>{shotSelect}{ringSelect}{runsSelect}</>,
      tip: `Where the runs went, from above, as a ${hand === 'L' ? 'left' : 'right'}-hand batter.`,
      body: failed ? retryNote : noTrackingWagon ? <div className="art"><NoTracking /></div> : (
        <div className="art"><WagonWheel owner={playerId} shots={shown} hand={hand} label={`Wagon wheel of ${shown?.length ?? 0} shots`} runs={runs} onRuns={setRuns} coverage={slice && shots ? `Based on ${int.format(shots.length)} of ${int.format(slice.scoring)} scoring shots` : undefined} filters={wagonLabels} onClear={clear} /></div>
      ),
    },
    {
      id: 'control', label: 'Control', group: 'Shots', title: 'Shot control', tag: 'Tracking',
      tip: 'Share of shots in control by line and length.',
      body: failed ? retryNote : controlRows === null ? <TileLoader label="Shot control" /> : controlRows.length === 0
        ? <div className="art"><NoTracking /></div>
        : <ControlBody rows={controlRows} hand={hand} test={test} />,
    },
    {
      id: 'falseshots', label: 'False shots', group: 'Shots', title: 'False shot trend', tag: 'Tracking',
      tip: 'Share of balls that were a miss, an edge or a mistimed shot, for each of the latest innings with at least 10 tracked balls.',
      body: failed ? retryNote : falseInnings === null ? <TileLoader label="False shot trend" /> : falseInnings.length === 0
        ? <div className="art"><NoTracking /></div>
        : <FalseShotsBody innings={falseInnings} />,
    },
    {
      id: 'outmap', label: 'Dismissal map', group: 'Outs', title: 'Dismissal map', tag: 'Tracking',
      tip: 'Where the batter got out, by line and length.',
      body: failed ? retryNote : outMap === null ? <TileLoader label="Dismissal map" /> : outMap.all === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : outMap.rows.length === 0 ? <div className="art"><NoTracking /></div>
        : <DismissalMapBody rows={outMap.rows} all={outMap.all} hand={hand} />,
    },
    {
      id: 'dismissals', label: 'Dismissals', group: 'Outs', title: 'Dismissals', tag: 'Cricsheet',
      tip: 'How the batter gets out, and how many balls or runs into the innings.',
      body: failed ? retryNote : dismissals === null ? <TileLoader label="Dismissals" /> : dismissals.types.length === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <DismissalsBody data={dismissals} kind="bat" />,
    },
    {
      id: 'reviews', label: 'Reviews', group: 'Outs', title: 'Reviews', tag: 'Cricsheet',
      tip: 'Reviews on balls the batter faced.',
      body: failed ? retryNote : reviewGroups === null || slice === null ? <TileLoader label="Reviews" /> : slice.balls === 0
        ? <div className="art"><EmptySlice filters={labels} onClear={clear} /></div>
        : <ReviewsBody view="bat" groups={reviewGroups} />,
    },
  ];

  return (
    <>
      <BallFilterBar view="bat" test={test} combos={combos} opponents={opponents} styleCounts={styleCounts} value={ball} onChange={onBall} totals={slice === null ? null : slice.runs + slice.balls > 0 ? `${int.format(slice.runs)} runs${slice.dismissals > 0 ? `, avg ${(slice.runs / slice.dismissals).toFixed(1)}` : ', avg -'}` : '- runs, avg -'} />
      <TileCarousel stale={pending} resetKey={playerId} instant={instant} name="Batting analysis" note="The filters above apply to every tile." tiles={tiles} />
    </>
  );
}
