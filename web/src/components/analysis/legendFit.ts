/**
 * Fits the labels of a chart's legend into the room it has. A legend is one row of a key and a label for each line, and its width is worked out from the length of the labels. On a phone the chart is narrow
 * and a long team name ran past the right edge, where the chart cut it off ("Royal Challengers " for "Royal Challengers Bengaluru", "Proj" for "Projected"). The longest label is shortened, with an
 * ellipsis, a letter at a time until the row fits, and never below MIN_LETTERS.
 */
export const CHAR_PX = 6.6;
const MIN_LETTERS = 5;
const GAP = 10;

/** `fixed` is the width of each key and its gap, before the label. Returns the labels to draw. */
export function fitLabels(labels: readonly string[], fixed: readonly number[], room: number): string[] {
  const out = labels.map((l) => l);
  const width = (): number => out.reduce((a, l, i) => a + (fixed[i] ?? 28) + l.length * CHAR_PX + GAP, 0);
  while (width() > room) {
    let longest = -1;
    out.forEach((l, i) => { if (l.length > MIN_LETTERS && (longest < 0 || l.length > out[longest]!.length)) longest = i; });
    if (longest < 0) break;
    const l = out[longest]!;
    out[longest] = `${l.replace(/…$/, '').slice(0, -1)}…`;
  }
  return out;
}
