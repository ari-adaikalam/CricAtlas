'use client';

import { StatePanel, stateStyles } from './StatePanel';

const LISTY = /table|bowlers|batters|opponents|phases|mix|types|dismissals|reviews|best|career|partnership|streak|trophies|milestones|pace|sources|runs conceded|against/i;

/**
 * A tile that has no answer yet shows a skeleton, as video sites do: grey shapes in the layout the answer will have, with a soft shimmer. A chart tile gets a plot with a title line and an axis line;
 * a list or table tile gets a header and rows. It replaced the spinning ball (Ari, 2026-10-20: no ball). It shows at once, since a wait before it left the tile blank for a moment (Ari, 2026-10-18).
 * The shimmer stops with reduced motion.
 */
export function TileLoader({ label }: { label: string }) {
  const rows = LISTY.test(label);
  return (
    <div role="status" aria-label={`${label}, loading`} className={`${stateStyles.skel} ${rows ? stateStyles.skelRows : stateStyles.skelChart}`} style={{ flex: '1 1 0', width: '100%', height: '100%', minHeight: 96 }}>
      {rows ? (
        <>
          <i className={stateStyles.head} />
          {[92, 78, 86, 64, 72, 58].map((w, k) => <span key={k}><i style={{ width: `${w * 0.36}%` }} /><i style={{ width: `${w * 0.5}%` }} /></span>)}
        </>
      ) : (
        <>
          <i style={{ width: '34%', height: 12 }} />
          <div className={stateStyles.plot}><b /><b /><b /><b /><u>{[38, 62, 46, 78, 54, 30, 66, 44].map((h, k) => <i key={k} style={{ height: `${h}%` }} />)}</u></div>
          <i style={{ width: '70%', height: 10, alignSelf: 'center' }} />
        </>
      )}
    </div>
  );
}

/** Shown in place of a chart when the filters leave nothing to draw. Names the filters and offers the way out. */
/** `onClear` is left out when nothing is set to clear (the filters are already the defaults), so no button that does nothing shows. */
export function EmptySlice({ filters, onClear }: { filters: readonly string[]; onClear?: () => void }) {
  return (
    <StatePanel kind="empty" size="tile" title="No balls in this slice" text="Nothing matches these filters. Clear a filter to get the ball rolling.">
      {filters.length > 0 && <p className={stateStyles.filters}>{filters.join(' · ')}</p>}
      {onClear && <button type="button" className={stateStyles.btn} onClick={onClear}>Clear filters</button>}
    </StatePanel>
  );
}

/** Shown in place of a tracking chart when the balls are there but carry no tracking. Nothing is guessed to fill it. */
export function NoTracking() {
  return <StatePanel kind="empty" size="tile" title="No tracking for these balls" text="These balls come with no line, length or shot details." />;
}
