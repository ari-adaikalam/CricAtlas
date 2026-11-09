'use client';

import { TeamSwatch } from './TeamSwatch';
import { TeamLabel } from './TeamLinks';
import { ChartTip } from './ChartTip';
import { TipBody } from './TipBody';
import { useState } from 'react';
import { usePlayOnView } from './charts/usePlayOnView';
import { useChartColours } from './ChartColours';
import { runSources, type PhaseCounts, type PhaseFormat, type SourceRow, type SourceSegment } from '@/domain/phases';
import { bowlRunSources, type BowlSourceCounts } from '@/domain/bowling';

const int = new Intl.NumberFormat('en');

/**
 * The Run sources tile body, as in the player page mockup: a bar for the whole slice and one for each phase, split into singles, twos, threes, fours
 * and sixes by the runs they scored. The bars grow from the left when they appear. A tooltip names the segment under the pointer.
 */
export function RunSourcesBody({ rows, format, note }: { rows: readonly PhaseCounts[]; format: PhaseFormat; note?: string }) {
  const hundred = rows.some((r) => r.key === 'rest') && !rows.some((r) => r.key === 'middle' || r.key === 'death');
  return <SourcesChart sources={runSources(rows, format, hundred)} empty="No runs off the bat in these balls." note={note} />;
}

/** The bowling Length by phase body: the same bars, each a mix of the six lengths. The text of the tooltip talks about balls, not runs. */
export function LengthMixBody({ sources, note }: { sources: readonly SourceRow[]; note?: string }) {
  return <SourcesChart sources={sources} empty="No balls with a length in this slice." note={note} unit="balls" />;
}

/** The bowling version: the same bars with an Extras segment (wides and no-balls). */
export function ConcededBody({ rows, format, note }: { rows: readonly BowlSourceCounts[]; format: PhaseFormat; note?: string }) {
  const hundred = rows.some((r) => r.key === 'rest') && !rows.some((r) => r.key === 'middle' || r.key === 'death');
  return <SourcesChart sources={bowlRunSources(rows, format, hundred)} empty="No runs conceded in these balls." note={note} />;
}

export function SourcesChart({ sources, empty, note, unit = 'runs' }: { sources: readonly SourceRow[]; empty: string; note?: string; unit?: 'runs' | 'balls' }) {
  const { main, second } = useChartColours();
  // Fours take the main colour and sixes the second, the same as the wagon wheel and the pitch map, so a shot has one colour on every chart.
  const paint = (key: string, fallback: string): string => (key === 'Fours' ? main : key === 'Sixes' ? second : fallback);
  const [tip, setTip] = useState<{ row: string; segment: SourceSegment; x: number; y: number } | null>(null);
  const { ref, played } = usePlayOnView<HTMLDivElement>(sources.map((r) => `${r.key}:${r.runs}`).join('|'));
  if (sources.length === 0) return <div className="thin">{empty}</div>;
  return (
    <>
      {note && <div className="slnote">{note}</div>}
      <div className={`sources${played ? ' play' : ''}`} ref={ref}>
        {sources.map((row) => (
          <div className="srow" key={row.key}>
            <span className="rsn">{row.team && <TeamSwatch team={row.team} size={20} />}{row.team ? <TeamLabel team={row.team} text={row.name} /> : row.name}</span>
            <div className="stk grow" role="img" aria-label={`${row.name}: ${row.segments.map((s) => `${s.label} ${Math.round(s.share * 100)} percent`).join(', ')}`} onPointerLeave={() => setTip(null)}>
              {row.segments.map((s) => (
                <i key={s.label} style={{ width: `${(s.share * 100).toFixed(1)}%`, background: paint(s.label, s.colour) }} onPointerMove={(e) => setTip({ row: row.name, segment: s, x: e.clientX, y: e.clientY })}>
                  {s.share > 0.07 ? `${Math.round(s.share * 100)}%` : ''}
                </i>
              ))}
            </div>
          </div>
        ))}
        <div className="sleg">{(sources[0]?.segments ?? []).map((s) => <span key={s.label}><i style={{ background: paint(s.label, s.colour) }} />{s.label}</span>)}</div>
      </div>
      {tip && (
        <ChartTip x={tip.x} y={tip.y}>
          <TipBody
            title={tip.segment.label} sub={tip.row}
            rows={unit === 'balls'
              ? [{ label: 'Share of balls with a length', value: `${Math.round(tip.segment.share * 1000) / 10}%` }, { label: 'Balls', value: int.format(tip.segment.balls) }]
              : [{ label: 'Share of runs', value: `${Math.round(tip.segment.share * 1000) / 10}%` }, { label: 'Runs', value: int.format(tip.segment.runs) }, { label: 'Balls', value: int.format(tip.segment.balls) }]}
          />
        </ChartTip>
      )}
    </>
  );
}
