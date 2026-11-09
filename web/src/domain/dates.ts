const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A date as "9 Sep 2026" from an ISO date. Written by hand, because the browsers' own formatting spells September "Sept" in some and "Sep" in others. */
export function dateText(iso: string, parts: { month?: boolean; year?: boolean } = { month: true, year: true }): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return [String(d), parts.month ? MONTHS[m - 1] : null, parts.year ? String(y) : null].filter(Boolean).join(' ');
}
