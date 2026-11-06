// The format chips of the match search (Ari, 2026-10-24): narrow the matches to one format.

export type FormatChip = 'all' | 'test' | 'odi' | 't20i' | 't20';

export const FORMAT_CHIPS: ReadonlyArray<readonly [FormatChip, string]> = [['all', 'All formats'], ['test', 'Test'], ['odi', 'ODI'], ['t20i', 'T20I'], ['t20', 'T20 leagues']];

/** Whether a match, named by its format label (Test, ODI, T20I, T20 or The Hundred), belongs under a chip. A league match is a T20 or The Hundred. */
export function formatFits(chip: FormatChip, format: string): boolean {
  return chip === 'all' || (chip === 't20' ? format === 'T20' || format === 'The Hundred' : format.toLowerCase() === chip);
}
