import type { ReactNode } from 'react';

const GRID = 'rgba(255,255,255,.12)', MUTED = '#A8A8A8';

/**
 * What every chart shows when it has nothing to plot (an average with no wicket, a wickets chart that is all zero): the frame of the chart as it would be drawn, with the grid lines, the axis
 * label and the labels along the bottom, and no numbers on the vertical axis, since there is no scale. The message sits in a small pill over the grid so it reads. One look for every chart
 * (Ari, 2026-10-19).
 */
export function EmptyPlot({ left, right, top, bottom, h, axisLabel, message, xLabels, xTitle }: {
  left: number; right: number; top: number; bottom: number; h: number; axisLabel: string; message: string;
  xLabels: ReadonlyArray<{ x: number; text: string }>; xTitle?: string;
}): ReactNode {
  const width = Math.round(message.length * 7.4 + 32);
  const mid = (top + bottom) / 2, centre = (left + right) / 2;
  return (
    <>
      {[0, 1, 2, 3].map((k) => <line key={`grid${k}`} x1={left} x2={right} y1={bottom + (k * (top - bottom)) / 3} y2={bottom + (k * (top - bottom)) / 3} stroke={GRID} />)}
      {xLabels.map((l, i) => <text key={`x${i}`} x={l.x} y={h - 18} fill={MUTED} fontSize="11" textAnchor="middle">{l.text}</text>)}
      {xTitle && <text x={centre} y={h - 3} fill={MUTED} fontSize="11" textAnchor="middle">{xTitle}</text>}
      <text x={12} y={mid} fill={MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 12 ${mid})`}>{axisLabel}</text>
      <rect x={centre - width / 2} y={mid - 18} width={width} height={36} rx="18" fill="#232323" stroke="rgba(255,255,255,.14)" />
      <text x={centre} y={mid + 5} fill="#D8D8D8" fontSize="13" textAnchor="middle">{message}</text>
    </>
  );
}
