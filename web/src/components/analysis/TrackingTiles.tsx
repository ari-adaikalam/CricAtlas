'use client';

import { TeamSwatch } from '../TeamSwatch';
import { PlayGroupProvider } from '../wagon/playGroup';
import { TeamLink } from '../TeamLinks';
import { useMemo, useState, type ReactNode } from 'react';
import { ChartTip } from '../ChartTip';
import { ChartColoursFor } from '../ChartColours';
import { usePlayOnView } from '../charts/usePlayOnView';
import { RingBody } from '../RingTile';
import { ShotMixBody } from '../ShotMixTile';
import { WagonWheel } from '../wagon/WagonWheel';
import { PitchMap } from '../wagon/PitchMap';
import { pickSide, useSides } from './useSides';
import { usePhone } from '../usePhone';
import { withAlpha } from '@/domain/colours';
import { inRuns, PITCH_RUNS_OPTIONS, type PitchRuns, type WagonRuns } from '@/domain/runsFilter';
import { BANDS, LANES } from '@/domain/pitch';
import type { PhaseFormat } from '@/domain/phases';
import { inRing, inShotChoice, type Ring } from '@/domain/shotFilter';
import { hasPosition, pick, pitchRowsOf, rankPlayers, sampleLine, shotMixCellsOf, shotsOf, wicketGrid, type Against, type Hand, type TrackedBall } from '@/domain/tracking';
import { TipBody } from '../TipBody';

/** The hand a chart is drawn for: right, left, or N for a mix of hands. */
export type ChartHand = 'R' | 'L' | 'N';

// The tracking tiles of the Match Analysis: Shot mix, Ring, Wagon wheel, Pitch map and Wicket map. Each side has its own panel with a row of player chips (the top four and a
// dropdown for the rest), an Against row, a line stating the sample, and the chart. The panel opens on the whole side's balls and a chip narrows it to one player (the chips are the top run scorers, or top wicket takers for bowling tiles). The choices are shared by
// every tile of the same kind. No Teams, Within a team or Left v right mode (Ari, 2026-10-22).

const int = new Intl.NumberFormat('en');

export interface InningsChoice { n: number; label: string }
export interface TrackSide { team: string; colour: string; /** Balls faced by this side's batters. */ bat: TrackedBall[]; /** Balls bowled by this side's bowlers. */ bowl: TrackedBall[]; /** The innings this side batted in, and the innings it bowled in, named "1st innings" and so on (a Test side has two of each). */ batInnings: InningsChoice[]; bowlInnings: InningsChoice[] }
/** `inn` is the innings number, or -1 for all of them. */
export interface Chosen { who?: string | null; against?: Against; inn?: number }
export type Choices = Record<string, Chosen>;
export type Role = 'bat' | 'bowl';

const key = (role: Role, team: string): string => `${role}:${team}`;
const againstValue = (a: Against): string => (a.kind === 'player' ? `p:${a.id}` : a.kind === 'hand' ? `h:${a.hand}` : 'all');
const parseAgainst = (v: string): Against => (v.startsWith('p:') ? { kind: 'player', id: v.slice(2) } : v.startsWith('h:') ? { kind: 'hand', hand: v.slice(2) as 'R' | 'L' } : { kind: 'all' });
const handWord = (h: Hand): string => (h === 'L' ? 'left-hander' : h === 'R' ? 'right-hander' : '');

interface Picked {
  players: ReturnType<typeof rankPlayers>; others: ReturnType<typeof rankPlayers>; who: string | null; against: Against; balls: TrackedBall[]; inn: number; chosen: ReturnType<typeof rankPlayers>[number] | undefined; againstName: string;
  groups: Array<{ value: string; label: string }>;
}

/** What a side's panel shows: its players, the choice made in the filter bar and the balls that choice leaves. Every panel opens on the whole side's balls (Ari, 2026-10-22). */
function usePicked(role: Role, side: TrackSide, choices: Choices): Picked {
  const c = choices[key(role, side.team)] ?? {};
  const all = role === 'bat' ? side.bat : side.bowl;
  const inn = c.inn ?? -1;
  // A Test side has its own innings: this panel can show one of them, whichever the other side did.
  const mine = useMemo(() => (inn >= 0 ? all.filter((b) => b.innings === inn) : all), [all, inn]);
  const players = useMemo(() => rankPlayers(mine, role), [mine, role]);
  const others = useMemo(() => rankPlayers(mine, role === 'bat' ? 'bowl' : 'bat'), [mine, role]);
  const who = c.who === undefined ? null : c.who;
  const against: Against = useMemo(() => c.against ?? { kind: 'all' }, [c.against]);
  const balls = useMemo(() => pick(mine, role, who, against), [mine, role, who, against]);
  const groups = role === 'bat' ? [{ value: 'all', label: 'All bowlers' }] : [{ value: 'all', label: 'All batters' }, { value: 'h:R', label: 'Right-handers' }, { value: 'h:L', label: 'Left-handers' }];
  const againstName = against.kind === 'player' ? others.find((p) => p.id === against.id)?.name ?? 'one player' : groups.find((g) => g.value === againstValue(against))?.label.toLowerCase() ?? 'all';
  return { players, others, who, against, balls, inn, chosen: players.find((p) => p.id === who), againstName, groups };
}

