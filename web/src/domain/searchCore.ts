// One way to read a typed search text, for every search box in the app (Ari, 2026-10-24). A text is a few words in any order, and every word has to match some word of the thing searched: exactly,
// as a start, inside a longer word, as the short letters of a name (rcb, ipl, msd), or with a typo. "A vs B" is two sides. The nine searches that existed (players, teams, tournaments, matches
// and the root pages) each did this a little differently, so a word that worked in one found nothing in another.

import shorts from '../data/teamShorts.json';

/** Letters, digits and spaces, lower case, accents gone. Dots, apostrophes and hyphens become spaces so "de-Villiers" and "O'Brien" match "de villiers" and "o brien". */
export const plain = (t: string): string => t.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[.'’-]/g, ' ').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Edit distance with swapped neighbours counted as one edit, so "rohti" is one step from "rohit". */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2]![j - 2]! + 1);
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

export const JOINERS = new Set(['v', 'vs', 'versus']);

/** The words of a typed text, without the words that only join two sides. */
export function queryTokens(text: string): string[] {
  return plain(text).split(' ').filter((w) => w && !JOINERS.has(w));
}

const WOMEN_WORDS = new Set(['women', 'womens', 'woman', 'female', 'females', 'ladies', 'girls']);
const MEN_WORDS = new Set(['men', 'mens', 'male', 'males', 'boys']);
/** The women's league that goes by a men's league's name: "women ipl" is the Women's Premier League, "women bbl" the WBBL. */
const WOMEN_LEAGUES: Record<string, string> = { ipl: 'wpl', bbl: 'wbbl' };

/**
 * A word that says men or women ("australia women", "womens world cup") is a choice of gender, not a word of a name. It is taken out of the text and returned, so every search narrows to that gender
 * the same way. A text of such words alone ("women") returns an empty rest. Names that merely contain the letters (Mendis, Womersley) are untouched, because only a whole word counts.
 */
export function splitGender(text: string): { rest: string; gender: 'men' | 'women' | null } {
  let gender: 'men' | 'women' | null = null;
  let after = false;
  const rest = plain(text).split(' ').filter((w) => {
    // "women's" reads as "women s", so the s that follows a gender word goes with it.
    const possessive = after && w === 's';
    after = false;
    if (possessive) return false;
    if (WOMEN_WORDS.has(w)) { gender = 'women'; after = true; return false; }
    if (MEN_WORDS.has(w)) { gender = gender ?? 'men'; after = true; return false; }
    return true;
  });
  return { rest: (gender === 'women' ? rest.map((w) => WOMEN_LEAGUES[w] ?? w) : rest).join(' '), gender };
}

/** "ind vs aus" as ["ind", "aus"]; null when the text is not two sides. A side may be several words ("v kohli vs j bumrah"). */
export function splitVersus(text: string): [string, string] | null {
  const parts = plain(text).split(' ');
  const at = parts.findIndex((w, i) => i > 0 && i < parts.length - 1 && JOINERS.has(w));
  if (at < 0) return null;
  // "v kohli" starts with the letter v: only a joiner with words on both sides is a split, and the first one wins.
  return [parts.slice(0, at).join(' '), parts.slice(at + 1).join(' ')];
}

/**
 * The short letters of a name: "Royal Challengers Bengaluru" is rcb, "Indian Premier League" ipl, and "MS Dhoni" is msd because a word of one to three capitals is read letter by letter. Both
 * readings are returned (md and msd for MS Dhoni), longest first.
 */
export function initialisms(name: string): string[] {
  const raw = name.normalize('NFKD').replace(/\p{M}/gu, '').replace(/['’.]/g, '').split(/[\s-]+/).filter(Boolean);
  if (raw.length < 2) return [];
  const first = raw.map((w) => w.charAt(0).toLowerCase()).join('');
  const letters = raw.map((w) => (w.length <= 3 && w === w.toUpperCase() ? w.toLowerCase() : w.charAt(0).toLowerCase())).join('');
  return [...new Set([letters, first])].filter((s) => s.length >= 2).sort((a, b) => b.length - a.length);
}

/** How well one typed word matches one word: 0 exact, 1 a start, 2 inside a longer word, 3 a typo of a long word. null when it does not. */
export function wordCost(typed: string, word: string): number | null {
  if (typed === word) return 0;
  if (word.startsWith(typed)) return 1;
  if (typed.length >= 3 && word.includes(typed)) return 2;
  if (typed.length >= 5 && editDistance(typed, word.slice(0, typed.length + 1)) <= 1) return 3;
  return null;
}

/** A searchable word and what it costs to match it in this field (a team's name is worth more than the ground it played at). */
export type Word = readonly [word: string, penalty: number];

/** The words of a text as searchable words with one penalty. */
export const wordsOf = (text: string, penalty = 0): Word[] => plain(text).split(' ').filter(Boolean).map((w) => [w, penalty] as const);

/** The short letters of a name as words, and every start of them of two letters or more: "abd" is as good a fit for AB de Villiers (abdv) as for AB Dinda (abd). They count as a start, not a guess, so "rcb" finds Royal Challengers Bengaluru as surely as "royal" does. */
export const shortsOf = (name: string, penalty = 0): Word[] => initialisms(name).flatMap((s) => Array.from({ length: s.length - 1 }, (_, i) => [s.slice(0, i + 2), penalty] as const));

/** The best cost of one typed word over a set of words, or null. A cost of exactly 0 stops the search early. */
export function bestCost(typed: string, words: readonly Word[]): number | null {
  let best: number | null = null;
  for (const [w, p] of words) {
    const c = wordCost(typed, w);
    if (c !== null && (best === null || c + p < best)) { best = c + p; if (best === 0) break; }
  }
  return best;
}

/** The total cost of a text for a thing with these words, or null when any typed word finds nothing. Lower is better. */
export function scoreWords(tokens: readonly string[], words: readonly Word[]): number | null {
  let total = 0;
  for (const t of tokens) {
    const c = bestCost(t, words);
    if (c === null) return null;
    total += c;
  }
  return total;
}

// ---- What each kind of thing is searched by ------------------------------------------------------------


const SHORTS: Record<string, string | undefined> = shorts;
/** Short names the emblem list does not have but people type. */
const EXTRA_SHORTS: Record<string, string> = { Afghanistan: 'afg' };

/** Names people still type for a team that the data holds under another name or that has a nickname. */
const TEAM_ALIASES: Record<string, readonly string[]> = {
  'Royal Challengers Bengaluru': ['bangalore'], 'Delhi Capitals': ['daredevils'], 'Punjab Kings': ['kxip', 'kings xi punjab'],
  Australia: ['aussies'], 'New Zealand': ['kiwis', 'blackcaps'], 'West Indies': ['windies'], 'South Africa': ['proteas'],
};

/** A team: its name, any earlier name (a little worse), its short name (IND, RCB) and the short letters of its name. */
export function teamWords(name: string, earlier: readonly string[] = []): Word[] {
  const short = SHORTS[name] ?? EXTRA_SHORTS[name];
  return [...wordsOf(name), ...earlier.flatMap((n) => wordsOf(n, 1)), ...(TEAM_ALIASES[name] ?? []).flatMap((n) => wordsOf(n)), ...(short ? wordsOf(short) : []), ...shortsOf(name)];
}

/** What people call an event for short, on top of the short letters of its name ("wc" for a World Cup). */
const EVENT_ALIASES: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
  [/world cup/i, ['wc']],
  [/t20 world cup/i, ['t20wc', 'wt20']],
  [/champions trophy/i, ['ct']],
  [/asia cup/i, ['asiacup']],
  [/premier league/i, ['pl']],
];

/** A tournament, league or series: its name, the short letters of its name (ipl, bbl) and the short names for it. */
export function eventWords(name: string): Word[] {
  const aliases = EVENT_ALIASES.filter(([re]) => re.test(name)).flatMap(([, a]) => a);
  return [...wordsOf(name), ...shortsOf(name), ...aliases.map((a) => [a, 0] as const)];
}

/** A person: every word of the name and full name, and the short letters of both (msd for MS Dhoni, abd for AB de Villiers). */
export function personWords(name: string, fullName: string | null = null): Word[] {
  return [...wordsOf(name), ...(fullName ? wordsOf(fullName) : []), ...shortsOf(name, 1), ...(fullName ? shortsOf(fullName, 1) : [])];
}
