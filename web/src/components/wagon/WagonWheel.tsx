'use client';

import { ChartTip } from '../ChartTip';
import { useCallback, useEffect, useRef, useState, } from 'react';
import { boundaryFraction, zoneName, type Hand } from '@/domain/wagon';
import type { Shot } from '@/domain/shots';
import type { WagonRuns } from '@/domain/runsFilter';
import { useChartColours } from '../ChartColours';
import { usePlayOnView } from '../charts/usePlayOnView';
import { EmptySlice, TileLoader } from '../states/TileStates';
import type { HoverInfo, View, WagonScene } from './scene';
import styles from './wagon.module.css';
import { TipBody } from '../TipBody';

interface Props {
  /** null while the shots load. */
  shots: readonly Shot[] | null;
  /** The batter's hand, or N for a mix of hands (zones are then numbered, not named). */
  hand: Hand | 'N';
  /** Names the chart for screen readers, such as "Wagon wheel of 5,003 shots". */
  label: string;
  /** The Runs choice. Clicking a legend entry sets it, and clicking the active entry again shows all runs. */
  runs?: WagonRuns;
  onRuns?: (next: WagonRuns) => void;
  /** How much of the data has tracking, such as "Based on 6,956 of 7,100 scoring shots". */
  coverage?: string;
  /** The player the shots belong to. The last shots stay drawn while new ones load, but never for another player. */
  owner?: string;
  /** The active filters, listed when the slice is empty. */
  filters: readonly string[];
  onClear?: () => void;
  /** The camera view, zone totals and Replay driven from outside, so the chart carries no controls, legend or note of its own (the Match page keeps them in a bar above the panels). */
  external?: { view: View; totals: boolean; replay: number };
}