/** One side's two dropdowns, over its panel: who to show (the whole side or one player) and who they played against. */
function SideFilters({ role, side, choices, setChoice }: { role: Role; side: TrackSide; choices: Choices; setChoice: (k: string, next: Chosen) => void }) {
  const p = usePicked(role, side, choices);
  const set = (next: Chosen): void => setChoice(key(role, side.team), { who: p.who, against: p.against, inn: p.inn, ...next });
  const innings = role === 'bat' ? side.batInnings : side.bowlInnings;
  return (
    <div className="tpside">
      <span className="tpteam"><TeamSwatch team={side.team} /><TeamLink name={side.team} /></span>
      <label className="shf"><span className="shl">{role === 'bat' ? 'Batter' : 'Bowler'}</span>
        <select aria-label={`${side.team} ${role === 'bat' ? 'batter' : 'bowler'}`} value={p.who ?? ''} onChange={(e) => set({ who: e.target.value === '' ? null : e.target.value })}>
          <option value="">{role === 'bat' ? 'Whole batting side' : 'Whole bowling side'}</option>
          {p.players.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}{pl.hand ? ` (${pl.hand})` : ''}</option>)}
        </select>
      </label>
      {/* A Test side always names its innings, even when it batted or bowled in one. */}
      {(innings.length > 1 || (innings.length === 1 && /innings$/.test(innings[0]!.label))) && (
        <label className="shf"><span className="shl">Innings</span>
          <select aria-label={`${side.team}, innings`} value={p.inn} onChange={(e) => set({ inn: Number(e.target.value), who: null, against: { kind: 'all' } })}>
            <option value={-1}>All innings</option>
            {innings.map((i) => <option key={i.n} value={i.n}>{i.label}</option>)}
          </select>
        </label>
      )}
      <label className="shf"><span className="shl">{role === 'bat' ? 'Against bowler' : 'Against batter'}</span>
        <select aria-label={`${side.team}, against`} value={againstValue(p.against)} onChange={(e) => set({ against: parseAgainst(e.target.value) })}>
          {p.groups.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          <optgroup label={role === 'bat' ? 'Bowlers' : 'Batters'}>
            {p.others.map((o) => <option key={o.id} value={`p:${o.id}`}>{o.name}{o.hand ? ` (${o.hand})` : ''}</option>)}
          </optgroup>
        </select>
      </label>
    </div>
  );
}

interface PanelProps {
  role: Role; side: TrackSide; choices: Choices;
  /** Which balls carry the field this tile draws, for the sample line. */
  field: (b: TrackedBall) => boolean;
  children: (balls: TrackedBall[], hand: ChartHand, colour: string) => ReactNode;
}

/** One side's panel: its dropdowns at the top, then the chart. The sample ("120 balls, 109 with tracking") is in `data-sample` for the checks and not drawn. */
function Panel({ role, side, choices, setChoice, field, children, inline = true }: PanelProps & { setChoice: (k: string, next: Chosen) => void; /** The side's dropdowns over its chart. On a phone they are in the Filters sheet instead. */ inline?: boolean }) {
  const p = usePicked(role, side, choices);
  // The hand of the chart: the chosen batter's, or the one every batter in it shares, otherwise a mix.
  const hands = new Set(p.balls.filter((b) => b.batter).map((b) => b.hand).filter(Boolean));
  const only = [...hands][0];
  const hand: ChartHand = role === 'bat' && p.chosen?.hand ? p.chosen.hand : hands.size === 1 && (only === 'R' || only === 'L') ? only : 'N';
  const who = p.chosen ? `${p.chosen.name}${role === 'bat' && p.chosen.hand ? `, ${handWord(p.chosen.hand)}` : ''}` : 'the whole side';
  const line = `${side.team} ${role === 'bat' ? 'batting' : 'bowling'}: ${who}, against ${p.againstName}. ${sampleLine(p.balls, field)}`;
  return (
    <div className="pan2 tpp" data-sample={line}>
      {inline && <SideFilters role={role} side={side} choices={choices} setChoice={setChoice} />}
      <div className="tpbody">{children(p.balls, hand, side.colour)}</div>
    </div>
  );
}

