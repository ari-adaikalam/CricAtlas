import { superInnings, type InningsCard, type MatchBundle } from './match';
import { howOut } from './matchDetails';

/**
 * The Super Over part of Match details. A tied match can be decided by a Super Over, and a tied Super Over by another. The bundle lists the Super Over innings
 * after the match's own, two for each round in the order they were batted, so a round is a pair.
 */

export interface SuperRound { n: number; first: InningsCard; second: InningsCard | null }

export function superRounds(b: MatchBundle): SuperRound[] {
  const all = superInnings(b), rounds: SuperRound[] = [];
  for (let k = 0; k < all.length; k += 2) rounds.push({ n: k / 2 + 1, first: all[k]!, second: all[k + 1] ?? null });
  return rounds;
}

/** "Super Over", or "Super Over 2" when there were several. */
export const roundName = (rounds: readonly SuperRound[], k: number): string => (rounds.length > 1 ? `Super Over ${k + 1}` : 'Super Over');

/** "1.0 overs", "0.4 overs" for a side bowled out early, or "5 balls" in The Hundred. */
export const superOvers = (b: MatchBundle, i: InningsCard): string => (b.match.kind === 'hundred' ? `${i.balls} ${i.balls === 1 ? 'ball' : 'balls'}` : `${i.overs} overs`);

export const superTitle = (b: MatchBundle, i: InningsCard): string => `${i.team} batting, ${i.runs}/${i.wkts} (${superOvers(b, i)})`;

/** The rows of a Super Over scorecard: every batter who came in, with the scorecard wording of how they were out. */
export function superBatters(i: InningsCard): Array<{ id: string | null; name: string; how: string; runs: number; balls: number }> {
  return i.batters.map((c) => ({ id: c.id, name: c.name, how: howOut(c.out), runs: c.runs, balls: c.balls }));
}

/** The bowlers of the innings as one line: "W Mwatile 1.0-0-12-0", or in The Hundred "W Mwatile, 5 balls, 12 runs, 0 wickets". */
export function superBowling(b: MatchBundle, i: InningsCard): string {
  const parts = i.bowlers.map((c) => (b.match.kind === 'hundred'
    ? `${c.name}, ${c.balls} ${c.balls === 1 ? 'ball' : 'balls'}, ${c.runs} ${c.runs === 1 ? 'run' : 'runs'}, ${c.wkts} ${c.wkts === 1 ? 'wicket' : 'wickets'}`
    : `${c.name} ${Math.floor(c.balls / (b.match.ballsPerOver || 6))}.${c.balls % (b.match.ballsPerOver || 6)}-${c.maidens}-${c.runs}-${c.wkts}`));
  return parts.join(', ');
}

/** What the round decided. The side that batted second needed one more than the first scored. */
export function roundResult(rounds: readonly SuperRound[], k: number): string {
  const r = rounds[k]!;
  if (!r.second) return `${r.first.team} scored ${r.first.runs}.`;
  const a = r.first, c = r.second;
  if (a.runs === c.runs) return `Both teams scored ${a.runs}. The Super Over was tied${k < rounds.length - 1 ? ' and another was played' : ''}.`;
  const win = a.runs > c.runs ? a : c, by = Math.abs(a.runs - c.runs);
  return `${a.team} scored ${a.runs}, ${c.team} needed ${a.runs + 1} and made ${c.runs}. ${win.team} won the Super Over by ${by} ${by === 1 ? 'run' : 'runs'}.`;
}
