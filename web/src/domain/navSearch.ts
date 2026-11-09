import type { SearchGender } from './search';
import { queryTokens, splitGender, splitVersus } from './searchCore';
import { teamScore, activeText, type RootTeam } from './teamsRoot';
import { tournamentScore, kindLine } from './tournamentsRoot';
import type { TournamentInfo } from './tournament';

// The nav search box lists players, teams, tournaments and matches for one typed text. Players and matches are ranked in search.ts and matchSearch.ts. Teams and tournaments are few,
// so a name that contains the typed words is enough, and the one with most matches comes first.

const fits = (choice: SearchGender, gender: 'male' | 'female'): boolean => choice === 'all' || (choice === 'men') === (gender === 'male');

/** Teams for a typed text, the best fit first, then the one with most matches (rcb finds Royal Challengers Bengaluru before any team that merely contains the letters). */
export function rankTeams(text: string, teams: readonly RootTeam[], limit: number, gender: SearchGender = 'all'): RootTeam[] {
  const said = splitGender(text);
  if (said.gender) gender = said.gender;
  const tokens = queryTokens(said.rest);
  if (tokens.length === 0) return [];
  return teams.filter((t) => fits(gender, t.gender)).map((t) => ({ t, s: teamScore(t, tokens) })).filter((x): x is { t: RootTeam; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || b.t.matches - a.t.matches).slice(0, limit).map((x) => x.t);
}

export function rankTournaments(text: string, ts: readonly TournamentInfo[], limit: number, gender: SearchGender = 'all'): TournamentInfo[] {
  const said = splitGender(text);
  if (said.gender) gender = said.gender;
  const tokens = queryTokens(said.rest);
  if (tokens.length === 0) return [];
  return ts.filter((t) => fits(gender, t.gender)).map((t) => ({ t, s: tournamentScore(t, tokens) })).filter((x): x is { t: TournamentInfo; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || b.t.matches - a.t.matches).slice(0, limit).map((x) => x.t);
}

/** "Men's national team, 2001 to 2026" or "Women's franchise team, 2015 to 2026". */
export const teamLine = (t: RootTeam): string => `${t.gender === 'female' ? "Women's" : "Men's"} ${t.national ? 'national' : 'franchise'} team, ${activeText(t)}`;
export const tournamentLine = (t: TournamentInfo): string => kindLine(t);

/** The one team a text names best, with how well: 0 is an exact name, short name or short letters, 1 a start. */
export function bestTeam(text: string, teams: readonly RootTeam[], gender: SearchGender = 'all'): { team: RootTeam; score: number } | null {
  const said = splitGender(text);
  if (said.gender) gender = said.gender;
  const tokens = queryTokens(said.rest);
  if (tokens.length === 0) return null;
  let best: { team: RootTeam; score: number } | null = null;
  for (const t of teams) {
    if (!fits(gender, t.gender)) continue;
    const score = teamScore(t, tokens);
    if (score !== null && (best === null || score < best.score || (score === best.score && t.matches > best.team.matches))) best = { team: t, score };
  }
  return best;
}

/** How well the best tournament fits a text: 0 is an exact name, short letters or short name (ipl, wc), 1 a start. null when none fits. */
export function bestTournamentScore(text: string, ts: readonly TournamentInfo[], gender: SearchGender = 'all'): number | null {
  const said = splitGender(text);
  if (said.gender) gender = said.gender;
  const tokens = queryTokens(said.rest);
  if (tokens.length === 0) return null;
  let best: number | null = null;
  for (const t of ts) { if (!fits(gender, t.gender)) continue; const s = tournamentScore(t, tokens); if (s !== null && (best === null || s < best)) best = s; }
  return best;
}

/** What "ind vs aus" or "kohli vs bumrah" is asking for: two teams or two players, with the address of their Compare page. */
export interface PairHit { kind: 'teams' | 'players'; a: { id: string; name: string }; b: { id: string; name: string }; href: string }
export type PairPlayer = { id: string; name: string };

export const pairHref = (kind: PairHit['kind'], a: string, b: string): string => `/compare/${kind}?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;

/**
 * Two sides, each resolved to a team when it names one well (an exact name, short name or start such as ind, rcb, aus), otherwise to a player. Two teams offer Compare teams, two players
 * Compare players, and a mix offers nothing. `player` finds the best player for one side.
 */
export async function pairOf(
  text: string, teams: readonly RootTeam[], gender: SearchGender, player: (side: string) => Promise<{ id: string; name: string } | null>,
): Promise<PairHit | null> {
  const sides = splitVersus(text);
  if (!sides) return null;
  const [ta, tb] = [bestTeam(sides[0], teams, gender), bestTeam(sides[1], teams, gender)];
  if (ta && tb && ta.score <= 1 && tb.score <= 1 && ta.team.id !== tb.team.id) {
    return { kind: 'teams', a: { id: ta.team.id, name: ta.team.name }, b: { id: tb.team.id, name: tb.team.name }, href: pairHref('teams', ta.team.id, tb.team.id) };
  }
  if ((ta && ta.score <= 1) || (tb && tb.score <= 1)) return null;
  const [pa, pb] = await Promise.all([player(sides[0]), player(sides[1])]);
  return pa && pb && pa.id !== pb.id ? { kind: 'players', a: pa, b: pb, href: pairHref('players', pa.id, pb.id) } : null;
}
