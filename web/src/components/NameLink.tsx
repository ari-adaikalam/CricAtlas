'use client';

import type { ReactNode } from 'react';
import type { EntityRef } from '@/domain/links';
import { EntityLink } from './EntityLink';

/**
 * A name inside a row that already does something when it is clicked (a row that picks an opponent, say): the name leads to its page and the rest of the row keeps its job (Ari, 2026-10-22). The click
 * and the key presses of the name stop here, so the row does not also act on them.
 */
export function NameLink({ entity, children }: { entity: EntityRef; children: ReactNode }) {
  return <span className="nml" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><EntityLink entity={entity}>{children}</EntityLink></span>;
}
