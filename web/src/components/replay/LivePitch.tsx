'use client';

import { useEffect, useRef, useState } from 'react';
import type { Cell } from '@/domain/pitch';
import { useChartColours } from '../ChartColours';
import type { CellHover, PitchScene } from '../wagon/pitchScene';
import { PitchTip } from '../wagon/PitchMap';
import styles from '../wagon/pitch.module.css';

/** The scene is rebuilt for every set of cells, so a fast replay changes it at most this often and always ends on the latest. */
const REBUILD_MS = 120;

/** The pitch map of the Replay: the balls bowled so far in the innings, in the overhead plan with a count in each length and line, changing as the playhead moves. */
export function LivePitch({ cells, label }: { cells: readonly Cell[]; label: string }) {
  const { main, second } = useChartColours();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<PitchScene | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<CellHover | null>(null);

  useEffect(() => {
    if (!host.current) return;
    let cancelled = false;
    let created: PitchScene | null = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    import('../wagon/pitchScene')
      .then(({ PitchScene }) => {
        if (cancelled || !host.current) return;
        created = new PitchScene(host.current, { reducedMotion, onHover: setHover, onView: () => undefined, refined: true });
        scene.current = created;
        setReady(true);
      })
      .catch((error: unknown) => { console.error('Replay pitch map failed to start', error); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; created?.dispose(); scene.current = null; setReady(false); };
  }, []);

  const last = useRef(0);
  useEffect(() => {
    if (!ready) return;
    const apply = (): void => {
      last.current = performance.now();
      scene.current?.setColours(main, second);
      scene.current?.setCells(cells);
      // The finished plan, at once: the map changes ball by ball and must not start its side-on pass each time.
      scene.current?.settle();
    };
    const wait = REBUILD_MS - (performance.now() - last.current);
    if (wait <= 0) { apply(); return; }
    const id = window.setTimeout(apply, wait);
    return () => window.clearTimeout(id);
  }, [ready, cells, main, second]);

  if (failed) return <p className="thin">The 3D view could not start in this browser.</p>;
  return (
    <div className={styles.stage} ref={host} style={{ flex: '1 1 100%' }} role="img" aria-label={label}>
      <ul className={styles.legend} aria-label="Pitch map key">
        {([['Dot ball', '#6f7b8d', true], ['1 to 3 runs', '#9aa7b8', false], ['Four', main, false], ['Six', second, false], ['Wicket', '#fff', false]] as const).map(([name, colour, ring]) => (
          <li key={name}><i className={ring ? styles.ring : undefined} style={ring ? { borderColor: colour } : { background: colour }} />{name}</li>
        ))}
      </ul>
      {hover && <PitchTip hover={hover} />}
    </div>
  );
}
