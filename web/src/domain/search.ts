import { editDistance, initialisms, splitGender } from './searchCore';
export { editDistance };

// Search: what a typed word means. The word is cleaned before it reaches a query, and a hit is described in one line the way the mockup does
// ("Batter, India").

export interface PlayerHit { playerId: string; name: string; country: string | null; role: string | null; first: number | null; last: number | null }
/** A player as the search ranks them: the hit plus the full name and the matches played, which break ties between namesakes. */
export interface Candidate extends PlayerHit { fullName: string | null; matches: number; /** M, F or empty when the data does not say. */ gender?: 'M' | 'F' | '' }

/** Which players or matches a search lists: everyone, men or women (Ari, 2026-10-20). */
export type SearchGender = 'all' | 'men' | 'women';

/** Whether a person of this gender belongs under the choice. A player whose gender the data does not give is in All only. */
export const genderFits = (choice: SearchGender, gender: 'M' | 'F' | '' | undefined): boolean => choice === 'all' || (choice === 'men' ? gender === 'M' : gender === 'F');

/** Letters, digits, spaces, dots, apostrophes and hyphens, at most 40. Anything else (including the wildcards % and _) is dropped. */
export function cleanSearch(text: string): string {
  return text.normalize('NFKC').replace(/[^\p{L}\p{N} .'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

const sentence = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** "Batter, India, 2008 to 2026". Parts the data does not have are left out. */
export function playerLine(hit: PlayerHit): string {
  const years = hit.first === null ? null : hit.last !== null && hit.last !== hit.first ? `${hit.first} to ${hit.last}` : String(hit.first);
  return [hit.role ? sentence(hit.role) : null, hit.country, years].filter(Boolean).join(', ');
}

const plain = (t: string): string => t.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[.'-]/g, ' ');
const words = (t: string): string[] => plain(t).split(' ').filter(Boolean);

/** How well one typed word matches one name word: 0 exact, 1 starts with it, 2 contains it, 3 or 4 a typo. null when it does not match. */
function wordCost(typed: string, name: string): number | null {
  if (typed === name) return 0;
  if (name.startsWith(typed)) return 1;
  if (typed.length >= 3 && name.includes(typed)) return 2;
  const allowed = typed.length >= 7 ? 2 : typed.length >= 4 ? 1 : 0;
  if (allowed === 0) return null;
  // A typo in the first letters of a long word is compared against the same length of the name word, so a half typed word still finds it.
  const dist = Math.min(editDistance(typed, name), name.length > typed.length ? editDistance(typed, name.slice(0, typed.length)) + 1 : Infinity);
  return dist <= allowed ? 2 + dist : null;
}

/**
 * Ranks players for a typed name. Every typed word has to match a different word of the name or full name, exactly, as a start, inside a word, or with a
 * typo ("Rohiit Sharma", "Virat Kohli" for V Kohli). Better matches come first, then the player with more matches, so a well known player beats a namesake.
 * Nothing typed lists the players with most matches.
 */
export function rankPlayers(text: string, candidates: readonly Candidate[], limit = 8, gender: SearchGender = 'all'): PlayerHit[] {
  // A word that says men or women picks the gender, whatever the toggle says.
  const said = splitGender(text);
  if (said.gender) { gender = said.gender; text = said.rest; }
  const typed = words(cleanSearch(text));
  const scored: { c: Candidate; cost: number }[] = [];
  for (const c of candidates) {
    if (!genderFits(gender, c.gender)) continue;
    if (typed.length === 0) { scored.push({ c, cost: 0 }); continue; }
    const shortLetters = new Set([...initialisms(c.name), ...(c.fullName ? initialisms(c.fullName) : [])]);
    const pool = [...new Set([...words(c.name), ...words(c.fullName ?? ''), ...shortLetters])];
    const used = new Set<string>();
    let cost = 0;
    let ok = true;
    for (const t of typed) {
      let best: { w: string; v: number } | null = null;
      for (const w of pool) {
        if (used.has(w)) continue;
        const raw = wordCost(t, w);
        // The short letters of a name never count as an exact word, so "abd" does not put AB Dinda above AB de Villiers on spelling alone: players with more matches win between them.
        const v = raw !== null && shortLetters.has(w) ? Math.max(raw, 1) : raw;
        if (v !== null && (best === null || v < best.v)) best = { w, v };
      }
      if (best === null) { ok = false; break; }
      used.add(best.w); cost += best.v;
    }
    if (ok) scored.push({ c, cost });
  }
  // A well known player is worth about one step of fit over an obscure one: "abd" lists AB de Villiers (610 matches) ahead of a player whose full name merely has the word Abd in it.
  const worth = (x: { c: Candidate; cost: number }): number => x.cost - 0.7 * Math.log10(1 + x.c.matches);
  scored.sort((a, b) => worth(a) - worth(b) || b.c.matches - a.c.matches || a.c.name.localeCompare(b.c.name));
  return scored.slice(0, limit).map(({ c: { playerId, name, country, role, first, last } }) => ({ playerId, name, country, role, first, last }));
}
