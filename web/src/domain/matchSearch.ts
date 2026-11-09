import { editDistance, cleanSearch, type SearchGender } from './search';
import { eventWords, initialisms, splitGender } from './searchCore';
import shorts from '../data/teamShorts.json';
import { dateText } from './dates';

const SHORTS: Record<string, string | undefined> = shorts;

/** The payload of m/search.json (tools/match_files.py): names sit in lookup lists and every match is a row of small numbers. */
export interface MatchSearchPayload {
  v: 1;
  columns: readonly string[];
  lists: { team: string[]; tour: string[]; season: string[]; venue: string[]; city: string[]; outcome: string[]; stage: string[] };
  rows: number[][];
}

export interface MatchHit {
  id: number;
  date: string;
  teams: [string, string];
  tournament: string;
  season: string;
  venue: string;
  city: string;
  /** "India won by 6 wickets", "Match drawn", "Match tied". */
  result: string;
  kind: 'test' | 'odi' | 't20' | 'hundred';
  /** "Test", "ODI", "T20I" (an international T20), "T20" (a league match) or "The Hundred". */
  format: string;
  female: boolean;
}

/** A word of a match and where it came from: 0 a team or its abbreviation, 1 the competition, 2 the season or a date, 3 the ground, city or stage, 4 men or women. */
export interface PreparedMatch { hit: MatchHit; words: Array<readonly [string, number]>; date: number }

const KINDS = ['test', 'odi', 't20', 'hundred'] as const;

export const formatLabel = (kind: (typeof KINDS)[number], international: boolean): string => (kind === 'test' ? 'Test' : kind === 'odi' ? 'ODI' : kind === 'hundred' ? 'The Hundred' : international ? 'T20I' : 'T20');
const plain = (t: string): string => t.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[.'-]/g, ' ');
const SKIP = new Set(['v', 'vs', 'versus']);

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

function shortResult(winner: string | null, runs: number, wickets: number, outcome: string): string {
  if (outcome === 'draw') return 'Match drawn';
  if (outcome === 'tie') return 'Match tied';
  if (outcome === 'no result') return 'No result';
  if (!winner) return '';
  if (runs >= 0) return `${winner} won by ${plural(runs, 'run')}`;
  if (wickets >= 0) return `${winner} won by ${plural(wickets, 'wicket')}`;
  return `${winner} won`;
}

/** Turns the payload into rows that are quick to match against. Done once, when the list arrives. */
export function prepareMatches(p: MatchSearchPayload): PreparedMatch[] {
  const L = p.lists;
  return p.rows.map((r) => {
    const [id, date, t1, t2, tour, season, venue, city, win, runs, wkts, outcome, kind, female, stage, intl = 0] = r as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number?];
    const s = String(date), iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    const teams: [string, string] = [L.team[t1]!, L.team[t2]!];
    const hit: MatchHit = {
      id, date: iso, teams, tournament: L.tour[tour]!, season: L.season[season]!, venue: L.venue[venue]!, city: L.city[city]!,
      result: shortResult(win === 0 ? teams[0] : win === 1 ? teams[1] : null, runs, wkts, L.outcome[outcome]!), kind: KINDS[kind]!, format: formatLabel(KINDS[kind]!, intl === 1), female: female === 1,
    };
    const field = (text: string, f: number): Array<readonly [string, number]> => plain(text).split(' ').filter(Boolean).map((w) => [w, f] as const);
    const words = [
      ...field([...teams, SHORTS[teams[0]] ?? '', SHORTS[teams[1]] ?? ''].join(' '), 0), ...initialisms(teams[0]).map((w) => [w, 0] as const), ...initialisms(teams[1]).map((w) => [w, 0] as const),
      ...field(hit.tournament, 1), ...eventWords(hit.tournament).filter(([w]) => !hit.tournament.toLowerCase().includes(w)).map(([w]) => [w, 1] as const), ...field(`${hit.season} ${iso.slice(0, 4)} ${iso}`, 2),
      ...field(`${hit.venue} ${hit.city} ${L.stage[stage]!}`, 3), ...field(female ? 'women womens female' : 'men mens male', 4),
    ];
    return { hit, words, date };
  });
}

/** How well a typed word matches one word of a match: 0 exact, 1 a start, 2 inside a longer word, 3 a typo. null when it does not. */
function cost(typed: string, word: string): number | null {
  if (typed === word) return 0;
  if (word.startsWith(typed)) return 1;
  if (typed.length >= 3 && word.includes(typed)) return 2;
  if (typed.length >= 5 && editDistance(typed, word.slice(0, typed.length + 1)) <= 1) return 3;
  return null;
}

/** What a match in a worse field costs on top of how well the word matches: a team beats a competition, which beats a ground. */
const FIELD_PENALTY = [0, 1, 1, 2, 2] as const;

/**
 * Every match for a typed text, best first (Ari, 2026-10-20: typing India lists all of India's matches, and "ind vs aus" every match between them). Every typed word has to match some word of the
 * match (teams and their abbreviations such as RCB or IND, competition, season, ground, city, year, a date, men or women). A word that matches a team beats one that matches a competition or
 * a ground. Ties go to the latest match. With nothing typed, all matches, latest first. Men and women can be told apart with `gender`.
 */
export function findMatches(text: string, matches: readonly PreparedMatch[], gender: SearchGender = 'all'): MatchHit[] {
  const said = splitGender(text);
  if (said.gender) { gender = said.gender; text = said.rest; }
  const typed = plain(cleanSearch(text)).split(' ').filter((w) => w && !SKIP.has(w));
  const pool = gender === 'all' ? matches : matches.filter((m) => (gender === 'women') === m.hit.female);
  if (typed.length === 0) return [...pool].sort((a, b) => b.date - a.date || b.hit.id - a.hit.id).map((m) => m.hit);
  const scored: Array<{ m: PreparedMatch; score: number }> = [];
  for (const m of pool) {
    let score = 0, ok = true;
    for (const t of typed) {
      let best: number | null = null;
      for (const [w, f] of m.words) { const c = cost(t, w); if (c !== null && (best === null || c + FIELD_PENALTY[f]! < best)) best = c + FIELD_PENALTY[f]!; if (best === 0) break; }
      if (best === null) { ok = false; break; }
      score += best;
    }
    if (ok) scored.push({ m, score });
  }
  return scored.sort((a, b) => a.score - b.score || b.m.date - a.m.date || b.m.hit.id - a.m.hit.id).map((s) => s.m.hit);
}

/** The first matches of `findMatches`. */
export function rankMatches(text: string, matches: readonly PreparedMatch[], limit = 8, gender: SearchGender = 'all'): MatchHit[] {
  return findMatches(text, matches, gender).slice(0, limit);
}

/** The line under a hit: the competition and the ground, "Indian Premier League 2008, M Chinnaswamy Stadium". */
export function matchSub(h: MatchHit): string {
  const comp = h.tournament && h.season && !h.tournament.includes(h.season.slice(0, 4)) ? `${h.tournament} ${h.season}` : h.tournament;
  return [comp, h.venue].filter(Boolean).join(', ');
}

/** The same with the date, for places that have one line: "Indian Premier League 2008, M Chinnaswamy Stadium, 18 Apr 2008". */
export function matchLine(h: MatchHit): string {
  return [matchSub(h), dateText(h.date)].filter(Boolean).join(', ');
}
