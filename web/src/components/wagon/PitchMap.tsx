'use client';

import { ChartTip } from '../ChartTip';
import { usePlayGroup } from './playGroup';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PitchRuns } from '@/domain/runsFilter';
import { BANDS, LANES, cellsFrom, controlShare, summarise, type PitchRow, type Summary } from '@/domain/pitch';
import { useChartColours } from '../ChartColours';
import { usePlayOnView } from '../charts/usePlayOnView';
import { EmptySlice, TileLoader } from '../states/TileStates';
import type { CellHover, PitchScene, PitchView } from './pitchScene';
import styles from './pitch.module.css';
import { TipBody } from '../TipBody';

interface Props {
  /** null while the balls load. */
  rows: readonly PitchRow[] | null;
  /** Balls with a length and line, and all legal balls bowled, for the note. */
  tracked: number;
  bowled: number;
  /** The Runs choice. Clicking a legend entry sets it, and clicking the active entry again shows all balls. */
  runs: PitchRuns;
  onRuns: (next: PitchRuns) => void;
  /** The player the balls belong to. The last balls stay drawn while new ones load, but never for another player. */
  owner?: string;
  filters: readonly string[];
  onClear?: () => void;
  /** The map alone, with no table or note beside it, for a panel that is not the width of a whole tile (the Match page). The table's numbers are in the tooltips. */
  compact?: boolean;
  /** The camera view and Replay driven from outside, with no controls or legend on the map (the Match page keeps them in a bar above the panels). */
  external?: { view: PitchView; replay: number };
  /** The redesigned map (see PitchScene), signed off by Ari on 2026-10-24 for every pitch map. */
  refined?: boolean;
}

const int = new Intl.NumberFormat('en');
const percent = (s: Pick<Summary, 'inControl' | 'controlKnown'>): string => { const v = controlShare(s); return v === null ? '-' : `${v}%`; };