/** Three.js is loaded on demand, so the rest of the page never waits for it. */
export function WagonWheel({ shots, hand, label, coverage, runs, onRuns, owner, filters, onClear, external }: Props) {
  const { main, second } = useChartColours();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<WagonScene | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>('broadcast');
  const [totals, setTotals] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  // While new shots load, the last ones for the same player stay drawn, dimmed, and the scene is kept: a scene made again for every filter change flashed blank, and made a new WebGL context each time
  //A different player's shots are never kept.
  const held = useRef<{ owner: string | undefined; shots: readonly Shot[] } | null>(null);
  if (shots !== null) held.current = { owner, shots };
  const stale = shots === null && held.current !== null && held.current.owner === owner;
  const shown = shots ?? (stale ? held.current!.shots : null);
  const hasShots = shown !== null && shown.length > 0;
  const live = useRef(false);
  if (hasShots) live.current = true;
  const started = live.current;
  // The shots are drawn into the scene as soon as they load, and the draw-on waits until the tile is on screen.
  // Keyed by what is drawn, so a state that was drawn before (a chip that is switched back) is shown at once.
  const signature = shown ? `${owner}|${hand}|${shown.length}|${shown.reduce((a, s) => a + s.x * 7 + s.y * 13 + s.runs + (s.out ? 1000 : 0), 0)}` : 'none';
  const { ref: stageRef, playedKey, repeat } = usePlayOnView<HTMLDivElement>(signature);
  const setStage = useCallback((el: HTMLDivElement | null) => { host.current = el; stageRef(el); }, [stageRef]);

  useEffect(() => {
    if (!started || !host.current) return;
    let cancelled = false;
    let created: WagonScene | null = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    import('./scene')
      .then(({ WagonScene }) => {
        if (cancelled || !host.current) return;
        created = new WagonScene(host.current, { preset: 'wagon', reducedMotion, onHover: setHover });
        scene.current = created;
        setReady(true);
      })
      .catch((error: unknown) => { console.error('Wagon wheel failed to start', error); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; created?.dispose(); scene.current = null; setReady(false); };
  }, [started]);

  useEffect(() => { if (ready && shown) { scene.current?.setColours(main, second); scene.current?.setShots(shown, hand); if (repeat) scene.current?.settle(); } }, [ready, signature, hand, main, second]); // eslint-disable-line react-hooks/exhaustive-deps -- the shots are drawn again when their content changes, not when the same shots arrive in a new array (a new array hid the drawn shots of a panel whose neighbour was changed)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  useEffect(() => { if (ready && playedKey !== null && !repeat) scene.current?.replay(); }, [ready, playedKey]);
  useEffect(() => { if (external) { setView(external.view); setTotals(external.totals); } }, [external?.view, external?.totals]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstReplay = useRef(true);
  useEffect(() => { if (firstReplay.current) { firstReplay.current = false; return; } if (ready) scene.current?.replay(); }, [external?.replay]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) scene.current?.setView(view); }, [ready, view]);
  useEffect(() => { if (ready) scene.current?.setTotals(totals); }, [ready, totals]);

  // Overhead shows the zone totals and Broadcast hides them. The Zone totals button can still switch them on its own.
  function pick(next: View) { setView(next); setTotals(next === 'over'); }

  if (!started) return shown === null ? <TileLoader label={label} /> : <EmptySlice filters={filters} onClear={onClear} />;
  if (failed) return <p className="note">The 3D view could not start in this browser.</p>;

  // The stage stays mounted (hidden) while there is nothing to show, so its scene survives a load or an empty slice.
  return (
    <>
    {shown === null && <TileLoader label={label} />}
    {shown !== null && !hasShots && <EmptySlice filters={filters} onClear={onClear} />}
    <div className={styles.stage} ref={setStage} data-played={playedKey !== null ? 'true' : 'false'} data-stale={stale ? 'true' : undefined} style={hasShots ? undefined : { display: 'none' }} role="img" aria-label={label}>
      {!ready && <TileLoader label={label} />}
      {!external && <div className={styles.controls}>
        <div className={styles.group} role="group" aria-label="Camera view">
          {(['broadcast', 'over'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} className={styles.seg} onClick={() => pick(v)}>{v === 'over' ? 'Overhead' : 'Broadcast'}</button>
          ))}
        </div>
        <button type="button" aria-pressed={totals} className={styles.btn} onClick={() => setTotals((on) => !on)}>Zone totals</button>
        <button type="button" className={styles.btn} onClick={() => scene.current?.replay()}>Replay</button>
      </div>}
      {!external && (
        <ul className={styles.legend}>
          {([['13', '1 to 3', '#9aa7b8', ''], ['4', 'Four', main, styles.square], ['6', 'Six', second, styles.ring], ['out', 'Out', '#fff', '']] as const).map(([value, name, colour, shape]) => (
            <li key={value}>
              <button type="button" className={styles.entry} aria-pressed={runs === value} title={runs === value ? 'Show all runs' : `Show only ${name.toLowerCase()}`} onClick={() => onRuns?.(runs === value ? 'all' : value)}>
                <i className={shape} style={shape === styles.ring ? { borderColor: colour } : { background: colour }} />{name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {coverage && !external && <p className={styles.coverage}>{coverage}</p>}
      {hover && <WagonTip info={hover} hand={hand} />}
    </div>
    </>
  );
}

export function WagonTip({ info, hand }: { info: HoverInfo; hand: Hand | 'N' }) {
  const { shot } = info;
  return (
    <ChartTip x={info.x} y={info.y}>
      <TipBody
        title={shot.out ? 'Out' : `${shot.runs} ${shot.runs === 1 ? 'run' : 'runs'}`}
        rows={[
          { label: 'Shot', value: shot.shot ?? 'Not recorded' },
          { label: 'Region', value: hand === 'N' ? `Zone ${info.zone}` : zoneName(info.zone, hand) },
          ...(shot.bowler ? [{ label: 'Bowler', value: shot.bowler }] : []),
          { label: 'Over', value: `${shot.over}.${shot.ballInOver}` },
          { label: 'Distance', value: `${boundaryFraction(shot.x, shot.y).toFixed(2)} of the boundary` },
        ]}
        note={info.ring ? 'Inside the ring' : undefined}
      />
    </ChartTip>
  );
}