/** The two sides of a tile: a row of dropdowns, one pair above each panel, and the panels. `role` says which of a side's balls the tile reads. */
function Panels({ role, sides, choices, setChoice, field, strip, children }: Omit<PanelProps, 'side' | 'children'> & { setChoice: (k: string, next: Chosen) => void; sides: readonly TrackSide[]; /** Filters of the whole tile, in a row of their own above the two sides (the wagon wheel's Shot, Phase and Ball went). */ strip?: ReactNode; children: (balls: TrackedBall[], hand: ChartHand, colour: string, side: TrackSide) => ReactNode }) {
  const { bar, side } = useSides(sides.map((s) => s.team));
  const phone = usePhone();
  const [sheet, setSheet] = useState(false);
  const shown = sides[Math.min(side ?? 0, sides.length - 1)]!;
  // On a phone the side's dropdowns and the tile's own filters are in one sheet from the bottom (a Filters button beside the side chips), so the chart has the room.
  return (
    <div className="tpwrap">
      {phone ? (
        <div className="tpbar">
          {bar}
          <button type="button" className="tpfb" aria-expanded={sheet} onClick={() => setSheet(true)}>Filters</button>
        </div>
      ) : bar}
      {phone ? (
        <div className="tpsheet" data-open={sheet ? 'true' : 'false'}>
          <div className="tpsheet-in">
            {strip}
            <SideFilters role={role} side={shown} choices={choices} setChoice={setChoice} />
            <button type="button" className="tpdone" onClick={() => setSheet(false)}>Done</button>
          </div>
        </div>
      ) : strip && <div className="tpstrip">{strip}</div>}
      <div className={`two2 tps${sides.length === 1 ? ' one' : ''}`} data-side={side}>
        {pickSide(sides.map((s) => <Panel key={s.team} role={role} side={s} choices={choices} setChoice={setChoice} field={field} inline={!phone}>{(balls, hand, colour) => children(balls, hand, colour, s)}</Panel>), side)}
      </div>
    </div>
  );
}

interface TileProps { sides: readonly TrackSide[]; choices: Choices; setChoice: (k: string, next: Chosen) => void }
const NoBalls = ({ text }: { text: string }) => <p className="rempty">{text}</p>;

export function ShotMixTile({ sides, choices, setChoice, format }: TileProps & { format: PhaseFormat }) {
  return (
    <Panels role="bat" sides={sides} choices={choices} setChoice={setChoice} field={(b) => b.shot !== null}>
      {(balls, _hand, colour) => <ChartColoursFor colour={colour}><ShotMixBody cells={shotMixCellsOf(balls)} mode="career" format={format} /></ChartColoursFor>}
    </Panels>
  );
}

export function RingTile({ sides, choices, setChoice }: TileProps) {
  return (
    <Panels role="bat" sides={sides} choices={choices} setChoice={setChoice} field={hasPosition}>
      {(balls, _hand, colour) => <ChartColoursFor colour={colour}><div className="art"><RingBody balls={shotsOf(balls)} /></div></ChartColoursFor>}
    </Panels>
  );
}

export interface WagonFilters { shot: string; ring: Ring; phase: string; runs: WagonRuns; /** The shot labels the Shot dropdown names; every other shot is under Other shots. */ top: readonly string[] }
export function WagonTile({ sides, choices, setChoice, filters, onRuns, matchId, strip }: TileProps & { filters: WagonFilters; onRuns: (r: WagonRuns) => void; matchId: number; /** The Shot, Phase and Ball went filters, for the phone's Filters sheet. */ strip?: ReactNode }) {
  return (
    <Panels role="bat" sides={sides} choices={choices} setChoice={setChoice} field={hasPosition} strip={strip}>
      {(balls, hand, colour, side) => {
        const phased = filters.phase ? balls.filter((b) => b.phase === filters.phase) : balls;
        const all = shotsOf(phased);
        const shown = inRuns(inRing(inShotChoice(all, filters.shot, filters.top), filters.ring), filters.runs);
        const labels = [filters.shot ? filters.shot : '', filters.ring !== 'any' ? (filters.ring === 'inside' ? 'Inside the ring' : 'Outside the ring') : '', filters.phase].filter(Boolean);
        return (
          <ChartColoursFor colour={colour}>
            <div className="art"><WagonWheel owner={`${matchId}:${side.team}`} shots={shown} hand={hand} label={`Wagon wheel of ${shown.length} shots`} runs={filters.runs} onRuns={onRuns} filters={labels} coverage={`Based on ${int.format(all.length)} balls with a position`} /></div>
          </ChartColoursFor>
        );
      }}
    </Panels>
  );
}

