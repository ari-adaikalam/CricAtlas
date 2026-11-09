'use client';

import { subMarkOf, type SubMark } from '@/domain/match';
import { EntityLink } from './EntityLink';
import { SubArrow } from './MatchMarks';

/** A player's name as it appears in a table: a link to their profile (hover menu) and a green or red arrow when they came into the match or went out of it. */
export function PlayerName({ id, name, marks }: { id: string | null; name: string; marks: Map<string, SubMark> }) {
  const m = subMarkOf(marks, id, name);
  return <span className="nm"><EntityLink entity={{ kind: 'player', id, name }}>{name}</EntityLink>{m && <SubArrow mark={m} />}</span>;
}
