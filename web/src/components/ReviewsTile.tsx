'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { summariseReviews, type ReviewGroup, type ReviewRow } from '@/domain/reviews';
import { ChartTip } from './ChartTip';
import { usePlayOnView } from './charts/usePlayOnView';
import { useChartColours } from './ChartColours';
import { TipBody } from './TipBody';

const int = new Intl.NumberFormat('en');
const GREY = '#5E6168';

/**
 * The bowling Reviews tile body, as in the mockup: two rows, the reviews by the bowler's own side and the reviews against the bowler, each a bar of the reviews struck down,
 * upheld and lost on the umpire's call, then two numbers: the wickets the bowler's side won on review and the wickets the bowler kept when the batter's review was lost.
 * Upheld means the review was won (the on-field decision was overturned) and struck down means it was lost, for either side.
 * For a batter the rows are the batter's own side and the reviews against the batter, and the two numbers are the dismissals that a won review overturned and the dismissals
 * the fielding side won on review.
 */
export function ReviewsBody({ groups, note, view = 'bowl' }: { groups: readonly ReviewGroup[]; note?: string; view?: 'bat' | 'bowl' }) {
  const { main, second } = useChartColours();
  const summary = useMemo(() => summariseReviews(groups), [groups]);
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const { ref, played } = usePlayOnView<HTMLDivElement>(`${summary.rows[0].total}:${summary.rows[1].total}`);
  const bat = view === 'bat';
  const rows = bat ? [summary.rows[1], summary.rows[0]] : summary.rows;
  const parts = (r: ReviewRow) => [
    { key: 'lost', label: 'Struck down', colour: main, n: r.struckDown, hint: 'The review was lost and the on-field decision stood' },
    { key: 'won', label: 'Upheld', colour: second, n: r.upheld, hint: 'The review was won and the on-field decision was overturned' },
    { key: 'uc', label: "Umpire's call", colour: GREY, n: r.umpiresCall, hint: "The review was lost on the umpire's call" },
  ];
  if (summary.rows[0].total + summary.rows[1].total === 0) return <div className="thin">No reviews on this {bat ? "batter's" : "bowler's"} deliveries in this slice. Matches without review records are left out.</div>;
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className={`rvw rvwb${played ? ' play' : ''}`} ref={ref} onPointerLeave={() => setTip(null)}>
        {rows.map((r) => (
          <div className="rvr" key={r.side}>
            <div className="rvh">{r.side === 'bowling' ? (bat ? 'Against the batter' : "By the bowler's side") : bat ? "By the batter's side" : 'Against the bowler'}<span>{r.total} {r.total === 1 ? 'review' : 'reviews'}</span></div>
            <div className="stk big grow">
              {r.total === 0 ? <i style={{ width: '100%', background: '#2a2a2a' }} /> : parts(r).filter((p) => p.n > 0).map((p) => (
                <i key={p.key} style={{ width: `${((p.n / r.total) * 100).toFixed(1)}%`, background: p.colour, color: p.key === 'uc' ? '#fff' : '#04243A' }}
                  onPointerMove={(e) => setTip({ x: e.clientX, y: e.clientY, body: <TipBody title={p.label} rows={[{ label: 'Reviews', value: `${p.n} of ${r.total}` }, { label: 'Share', value: `${((100 * p.n) / r.total).toFixed(0)}%` }]} note={p.hint} /> })}>
                  {p.n / r.total > 0.12 ? p.n : ''}
                </i>
              ))}
            </div>
            <div className="sleg">{parts(r).map((p) => <span key={p.key}><i style={{ background: p.colour }} />{p.label} {p.n}</span>)}</div>
          </div>
        ))}
        <div className="kgrid">
          {bat ? (
            <>
              <div className="kn"><b>{int.format(summary.rows[1].upheld)}</b><span>dismissals overturned on review (the batter's side won a review of an out)</span></div>
              <div className="kn"><b>{int.format(summary.wicketsGiven)}</b><span>dismissals given on review (the fielding side won a review of a not out)</span></div>
            </>
          ) : (
            <>
              <div className="kn"><b>{int.format(summary.wicketsGiven)}</b><span>wickets given on review (the bowler's side won a review of a not out)</span></div>
              <div className="kn"><b>{int.format(summary.wicketsKept)}</b><span>wickets kept by a review (the batter's review of an out was lost)</span></div>
            </>
          )}
        </div>
      </div>
      {tip && <ChartTip x={tip.x} y={tip.y}>{tip.body}</ChartTip>}
    </>
  );
}