/** The shot labels of some balls and how many each has, for the Shot dropdown. */
export function countShots(balls: readonly TrackedBall[]): Array<{ shot: string; balls: number }> {
  const m = new Map<string, number>();
  for (const b of balls) if (b.shot !== null && hasPosition(b)) m.set(b.shot, (m.get(b.shot) ?? 0) + 1);
  return [...m].map(([shot, n]) => ({ shot, balls: n }));
}

export function PitchTile({ sides, choices, setChoice, runs, onRuns, matchId }: TileProps & { runs: PitchRuns; onRuns: (r: PitchRuns) => void; matchId: number }) {
  return (
    <PlayGroupProvider>
    <Panels role="bowl" sides={sides} choices={choices} setChoice={setChoice} field={(b) => b.length !== null && b.line !== null}>
      {(balls, _hand, colour, side) => {
        const data = pitchRowsOf(balls);
        return (
          <ChartColoursFor colour={colour}>
            <div className="art"><PitchMap owner={`${matchId}:${side.team}`} rows={data.rows} tracked={data.tracked} bowled={data.bowled} runs={runs} onRuns={onRuns} filters={[]} compact /></div>
          </ChartColoursFor>
        );
      }}
    </Panels>
    </PlayGroupProvider>
  );
}

function WicketGrid({ balls, colour }: { balls: TrackedBall[]; colour: string }) {
  const data = useMemo(() => pitchRowsOf(balls), [balls]);
  const grid = useMemo(() => wicketGrid(data.rows), [data]);
  const [tip, setTip] = useState<{ x: number; y: number; j: number; i: number } | null>(null);
  const total = grid.flat().reduce((a, c) => a + c.wickets, 0);
  const max = Math.max(1, ...grid.flat().map((c) => c.wickets));
  const { ref, played } = usePlayOnView<HTMLDivElement>(`${data.tracked}:${total}`);
  if (data.tracked === 0) return <NoBalls text="No balls with a length and a line in this slice." />;
  return (
    <>
      <div className={`ctlgrid wmap${played ? ' play' : ''}`} ref={ref} onPointerLeave={() => setTip(null)}>
        {BANDS.map((band, j) => (
          <div className="ctlrow" key={band.key}>
            <span className="ctlname">{band.full}</span>
            {LANES.map((lane, i) => {
              const c = grid[j]![i]!;
              return (
                <div key={lane.key} className="ctlcell fade-in" data-c="" tabIndex={0} style={{ background: c.wickets > 0 ? withAlpha(colour, 0.25 + 0.65 * (c.wickets / max)) : 'rgba(255,255,255,.04)', animationDelay: `${(j * 5 + i) * 18}ms` }}
                  onPointerMove={(e) => setTip({ x: e.clientX, y: e.clientY, j, i })} onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.left + r.width / 2, y: r.top, j, i }); }} onBlur={() => setTip(null)}
                  aria-label={`${band.full}, ${lane.label}: ${c.wickets} ${c.wickets === 1 ? 'wicket' : 'wickets'} from ${c.balls} balls`}>
                  {c.balls === 0 ? '-' : c.wickets}
                </div>
              );
            })}
          </div>
        ))}
        <div className="ctlrow ctlhead"><span className="ctlname" />{LANES.map((l) => <span key={l.key} className="ctllane">{l.short}</span>)}</div>
      </div>
      {tip && (
        <ChartTip x={tip.x} y={tip.y}>
          <TipBody title={`${BANDS[tip.j]!.full}, ${LANES[tip.i]!.label.toLowerCase()}`} rows={[{ label: 'Wickets', value: String(grid[tip.j]![tip.i]!.wickets) }, { label: 'Balls', value: int.format(grid[tip.j]![tip.i]!.balls) }]} />
        </ChartTip>
      )}
    </>
  );
}

export function WicketTile({ sides, choices, setChoice }: TileProps) {
  return (
    <Panels role="bowl" sides={sides} choices={choices} setChoice={setChoice} field={(b) => b.length !== null && b.line !== null}>
      {(balls, _hand, colour) => <div className="art"><WicketGrid balls={balls} colour={colour} /></div>}
    </Panels>
  );
}

export { PITCH_RUNS_OPTIONS };
