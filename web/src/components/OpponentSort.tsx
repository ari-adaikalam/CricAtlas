import type { View } from '@/domain/ballFilters';
import type { OpponentSort } from '@/domain/opponents';

/** The header switch of the opponent table: Most balls, Most outs (Most wickets for a bowler) or Fastest scoring. */
export function OpponentSortSwitch({ view, value, onChange }: { view: View; value: OpponentSort; onChange: (next: OpponentSort) => void }) {
  const options: ReadonlyArray<readonly [OpponentSort, string]> = [['balls', 'Most balls'], ['outs', view === 'bowl' ? 'Most wickets' : 'Most outs'], ['rate', 'Fastest scoring']];
  return <span className="sw msw">{options.map(([key, label]) => <button key={key} type="button" className={value === key ? 'on' : undefined} onClick={() => onChange(key)}>{label}</button>)}</span>;
}
