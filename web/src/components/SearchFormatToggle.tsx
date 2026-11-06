'use client';

import { FORMAT_CHIPS, type FormatChip } from '@/domain/matchFormat';
import { ChipScroller } from './ChipScroller';

/** The format chips of the match search panel (All formats, Test, ODI, T20I, T20 leagues), in a row that scrolls sideways. */
export function SearchFormatToggle({ value, onChange }: { value: FormatChip; onChange: (next: FormatChip) => void }) {
  return (
    <ChipScroller label="formats" watch={FORMAT_CHIPS.length}>
      {FORMAT_CHIPS.map(([v, label]) => (
        <button key={v} type="button" className={value === v ? 'on' : undefined} aria-pressed={value === v} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(v)}>{label}</button>
      ))}
    </ChipScroller>
  );
}
