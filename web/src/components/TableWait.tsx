'use client';

import { useEffect, useState } from 'react';
import { StatePanel } from './states/StatePanel';

/**
 * What stands where the rows will be while a root page's list is still loading (Ari, 2026-10-24). The page itself is already there: its heading, search, filters and the table's header
 * have opened. The "Setting the field" loader shows only if the data takes longer than a moment, so a quick answer never flashes it.
 */
export function TableWait({ after = 350 }: { after?: number }) {
  const [late, setLate] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setLate(true), after); return () => window.clearTimeout(t); }, [after]);
  return (
    <div className="twait" aria-busy="true">
      {late && <StatePanel kind="loading" size="tile" title="Setting the field" text="Loading the data. The first load takes a second or two." />}
    </div>
  );
}