/** Three.js is loaded on demand, so the rest of the page never waits for it. */
export function PitchMap({ rows, tracked: trackedNow, bowled: bowledNow, runs, onRuns, owner, filters, onClear, compact = false, external, refined = true }: Props) {
  const { main, second } = useChartColours();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<PitchScene | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<PitchView>('side');
  const [hover, setHover] = useState<CellHover | null>(null);
  const [rowHover, setRowHover] = useState(-1);
  // While new balls load, the last ones for the same player stay drawn, dimmed, with their table and note, and the scene is kept: a scene made again for every filter change flashed blank and
  // made a new WebGL context each time. A different player's balls are never kept.
  const held = useRef<{ owner: string | undefined; rows: readonly PitchRow[]; tracked: number; bowled: number } | null>(null);
  if (rows !== null) held.current = { owner, rows, tracked: trackedNow, bowled: bowledNow };
  const stale = rows === null && held.current !== null && held.current.owner === owner;
  const shown = rows ?? (stale ? held.current!.rows : null);
  const tracked = stale ? held.current!.tracked : trackedNow, bowled = stale ? held.current!.bowled : bowledNow;
  const cells = useMemo(() => (shown ? cellsFrom(shown) : []), [shown]);
  const { bands, total } = useMemo(() => summarise(cells), [cells]);
  const hasBalls = cells.length > 0;
  const live = useRef(false);
  if (hasBalls) live.current = true;
  const started = live.current;
  const signature = shown ? `${owner}|${cells.length}|${total.balls}|${total.runs}|${total.wickets}|${total.fours}|${total.sixes}` : 'none';
  const { ref: stageRef, playedKey, repeat } = usePlayOnView<HTMLDivElement>(signature);
  const { group, id: memberId } = usePlayGroup();
  const setStage = useCallback((el: HTMLDivElement | null) => { host.current = el; stageRef(el); }, [stageRef]);

  useEffect(() => {
    if (!started || !host.current) return;
    let cancelled = false;
    let created: PitchScene | null = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    import('./pitchScene')
      .then(({ PitchScene }) => {
        if (cancelled || !host.current) return;
        created = new PitchScene(host.current, { reducedMotion, onHover: setHover, onView: setView, refined });
        scene.current = created;
        setReady(true);
      })
      .catch((error: unknown) => { console.error('Pitch map failed to start', error); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; created?.dispose(); scene.current = null; setReady(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [started]);

  useEffect(() => { if (ready) { scene.current?.setColours(main, second); scene.current?.setCells(cells); if (scene.current) group?.plan(memberId, scene.current.plannedSeconds); if (repeat) scene.current?.settle(); } }, [ready, signature, main, second]); // eslint-disable-line react-hooks/exhaustive-deps -- as in the wagon wheel: new content, not a new array of the same content
  useEffect(() => { group?.state(memberId, started, ready); }, [group, memberId, started, ready]);
  useEffect(() => {
    if (!ready || playedKey === null || repeat) return;
    const play = (seconds: number): void => { scene.current?.replay(seconds > 0 ? seconds : undefined); };
    if (group) group.arrive(memberId, play); else play(0);
  }, [ready, playedKey]); // eslint-disable-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  // A Replay pressed on one map of a pair plays both, in the same time.
  useEffect(() => { if (ready) group?.register(memberId, (seconds) => { setView('side'); scene.current?.replay(seconds > 0 ? seconds : undefined); }); }, [group, memberId, ready]);
  useEffect(() => { if (ready) scene.current?.highlight(hover?.band ?? rowHover); }, [ready, hover, rowHover]);
  useEffect(() => { if (external && ready) { setView(external.view); scene.current?.setView(external.view); } }, [external?.view, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstReplay = useRef(true);
  useEffect(() => { if (firstReplay.current) { firstReplay.current = false; return; } if (ready) { setView('side'); scene.current?.replay(); } }, [external?.replay]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!started) return shown === null ? <TileLoader label="Pitch map" /> : <EmptySlice filters={filters} onClear={onClear} />;
  if (failed) return <p className="thin">The 3D view could not start in this browser.</p>;

  const lit = hover?.band ?? rowHover;
  // The map stays mounted (hidden) while there is nothing to show, so its scene survives a load or an empty slice.
  return (
    <>
    {shown === null && <TileLoader label="Pitch map" />}
    {shown !== null && !hasBalls && <EmptySlice filters={filters} onClear={onClear} />}
    <div className={styles.split} data-stale={stale ? 'true' : undefined} style={hasBalls ? undefined : { display: 'none' }}>
      <div className={styles.stage} data-compact={compact ? 'true' : undefined} style={compact ? { flex: '1 1 100%' } : undefined} ref={setStage} data-played={playedKey !== null ? 'true' : 'false'} role="img" aria-label={`Pitch map of ${int.format(tracked)} balls by length and line`}>
        {!ready && <TileLoader label="Pitch map" />}
        {!external && <ul className={styles.legend}>
          {([['dot', 'Dot ball', 'ring', '#6f7b8d'], ['13', '1 to 3 runs', '', '#9aa7b8'], ['4', 'Four', '', main], ['6', 'Six', '', second], ['wicket', 'Wicket', '', '#fff']] as const).map(([value, name, shape, colour]) => (
            <li key={value}>
              <button type="button" className={styles.entry} aria-pressed={runs === value} title={runs === value ? 'Show all balls' : `Show only ${name.toLowerCase()}s`} onClick={() => onRuns(runs === value ? 'all' : value)}>
                <i className={shape ? styles.ring : undefined} style={shape ? { borderColor: colour } : { background: colour }} />{name}
              </button>
            </li>
          ))}
        </ul>}
        {!external && <div className={styles.controls}>
          <div className={styles.group} role="group" aria-label="Camera view">
            {(['side', 'over'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} className={styles.seg} onClick={() => { setView(v); scene.current?.setView(v); }}>{v === 'over' ? 'Overhead' : 'Side-on'}</button>
            ))}
          </div>
          <button type="button" className={styles.btn} onClick={() => { if (group) group.replayAll(); else { setView('side'); scene.current?.replay(); } }}>Replay</button>
        </div>}
        {hover && <PitchTip hover={hover} />}
      </div>
      {!compact && <div className={styles.side}>
        <table className={styles.table}>
          <thead><tr><th scope="col">Length</th><th scope="col">Balls</th><th scope="col">Dots</th><th scope="col">4s</th><th scope="col">6s</th><th scope="col">Runs</th><th scope="col">Wkts</th><th scope="col">Control</th></tr></thead>
          <tbody>
            {BANDS.map((b, i) => {
              const s = bands[i]; if (!s || s.balls === 0) return null;
              return (
                <tr key={b.key} className={`row${lit === i ? ` ${styles.hl}` : ''} ${styles.row}`} onMouseEnter={() => setRowHover(i)} onMouseLeave={() => setRowHover(-1)}>
                  <td>{b.full}</td><td>{int.format(s.balls)}</td><td>{int.format(s.dots)}</td><td>{s.fours}</td><td>{s.sixes}</td><td>{int.format(s.runs)}</td><td>{s.wickets}</td><td>{percent(s)}</td>
                </tr>
              );
            })}
            <tr className={styles.total}><td>All lengths</td><td>{int.format(total.balls)}</td><td>{int.format(total.dots)}</td><td>{total.fours}</td><td>{total.sixes}</td><td>{int.format(total.runs)}</td><td>{total.wickets}</td><td>{percent(total)}</td></tr>
          </tbody>
        </table>
        <p className={styles.note}>
          {int.format(tracked)} of {int.format(bowled)} balls have a length and line. Each ball sits in its length band and line lane, as the batter sees it. The paths between the hand and the stumps are illustrative, because the data has the band, not an exact bounce point. Wides and no-balls are not balls bowled.
        </p>
      </div>}
    </div>
    </>
  );
}

export function PitchTip({ hover }: { hover: CellHover }) {
  const { cell, band } = hover;
  if (!cell) {
    return <ChartTip x={hover.x} y={hover.y}><TipBody title={BANDS[band]?.full ?? ''} note="Move overhead to see each line" /></ChartTip>;
  }
  return (
    <ChartTip x={hover.x} y={hover.y}>
      <TipBody
        title={`${BANDS[cell.band]?.full}, ${LANES[cell.lane]?.label.toLowerCase()}`}
        rows={[
          { label: 'Balls', value: int.format(cell.balls) },
          { label: 'Runs', value: int.format(cell.runs) },
          { label: 'Wickets', value: String(cell.wickets) },
          { label: 'Dots', value: int.format(cell.dots) },
          { label: 'Fours', value: String(cell.fours) },
          { label: 'Sixes', value: String(cell.sixes) },
          { label: 'In control', value: percent(cell) },
        ]}
      />
    </ChartTip>
  );
}
