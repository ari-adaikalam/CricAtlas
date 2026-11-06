// The rules of the phone check page: what counts as a problem, and how a walk is summed up. Pure functions, so they are tested without a browser. The page itself
// (components/dev/PhoneCheck.dev.tsx) reads the real layout and uses these.

/** The smallest side of a tap target, in CSS pixels. */
export const MIN_TAP = 44;
/** A tile whose content fills less than this share of its height has unwanted empty space. */
export const MIN_FILL = 0.5;
/** Overflow of a pixel or two is rounding, not a fault. */
export const SLACK = 1.5;

export type IssueKind = 'sideways' | 'tap' | 'past-panel' | 'clipped' | 'empty' | 'scrolls' | 'replay';

export interface Issue { kind: IssueKind; where: string; detail: string }
export interface Step { name: string; issues: Issue[] }

export interface Report {
  page: string;
  viewport: [number, number];
  pixelRatio: number;
  userAgent: string;
  at: string;
  steps: Step[];
  counts: Record<IssueKind, number>;
  pass: boolean;
}

export const KINDS: readonly IssueKind[] = ['sideways', 'tap', 'past-panel', 'clipped', 'empty', 'scrolls', 'replay'];

export function tapTooSmall(width: number, height: number): boolean {
  return width < MIN_TAP - SLACK || height < MIN_TAP - SLACK;
}

/** How much of a tile its content fills, from the bottom of the lowest content: 0 for nothing, 1 for all of it. */
export function fillRatio(tileTop: number, tileHeight: number, contentBottom: number): number {
  if (tileHeight <= 0) return 1;
  return Math.max(0, Math.min(1, (contentBottom - tileTop) / tileHeight));
}

export function isEmptyTile(ratio: number, holdsRows: boolean): boolean {
  return !holdsRows && ratio < MIN_FILL;
}

/** Whether a box pokes out of a panel by more than rounding. */
export function passesEdge(inner: { left: number; right: number; top: number; bottom: number }, panel: { left: number; right: number; top: number; bottom: number }): boolean {
  return inner.right > panel.right + SLACK || inner.left < panel.left - SLACK || inner.bottom > panel.bottom + SLACK || inner.top < panel.top - SLACK;
}

export function summarise(page: string, viewport: [number, number], pixelRatio: number, userAgent: string, steps: Step[], at = new Date().toISOString()): Report {
  // The same element is seen at every tile stop, so a problem counts once however many stops show it.
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<IssueKind, number>;
  const seen = new Set<string>();
  for (const s of steps) for (const i of s.issues) { const key = `${i.kind}|${i.where}|${i.detail}`; if (!seen.has(key)) { seen.add(key); counts[i.kind] += 1; } }
  return { page, viewport, pixelRatio, userAgent, at, steps, counts, pass: KINDS.every((k) => counts[k] === 0) };
}

/** One line for each kind that has a problem, then the first few places, for the screen and for a person reading the file. */
export function reportLines(r: Report, perKind = 6): string[] {
  const out = [`${r.pass ? 'PASS' : 'FAIL'}  ${r.page}  ${r.viewport[0]}x${r.viewport[1]}  ${r.steps.length} steps`];
  for (const k of KINDS) {
    if (!r.counts[k]) continue;
    out.push(`${k}: ${r.counts[k]}`);
    let shown = 0;
    const seen = new Set<string>();
    for (const s of r.steps) for (const i of s.issues) { const key = `${i.where}|${i.detail}`; if (i.kind === k && shown < perKind && !seen.has(key)) { seen.add(key); out.push(`  ${s.name}: ${i.where} ${i.detail}`); shown += 1; } }
  }
  return out;
}

/** A file name for a report: the page, then the time, with nothing that is not a letter, digit or dash. */
export function reportFileName(page: string, at: string): string {
  const slug = page.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'page';
  return `${at.replace(/[^0-9]/g, '').slice(0, 14)}-${slug}.json`;
}
