'use client';

import type { ReactNode } from 'react';
import { TeamLabel } from '../TeamLinks';
import { useFitRows } from '../useFitRows';
import { useTableMotion } from '../useTableMotion';
import { TeamSwatch } from '../TeamSwatch';

/** One side's panel of a Match details part: its heading, and a scroll area whose rows reveal, stretch to the room and tighten when short (`played` tells a count-up to start). */
export function Pan({ title, team, dataKey, children }: { title: ReactNode; team?: string; dataKey: string; children: (played: boolean) => ReactNode }) {
  const fit = useFitRows<HTMLDivElement>(dataKey, true);
  const { ref, motion, played } = useTableMotion<HTMLDivElement>(dataKey, dataKey, fit);
  return (
    <div className="pan2">
      <h5>{team && <TeamSwatch team={team} />}{team && typeof title === 'string' ? <TeamLabel team={team} text={title} /> : title}</h5>
      <div className="tsc" ref={ref} data-rows={motion}>{children(played)}</div>
    </div>
  );
}
