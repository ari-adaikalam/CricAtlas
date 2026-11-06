'use client';

import { TeamRef } from './TeamLinks';
import { useChartColours } from './ChartColours';
import { inkFor } from '@/domain/colours';
import { useMatchRowLink } from './useMatchRowLink';
import { batRow, bowlRow, type BatPartnership, type BowlPartnership, type PartnershipRow } from '@/domain/partnerships';
import { CountText } from './charts/CountUp';
import { REVEALED, useTableMotion } from './useTableMotion';
import { useWindowedRows } from './useWindowedRows';

const int = new Intl.NumberFormat('en');
const GREY = '#5E6168';

/**
 * The Best partnerships tile body, as in the player page mockup: every batting partnership, biggest first, or every bowling pair, most wickets together first (the list scrolls). Each row has the
 * figure, who it was with, the balls or overs, the opponent and the month, and one bar that shows how the runs (or wickets) were shared. The bar grows when the tile is on screen.
 */
export function PartnershipsBody({ side, name, bat, bowl }: { side: 'bat' | 'bowl'; name: string; bat: readonly BatPartnership[]; bowl: readonly BowlPartnership[] }) {
  const rowLink = useMatchRowLink();
  const { main, second } = useChartColours();
  const COLOUR = { me: [main, inkFor(main)], partner: [second, inkFor(second)], extras: [GREY, '#fff'] } as const;
  const rows: PartnershipRow[] = side === 'bat' ? bat.map(batRow) : bowl.map(bowlRow);
  const key = `${side}:${rows.map((r) => `${r.key}`).join('|')}`;
  const { ref, motion, played } = useTableMotion<HTMLDivElement>(key, key);
  const win = useWindowedRows<HTMLSpanElement>(rows.length, key, { rows: '.pti', scroller: 'parent' });
  if (rows.length === 0) {
    return side === 'bat'
      ? <div className="thin">No batting partnerships in this format or competition.</div>
      : <div className="thin">No bowling partnerships in this format or competition.</div>;
  }
  const hasExtras = rows.some((r) => r.parts.some((p) => p.who === 'extras'));
  return (
    <div className="ptw" ref={ref} data-rows={motion}>
      <div className="ptl"><span><i style={{ background: main }} />{name}</span><span><i style={{ background: second }} />Partner</span>{hasExtras && <span><i style={{ background: GREY }} />Extras</span>}</div>
      {/* A pair can bowl in two stints in one innings, which share the rest of the key, so a row's key ends with its place. */}
      <div className="ptr">
        <span ref={win.ref} hidden />
        {win.before > 0 && <div data-spacer="" aria-hidden="true" style={{ height: win.before, flex: '0 0 auto' }} />}
        {rows.slice(win.from, win.to).map((r, k) => (
          <div className="pti go" key={`${r.key}#${win.from + k}`} data-late={win.from + k >= REVEALED ? '' : undefined} {...rowLink(r.matchId, r.detail)}>
            <div className="pth">
              <b><CountText value={r.figure} format={(n) => int.format(Math.round(n))} play={played} />{r.star ? '*' : ''}</b>
              <span>{r.title}</span>
              <em>{r.pre}v <TeamRef name={r.opponent} id={r.opponentId} inRow />{r.post}</em>
            </div>
            <div className="stk big ptk">
              {r.parts.filter((p) => p.value > 0).map((p) => (
                <i key={p.who} style={{ width: `${((p.value / r.total) * 100).toFixed(1)}%`, background: COLOUR[p.who][0], color: COLOUR[p.who][1] }} title={`${p.who === 'me' ? name : p.label} ${p.value}`}>
                  {p.value / r.total > 0.1 ? p.value : ''}
                </i>
              ))}
            </div>
          </div>
        ))}
        {win.after > 0 && <div data-spacer="" aria-hidden="true" style={{ height: win.after, flex: '0 0 auto' }} />}
      </div>
    </div>
  );
}
