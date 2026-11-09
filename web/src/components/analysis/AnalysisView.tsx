'use client';

import { usePhone } from '../usePhone';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchPar } from '@/data/parData';
import { sourceSlices, sourceTotals } from '@/domain/analysis';
import { bbInningsLabel, type BallFile } from '@/domain/ballByBall';
import { mainInnings, resultText, scoreText, sides, subMarks, type InningsCard, type MatchBundle, type SubMark } from '@/domain/match';
import { inningsName, roundLabels, rounds } from '@/domain/matchDetails';
import { describePhase, phaseOrder, type PhaseFormat } from '@/domain/phases';
import { RING_OPTIONS, shotOptions, topLabels, type Ring } from '@/domain/shotFilter';
import type { PitchRuns, WagonRuns } from '@/domain/runsFilter';
import { enoughTracking, shotsOf, trackedBalls } from '@/domain/tracking';
import { chaseOf, parSeries, winCoverage, winSeries, WIN_MIN, type ParData } from '@/domain/story';
import type { SourceRow } from '@/domain/phases';
import { RoundSwitch } from '../DetailsView';
import { useMatchBalls as useBalls } from '../useMatchBalls';
import { SourcesChart } from '../RunSourcesTile';
import { TileCarousel, type TileDef } from '../TileCarousel';
import { ChaseChart, ParChart, targetText, WinChart } from './StoryTiles';
import { PartnershipsPart } from '../details/ScoringCharts';
import { TileLoader } from '../states/TileStates';
import { BlocksChart, flowInnings, ManhattanChart, PerOverChart, TestWormChart, WormChart, type FlowInnings } from './FlowCharts';
import { MatchPhases } from './PhasesTile';
import { MatchupsTile, type MatchupPanel } from './MatchupsTile';
import { SpellsTile, spellPanels } from './SpellsTile';
import { countShots, PitchTile, RingTile, ShotMixTile, WagonTile, WicketTile, type Choices, type Chosen, type TrackSide, type WagonFilters } from './TrackingTiles';

/** The colour of each source slice. Singles, twos, threes, fours and sixes are the ones the player page uses. */
const SLICE_COLOUR: Record<string, string> = {
  one: '#C9CDD3', two: '#FFFFFF', three: '#B79CFF', four: '#56B4E9', six: '#B9E3FA', wd: '#E58F65', nb: '#D9685C', by: '#7DC4A0', lb: '#58A08A', pe: '#E3C06B', otherBat: '#8C96A5', other: '#6F7B8D',
};
const SLICE_ORDER = ['one', 'two', 'three', 'four', 'six', 'wd', 'nb', 'by', 'lb', 'pe', 'otherBat', 'other'];
const SLICE_NAME: Record<string, string> = { one: 'Singles', two: 'Twos', three: 'Threes', four: 'Fours', six: 'Sixes', wd: 'Wides', nb: 'No balls', by: 'Byes', lb: 'Leg byes', pe: 'Penalty', otherBat: 'Other bat runs', other: 'Other' };

const other = (b: MatchBundle, team: string): string => (b.match.teams[0]!.name === team ? b.match.teams[1]!.name : b.match.teams[0]!.name);

/** The Run sources rows: a bar for each innings split into the slices of its runs. A slice under 3% of an innings is joined to Other, and every bar carries the same slices so the legend fits all of them. */
function sourceRows(b: MatchBundle, innings: readonly InningsCard[], files: ReadonlyMap<number, BallFile>): SourceRow[] {
  const per = innings.map((inn) => ({ inn, slices: sourceSlices(sourceTotals(files.get(inn.n)!)) }));
  const keys = SLICE_ORDER.filter((k) => per.some((p) => p.slices.some((s) => s.key === k)));
  return per.map(({ inn, slices }) => {
    const total = slices.reduce((a, s) => a + s.runs, 0);
    const name = b.match.kind === 'test' ? `${inningsName(b, inn)}, ${inn.team}` : `${inn.team}, ${scoreText(inn)}`;
    return {
      key: String(inn.n), name, team: inn.team, runs: total,
      segments: keys.map((k) => {
        const s = slices.find((x) => x.key === k);
        return { label: s?.parts ? `Other (${s.parts.join(', ')})` : SLICE_NAME[k]!, colour: SLICE_COLOUR[k]!, balls: s?.runs ?? 0, runs: s?.runs ?? 0, share: s ? s.share : 0 };
      }),
    };
  });
}

