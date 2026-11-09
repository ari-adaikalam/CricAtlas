// Text that is cut short with "…" always has its full text on hover (Ari, 2026-10-24). Whether a piece of text is cut is a question of boxes, which a test can ask of plain numbers.

export interface TextBox {
  textOverflow: string;
  /** `-webkit-line-clamp` as the browser reports it: "none" or a number of lines. */
  lineClamp: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

/** True when the text in this box is cut short and the page draws "…" (or a line clamp) for it. A pixel of rounding is not a cut. */
export function isTruncated(b: TextBox): boolean {
  if (b.lineClamp !== 'none' && b.lineClamp !== '' && b.scrollHeight > b.clientHeight + 1) return true;
  return b.textOverflow === 'ellipsis' && b.scrollWidth > b.clientWidth + 1;
}

/** The words of the tip: the text with its white space tidied. Empty text has no tip. */
export function tipFor(text: string | null | undefined): string | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}
