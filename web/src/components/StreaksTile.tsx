'use client';

import { monthOf, type StreakCard } from '@/domain/streaks';
import { useChartColours } from './ChartColours';
import { useTableMotion } from './useTableMotion';

const span = (from: string, to: string): string => (monthOf(from) === monthOf(to) ? monthOf(from) : `${monthOf(from)} to ${monthOf(to)}`);

/**
 * The Streaks tile body, as in the player page mockup: a card for each condition with the longest streak and the five
 * longest as bars (the longest in the chart's main colour). A condition that never held says why instead of showing a zero.
 */
export function StreaksBody({ cards }: { cards: readonly StreakCard[] }) {
  const { main, second } = useChartColours();
  const key = cards.map((c) => `${c.label}:${c.top.map((r) => r.len).join(',')}`).join('|');
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key);
  return (
    <div className="skg" ref={ref} data-rows={motion}>
      {cards.map((c) => {
        if (!c.best) {
          return <div className="skc skz" key={c.label}><div className="skl"><div className="skh"><span>{c.label}</span></div><div className="skb"><b>-</b><span>{c.why}</span></div></div></div>;
        }
        const most = c.best.len;
        return (
          <div className="skc" key={c.label}>
            <div className="skl">
              <div className="skh"><span>{c.label}</span></div>
              <div className="skb"><b>{c.best.len}</b><span>longest, {span(c.best.from, c.best.to)}</span></div>
            </div>
            <div className="skt">
              {c.top.map((r, i) => (
                <div className="skr" key={`${r.from}-${r.len}`} title={`${r.len}: ${span(r.from, r.to)}`}>
                  <i style={{ height: `${Math.max(8, (r.len / most) * 100)}%`, background: i === 0 ? main : second }} />
                  <span>{r.len}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