/**
 * The Match analysis view without tracking: the scoring worm, Manhattan and Run sources, then Partnerships, Spells and Matchups. A Test has the worm of four innings, runs by block
 * of 20 overs, runs per over of one innings and the same Run sources for four innings. Super Over balls are left out of every chart. Everything is worked out from the ball files and agrees with the scorecard.
 */
export function AnalysisView({ bundle, fills, instant }: { bundle: MatchBundle; fills: readonly [string, string]; instant: boolean }) {
  const load = useBalls(bundle);
  // The par band of a limited-overs match: asked for with the ball files. Null data means the match has none.
  const [par, setParState] = useState<{ status: 'loading' | 'ready'; data: ParData | null }>({ status: 'loading', data: null });
  const setPar = setParState;
  useEffect(() => {
    let live = true;
    setPar({ status: 'loading', data: null });
    if (bundle.match.kind === 'test') { setPar({ status: 'ready', data: null }); return; }
    fetchPar(bundle.match.id).then((data) => { if (live) setPar({ status: 'ready', data }); }).catch(() => { if (live) setPar({ status: 'ready', data: null }); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [bundle]);
  const [first] = sides(bundle);
  const [fillA, fillB] = fills;
  const colourOf = useCallback((team: string): string => (team === first ? fillA : fillB), [first, fillA, fillB]);
  const [round, setRound] = useState(0);
  const [overInn, setOverInn] = useState(0);
  // Manhattan, the blocks chart and runs per over show one innings at a time.
  const [manInn, setManInn] = useState(0);
  const [blockInn, setBlockInn] = useState(0);
  // The tracking tiles: who each panel shows, the Test's shared innings filter, and the wagon wheel and pitch map filters.
  const [choices, setChoices] = useState<Choices>({});
  const setChoice = useCallback((k: string, next: Chosen) => setChoices((was) => ({ ...was, [k]: next })), []);
  const [wShot, setWShot] = useState('');
  const [wRing, setWRing] = useState<Ring>('any');
  const [wPhase, setWPhase] = useState('');
  const [wRuns, setWRuns] = useState<WagonRuns>('all');
  const [pRuns, setPRuns] = useState<PitchRuns>('all');
  const marks = useMemo<Map<string, SubMark>>(() => subMarks(bundle), [bundle]);
  const rs = useMemo(() => rounds(bundle), [bundle]);
  const test = bundle.match.kind === 'test';
  const all = useMemo(() => mainInnings(bundle), [bundle]);
  const at = Math.min(round, rs.length - 1);
  const files = load.status === 'ready' ? load.files : null;
  // The innings that have a ball file, in the order they were batted.
  const have = useMemo(() => (files ? all.filter((i) => files.has(i.n)) : []), [files, all]);
  const lines = useMemo<FlowInnings[]>(() => (files ? have.map((i) => flowInnings(bundle, i, files.get(i.n)!, colourOf(i.team))) : []), [files, have, bundle, colourOf]);
  const tracked = useMemo(() => (files ? have.flatMap((i) => trackedBalls(i, files.get(i.n)!)) : []), [files, have]);
  const inFilter = tracked;
  const [firstTeam, secondTeam] = sides(bundle);
  const trackSides = useMemo<TrackSide[]>(() => [firstTeam, secondTeam].map((team) => ({ team, colour: colourOf(team), bat: inFilter.filter((b) => b.team === team), bowl: inFilter.filter((b) => b.team !== team),
    batInnings: have.flatMap((i, k) => (i.team === team ? [{ n: i.n, label: bbInningsLabel(bundle, i, k + 1) }] : [])), bowlInnings: have.flatMap((i, k) => (i.team !== team ? [{ n: i.n, label: bbInningsLabel(bundle, i, k + 1) }] : [])) })), [firstTeam, secondTeam, inFilter, colourOf, have, bundle]);
  // The story (stage 5): Win probability where the data has it on 90% of the balls, the first innings against its par band, the chase. A Test has none of them.
  const storyOn = !test && all.length >= 2;
  const winHint = storyOn && bundle.coverage.balls > 0 && bundle.coverage.winProb / bundle.coverage.balls >= WIN_MIN;
  const story = useMemo(() => {
    if (test || !files || have.length < 2) return null;
    const [i1, i2] = [have[0]!, have[1]!];
    const win = winCoverage(files, have) >= WIN_MIN ? winSeries(bundle, have, files) : null;
    const chase = chaseOf(bundle, i1, i2, files.get(i2.n)!);
    const series = par.status === 'ready' && par.data ? parSeries(files.get(i1.n)!, par.data) : null;
    return { win, chase, series, i1, i2 };
  }, [test, files, have, bundle, par]);
  const hasPositions = enoughTracking(bundle, 'positioned'), hasTracking = enoughTracking(bundle, 'tracked'), hasPitch = enoughTracking(bundle, 'pitched');
  const phaseFormat: PhaseFormat = bundle.match.kind === 'test' ? 'test' : bundle.match.kind === 'odi' ? 'odi' : 't20';
  // On a phone a Test's panels each have a chip of their own (one for each innings), so they take every innings and the switch between rounds is not shown.
  const phone = usePhone();
  const roundControl = phone ? undefined : <RoundSwitch round={at} labels={roundLabels(bundle)} onPick={setRound} />;

  const tiles = useMemo((): TileDef[] => {
    const loading = (label: string): ReactNode => <TileLoader label={label} />;
    const absent = (text: string): ReactNode => <p className="rempty">{text}</p>;
    const ready = lines.length > 0;
    const chart = (label: string, body: () => ReactNode): ReactNode => (load.status === 'loading' ? loading(label) : load.status === 'error' || !ready ? absent('The ball by ball file of this match could not be read.') : <div className="art">{body()}</div>);
    const chartTile = (id: string, label: string, group: string, title: string, tip: string, body: ReactNode, control?: ReactNode): TileDef => ({ id, label, group, title, tip, tag: 'Cricsheet', ...(control ? { control } : {}), body });
    const wideTile = (id: string, label: string, group: string, title: string, tip: string, body: ReactNode, control?: ReactNode): TileDef => ({ id, label, group, title, tip, tag: 'Cricsheet', wide: true, part: true, ...(control ? { control } : {}), body });
    const out: TileDef[] = [];
    // The story tiles are in the list from the first frame, with a loader until the files arrive: tiles that came in later in front of the row pushed it onto another tile (scroll snap keeps the snapped tile).
    if (storyOn) {
      const two = all.slice(0, 2);
      const names: [string, string] = [two[0]!.team, two[1]!.team];
      const fills: [string, string] = [colourOf(names[0]), colourOf(names[1])];
      const tText = story?.chase ? targetText(bundle, story.chase, story.i2) : '';
      const body = (label: string, draw: (() => ReactNode) | null): ReactNode => (load.status === 'error' ? absent('The ball by ball file of this match could not be read.') : draw ? <div className="art">{draw()}</div> : loading(label));
      const showWin = story ? Boolean(story.win && story.win.length > 1) : winHint;
      if (showWin) out.push(chartTile('win', 'Win probability', 'The story', 'Win probability', 'Chance of winning for the side that batted first, ball by ball across both innings (the second innings is flipped). Shaded for whoever is ahead, with a white disc for a wicket. Drawn only when at least 90% of balls have a value.', body('Win probability', story?.win ? () => <WinChart b={bundle} points={story.win!} teams={names} colours={fills} result={resultText(bundle)} /> : null)));
      if (par.status === 'loading' || par.data !== null) out.push(chartTile('par', 'Par score', 'The story', 'Par score', 'The first innings after each over against the middle half of first innings in comparable matches (same competition this season and the two before, or the whole format when there are too few), with the projected finish where there is one.', body('Par score', story?.series ? () => <ParChart b={bundle} inn={two[0]!} series={story.series!} colour={fills[0]} team={names[0]} scopeNote={par.data?.scope === 'tournament' ? `${story.series!.n} innings of this competition, recent seasons` : `${story.series!.n} innings of all ${bundle.match.format} matches`} /> : null)));
      if (story ? Boolean(story.chase && story.chase.rows.some((r) => r.required !== null)) : true) out.push(chartTile('chase', 'Chase tracker', 'The story', 'Chase tracker', 'The rate the chase needs from each over on, against the rate scored so far. A revised target uses its own overs.', body('Chase tracker', story?.chase ? () => <ChaseChart b={bundle} inn={two[1]!} chase={story.chase!} colour={fills[1]} team={names[1]} target={tText} /> : null)));
    }
    const oneOver = lines[Math.min(overInn, lines.length - 1)];
    if (test) {
      out.push(chartTile('worm', 'Scoring worm', 'Innings flow', 'Scoring worm', 'Score after each over of every innings, in the side\'s colour. A first innings is solid, a second dashed. A white diamond marks a declaration.', chart('Scoring worm', () => <TestWormChart b={bundle} lines={lines} order={all.map((i) => String(i.n))} />)));
      out.push(chartTile('blocks', 'Runs per 20 overs', 'Innings flow', 'Runs per 20 overs', 'Runs in each block of 20 overs of the chosen innings, with a white disc for each wicket. The data has no sessions.', chart('Runs by block', () => <BlocksChart b={bundle} lines={[lines[Math.min(blockInn, lines.length - 1)]!]} />), lines.length > 1 ? (
        <span className="sw msw" role="group" aria-label="Innings">
          {lines.map((l, k) => <button key={l.inn.n} type="button" className={k === blockInn ? 'on' : undefined} onClick={() => setBlockInn(k)} title={`${l.inn.team}, ${bbInningsLabel(bundle, l.inn, k + 1)}`}>{bbInningsLabel(bundle, l.inn, k + 1)}</button>)}
        </span>
      ) : undefined));
      out.push(chartTile('manhattan', 'Manhattan', 'Innings flow', 'Manhattan', 'Runs in each over of the chosen innings, with a white disc over an over that took a wicket. The chips switch innings.', chart('Manhattan', () => (oneOver ? <PerOverChart b={bundle} line={oneOver} /> : null)), lines.length > 1 ? (
        <span className="sw msw" role="group" aria-label="Innings">
          {lines.map((l, k) => <button key={l.inn.n} type="button" className={k === Math.min(overInn, lines.length - 1) ? 'on' : undefined} onClick={() => setOverInn(k)}>{bbInningsLabel(bundle, l.inn, k + 1)}</button>)}
        </span>
      ) : undefined));
    } else {
      out.push(chartTile('worm', 'Scoring worm', 'Innings flow', 'Scoring worm', 'Score after each over (or set of five balls in The Hundred) of both innings. The gap is shaded for the side ahead, with a white disc for a wicket.', chart('Scoring worm', () => (lines.length === 2 ? <WormChart b={bundle} lines={lines} /> : absent('Only one innings was played.')))));
      out.push(chartTile('manhattan', 'Manhattan', 'Innings flow', 'Manhattan', 'Runs in each over (or set of five balls in The Hundred) of one innings, with a white disc over a wicket over. The chips switch innings on the same axis.', chart('Manhattan', () => <ManhattanChart b={bundle} line={lines[Math.min(manInn, lines.length - 1)]!} peak={Math.max(...lines.flatMap((l) => l.stats.map((x) => x.runs)))} />), lines.length > 1 ? (
        <span className="sw msw" role="group" aria-label="Innings">
          {lines.map((l, k) => <button key={l.inn.n} type="button" className={k === Math.min(manInn, lines.length - 1) ? 'on' : undefined} onClick={() => setManInn(k)}>{bbInningsLabel(bundle, l.inn, k + 1)}</button>)}
        </span>
      ) : undefined));
    }
    out.push(chartTile('sources', 'Run sources', 'Innings flow', test ? 'Run sources' : 'Run source stack', 'Where each innings\' runs came from: singles to sixes off the bat, and extras. A source under 3% is joined to Other.',
      load.status === 'loading' ? loading('Run sources') : ready && files ? <SourcesChart sources={sourceRows(bundle, have, files)} empty="No runs were scored." /> : absent('The ball by ball file of this match could not be read.')));
    if (!test && lines.length >= 2) out.push(wideTile('phases', 'Phases', 'Innings flow', 'Phases', 'Each innings by phase (Powerplay, Middle and Death, or Powerplay and Rest of innings in The Hundred): run rate against the whole innings, runs, wickets, dot balls, boundary balls and balls.', <MatchPhases b={bundle} innings={have.slice(0, 2)} />));
    out.push(wideTile('partnerships', 'Partnerships', 'Batting', 'Partnerships', 'Each stand: runs and balls of both batters and the stand\'s total, which includes extras. A star means it was unbroken.', <PartnershipsPart b={bundle} innings={phone ? all : rs[at] ?? []} marks={marks} />, test && rs.length > 1 ? roundControl : undefined));
    // The tracking tiles (stage 4) are drawn when at least 30% of the balls of the match carry the field they read, and the page says so when they are not.
    const trackBody = (draw: () => ReactNode): ReactNode => (load.status === 'loading' ? loading('Tracking') : tracked.length === 0 ? absent('The ball by ball file of this match could not be read.') : draw());
    const shotTop = topLabels(countShots(inFilter));
    const shotOpts = shotOptions(shotTop, shotsOf(inFilter));
    const phaseKeys = [...new Set(inFilter.map((b) => b.phase).filter(Boolean))].sort((a, z) => phaseOrder(a) - phaseOrder(z));
    const hundred = bundle.match.kind === 'hundred';
    const wagonControl = (
      <>
        <span className="tphead">
        <label className="shf"><span>Shot</span>
          <select aria-label="Shot" value={wShot} onChange={(e) => setWShot(e.target.value)}>
            {shotOpts.length === 0 ? <option value="">All shots</option> : shotOpts.map((o) => <option key={o.value} value={o.value} disabled={o.count === 0 && o.value !== wShot}>{o.label}{o.count === 0 && o.value !== '' ? ' (no shots)' : ''}</option>)}
          </select>
        </label>
        {phaseKeys.length > 1 && (
          <label className="shf"><span>Phase</span>
            <select aria-label="Phase" value={wPhase} onChange={(e) => setWPhase(e.target.value)}>
              <option value="">All phases</option>
              {phaseKeys.map((k) => <option key={k} value={k}>{describePhase(k, phaseFormat, hundred).name}</option>)}
            </select>
          </label>
        )}
        <label className="shf"><span>Ball went</span>
          <select aria-label="Ball went" value={wRing} onChange={(e) => setWRing(e.target.value as Ring)}>
            {RING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        </span>
      </>
    );
    const wagonFilters: WagonFilters = { shot: wShot, ring: wRing, phase: wPhase, runs: wRuns, top: shotTop };
    if (hasTracking) out.push(wideTile('shotmix', 'Shot mix', 'Batting', 'Shot mix', 'Each shot played: balls, runs, strike rate, control and dismissals. Only balls with a shot label count.', trackBody(() => <ShotMixTile sides={trackSides} choices={choices} setChoice={setChoice} format={phaseFormat} />), undefined));
    if (hasPositions) out.push(wideTile('ring', 'Ring', 'Batting', 'Scoring in the ring', 'Share of runs inside and outside the 30 yard ring, and runs, balls and strike rate in four bands of distance.', trackBody(() => <RingTile sides={trackSides} choices={choices} setChoice={setChoice} />), undefined));
    if (hasPositions) out.push(wideTile('wagon', 'Wagon wheel', 'Batting', 'Wagon wheel', 'Where the runs went, shots starting at the batter. Pick a shot, a phase or where the ball went.', trackBody(() => <WagonTile sides={trackSides} choices={choices} setChoice={setChoice} filters={wagonFilters} onRuns={setWRuns} matchId={bundle.match.id} strip={phone ? wagonControl : undefined} />), phone ? undefined : wagonControl));
    const round = test && !phone ? rs[at] ?? [] : all;
    const label = (inn: InningsCard): string => (test ? `${other(bundle, inn.team)} bowling, ${inningsName(bundle, inn)}` : `${other(bundle, inn.team)} bowling`);
    const panels = files ? spellPanels(bundle, round, files, label, (inn) => other(bundle, inn.team)) : [];
    out.push(wideTile('spells', 'Spells', 'Bowling', 'Spells', 'Each bowler\'s overs, with the runs in each over (darker is more) and a white disc over a wicket over. Click a bowler for figures and spells. A spell allows up to two overs by others between its overs.',
      load.status === 'loading' ? loading('Spells') : panels.length > 0 ? <SpellsTile b={bundle} panels={panels} scroll={test} /> : absent('The ball by ball file of this match could not be read.'), test && rs.length > 1 ? roundControl : undefined));
    if (hasPitch) out.push(wideTile('pitch', 'Pitch map', 'Bowling', 'Pitch map', 'Where deliveries landed, by length and line, from behind the bowler. Wickets, fours and sixes are marked.', trackBody(() => <PitchTile sides={trackSides} choices={choices} setChoice={setChoice} runs={pRuns} onRuns={setPRuns} matchId={bundle.match.id} />), undefined));
    if (hasPitch) out.push(wideTile('wicketmap', 'Wicket map', 'Bowling', 'Wicket map', 'Where the bowler\'s wickets came from, by length and line. Brighter is more wickets. Run outs are not the bowler\'s.', trackBody(() => <WicketTile sides={trackSides} choices={choices} setChoice={setChoice} />), undefined));
    const mus: MatchupPanel[] = files ? round.flatMap((inn) => (files.has(inn.n) ? [{ key: `m${inn.n}`, label: label(inn), team: other(bundle, inn.team), inn, file: files.get(inn.n)! }] : [])) : [];
    out.push(wideTile('matchups', 'Matchups', 'Bowling', 'Matchups', 'Each batter against each bowler: strike rate in the cell, runs off the balls faced below it, a white disc where the bowler got the batter out.',
      load.status === 'loading' ? loading('Matchups') : mus.length > 0 ? <MatchupsTile panels={mus} marks={marks} /> : absent('The ball by ball file of this match could not be read.'), test && rs.length > 1 ? roundControl : undefined));
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [bundle, test, phone, lines, load, have, files, all, rs, at, marks, overInn, blockInn, manInn, roundControl, story, par, colourOf, tracked, inFilter, trackSides, hasPositions, hasTracking, hasPitch, choices, setChoice, wShot, wRing, wPhase, wRuns, pRuns, phaseFormat]);

  if (all.length === 0) return <div className="pending"><h3>Match analysis</h3><p>No balls were bowled in this match.</p></div>;
  return <TileCarousel name="Match analysis" note="" summary={[load.status === 'ready' && !(hasPositions && hasTracking) ? 'Tracking charts are not available for this match.' : '', 'Click a stop to jump to it.'].filter(Boolean).join(' ')} tiles={tiles} resetKey={String(bundle.match.id)} instant={instant} />;
}
