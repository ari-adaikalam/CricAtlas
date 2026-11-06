// The pairs the Compare page shows as its "vs" example, a different one on each visit (Ari, 2026-10-25). Players are named by the Cricsheet player id, teams by the team id of the data.
// Each pair has two players who are really compared (a batting rivalry, a pair of fast bowlers, two women's allrounders), so the picture says what the page is for.

export interface PlayerPair { a: string; b: string }
export interface TeamPair { a: string; b: string; an: string; bn: string }

export const PLAYER_PAIRS: readonly PlayerPair[] = [
  { a: 'ba607b88', b: '30a45b23' }, // V Kohli v SPD Smith
  { a: 'a343262c', b: 'd027ba9f' }, // JE Root v KS Williamson
  { a: '740742ef', b: '8a75e999' }, // RG Sharma v Babar Azam
  { a: '462411b3', b: '3fb19989' }, // JJ Bumrah v MA Starc
  { a: 'be150fc8', b: '5d2eda89' }, // EA Perry v S Mandhana
  { a: 'e087956b', b: '5f547c8b' }, // BA Stokes v Rashid Khan
  { a: '4a8a2e3b', b: 'c4487b84' }, // MS Dhoni v AB de Villiers
];

export const TEAM_PAIRS: readonly TeamPair[] = [
  { a: 'india|intl|male', b: 'australia|intl|male', an: 'India', bn: 'Australia' },
  { a: 'england|intl|male', b: 'pakistan|intl|male', an: 'England', bn: 'Pakistan' },
  { a: 'south-africa|intl|male', b: 'new-zealand|intl|male', an: 'South Africa', bn: 'New Zealand' },
  { a: 'india|intl|female', b: 'australia|intl|female', an: 'India', bn: 'Australia' },
  { a: 'mumbai-indians|ipl|male', b: 'chennai-super-kings|ipl|male', an: 'Mumbai Indians', bn: 'Chennai Super Kings' },
  { a: 'sydney-sixers|bbl|male', b: 'melbourne-stars|bbl|male', an: 'Sydney Sixers', bn: 'Melbourne Stars' },
  { a: 'west-indies|intl|male', b: 'sri-lanka|intl|male', an: 'West Indies', bn: 'Sri Lanka' },
];

/** A pair picked at random. Only the browser calls this (the server draws the page with no pair). */
export function randomPair<T>(pairs: readonly T[]): T { return pairs[Math.floor(Math.random() * pairs.length)]!; }
