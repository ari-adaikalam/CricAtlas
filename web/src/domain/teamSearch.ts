import type { SearchGender } from './search';
import { queryTokens, scoreWords, splitGender, teamWords } from './searchCore';

// The type-ahead that changes the team. It reads t/index.json (every team), so typing needs no query engine.

export interface TeamHit { id: string; name: string; gender: 'male' | 'female'; national: boolean; matches: number; firstYear: number; lastYear: number; league: string | null }

const LEAGUES: Record<string, string> = { bbl: 'BBL', bpl: 'BPL', cpl: 'CPL', hnd: 'The Hundred', ilt: 'ILT20', ipl: 'IPL', lpl: 'LPL', mlc: 'MLC', psl: 'PSL', sat: 'SA20', wbb: 'WBBL', wpl: 'WPL' };
export const leagueOf = (id: string): string | null => LEAGUES[id.split('|')[1] ?? ''] ?? null;

export const INTERNATIONAL = 'International';
/** Whether a team belongs to a competition chip: International is the national teams, any other chip is a league. No chip means every team. */
export const inCompetition = (t: TeamHit, competition: string | null): boolean => competition === null || (competition === INTERNATIONAL ? t.national : t.league === competition);

export interface CompetitionChip { name: string; teams: number; /** Teams of the chosen gender: 0 dims the chip. */ shown: number }
/** International first, then the leagues with the most teams. A chip with no team of the chosen gender stays in the row, dimmed. */
export function competitionChips(teams: readonly TeamHit[], gender: SearchGender): CompetitionChip[] {
  const by = new Map<string, CompetitionChip>();
  for (const t of teams) {
    const name = t.national ? INTERNATIONAL : t.league;
    if (!name) continue;
    const e = by.get(name) ?? { name, teams: 0, shown: 0 };
    e.teams += 1; if (genderFits(gender, t.gender)) e.shown += 1;
    by.set(name, e);
  }
  return [...by.values()].sort((a, b) => Number(b.name === INTERNATIONAL) - Number(a.name === INTERNATIONAL) || b.teams - a.teams || a.name.localeCompare(b.name));
}

export function genderFits(choice: SearchGender, g: 'male' | 'female'): boolean { return choice === 'all' || (choice === 'men' ? g === 'male' : g === 'female'); }

/**
 * The teams for a typed text, best first. A name that starts with the text comes first, then a word that starts with it, then a name that contains it, and the short letters of the emblem
 * (ind, rcb) count as a start. Teams with more matches come first among equals. With no text the teams with most matches are listed.
 */
export function findTeams(text: string, teams: readonly TeamHit[], gender: SearchGender = 'all', competition: string | null = null): TeamHit[] {
  const said = splitGender(text);
  if (said.gender) { gender = said.gender; text = said.rest; }
  const tokens = queryTokens(text);
  const pool = teams.filter((t) => genderFits(gender, t.gender) && inCompetition(t, competition));
  if (tokens.length === 0) return [...pool].sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name)).slice(0, 200);
  return pool.map((t) => ({ t, s: scoreWords(tokens, teamWords(t.name)) })).filter((x): x is { t: TeamHit; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || b.t.matches - a.t.matches || a.t.name.localeCompare(b.t.name)).map((x) => x.t);
}

/** "Men's national team, 2001 to 2026" or "Women's franchise team in the WPL, 2023 to 2026". */
export function teamLine(t: TeamHit): string {
  const who = `${t.gender === 'female' ? "Women's" : "Men's"} ${t.national ? 'national team' : `franchise team${t.league ? ` in the ${t.league}` : ''}`}`;
  return `${who}, ${t.firstYear === t.lastYear ? t.firstYear : `${t.firstYear} to ${t.lastYear}`}`;
}
