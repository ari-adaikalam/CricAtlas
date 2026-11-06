'use client';

import { TeamEmblem } from './TeamEmblem';

/** A team's emblem before its name in a heading, the same on every view of the Match page (Ari, 2026-10-22). */
export function TeamSwatch({ team, size = 24 }: { team: string; size?: number }) {
  return <span className="tsw"><TeamEmblem team={team} size={size} /></span>;
}
