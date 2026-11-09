'use client';

import { useEffect, useRef, useState } from 'react';
import type { Shot } from '@/domain/shots';
import { useChartColours } from '../ChartColours';
import type { HoverInfo, WagonScene } from '../wagon/scene';
import { WagonTip } from '../wagon/WagonWheel';
import styles from '../wagon/wagon.module.css';

/**
 * The wagon wheel of the Replay: the shots of one innings, ground view, drawn as the playhead reaches them (the newest grows out of the batter, the rest stay). `shots` must be the same array
 * for as long as the innings is the same. The mixed hands of a side's batters mean the zones are numbered, not named.
 */
export function LiveWagon({ shots, count, travelMs, label }: { shots: readonly Shot[]; count: number; travelMs: number; label: string }) {
  const { main, second } = useChartColours();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<WagonScene | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const latest = useRef({ count, travelMs });
  latest.current = { count, travelMs };

  useEffect(() => {
    if (!host.current) return;
    let cancelled = false;
    let created: WagonScene | null = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    import('../wagon/scene')
      .then(({ WagonScene }) => {
        if (cancelled || !host.current) return;
        created = new WagonScene(host.current, { preset: 'wagon', reducedMotion, onHover: setHover });
        scene.current = created;
        setReady(true);
      })
      .catch((error: unknown) => { console.error('Replay wagon wheel failed to start', error); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; created?.dispose(); scene.current = null; setReady(false); };
  }, []);

  // A new innings: the scene is built again with its shots, and the playhead is put back where it is.
  useEffect(() => {
    if (!ready || !scene.current) return;
    scene.current.setColours(main, second);
    scene.current.setLive(shots, 'N');
    scene.current.setPlayhead(latest.current.count, 0);
  }, [ready, shots, main, second]);
  useEffect(() => { if (ready) scene.current?.setPlayhead(count, travelMs); }, [ready, count, travelMs]);

  if (failed) return <p className="note">The 3D view could not start in this browser.</p>;
  return (
    <div className={styles.stage} ref={host} role="img" aria-label={label}>
      <ul className={styles.legend} aria-label="Key to the shots">
        {([['1 to 3', '#9aa7b8', ''], ['Four', main, styles.square], ['Six', second, styles.ring], ['Out', '#fff', '']] as const).map(([name, colour, shape]) => (
          <li key={name}><i className={shape} style={shape === styles.ring ? { borderColor: colour } : { background: colour }} />{name}</li>
        ))}
      </ul>
      {hover && <WagonTip info={hover} hand="N" />}
    </div>
  );
}
