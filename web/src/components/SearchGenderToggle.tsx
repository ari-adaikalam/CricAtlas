'use client';

import type { SearchGender } from '@/domain/search';

const OPTIONS: ReadonlyArray<readonly [SearchGender, string]> = [['all', 'All'], ['men', 'Men'], ['women', 'Women']];

/** The row at the top of a search panel that narrows the results to men or women. */
export function SearchGenderToggle({ value, onChange }: { value: SearchGender; onChange: (next: SearchGender) => void }) {
  return (
    <div className="rgen" role="group" aria-label="Show">
      {OPTIONS.map(([v, label]) => (
        <button key={v} type="button" className={value === v ? 'on' : undefined} aria-pressed={value === v} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}
