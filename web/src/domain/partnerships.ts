// The Best partnerships tile: the five biggest batting partnerships, or the five bowling pairs with the most wickets together. Everything shown is worked out from counts here,
// so the tile and its tests read the same rules.

/** A batting partnership of the player with one partner, from partnerships_by_player. */
export interface BatPartnership {
  match_id: number;
  innings: number;
  wicket_number: number;
  partner: string;
  date: string;
  venue: string | null;
  opponent: string;
  /** The opponent's team id, for the link. */
  opponent_id?: string | null;
  runs: number;
  balls: number;
  mine_runs: number;
  partner_runs: number;
  /** No wicket ended it: the innings did (or a batter retired), as a not out score is starred. */
  unbroken: boolean;
}

/** A bowling partnership of the player with one partner, from tandems_by_player. */
export interface BowlPartnership {
  match_id: number;
  innings: number;
  partner: string;
  date: string;
  venue: string | null;
  opponent: string;
  /** The opponent's team id, for the link. */
  opponent_id?: string | null;
  balls: number;
  runs: number;
  wickets: number;
  mine_wickets: number;
  partner_wickets: number;
  /** The Hundred counts balls, and an over is five. */
  hundred: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function month(date: string): string {
  const [y, m] = date.split('-');
  const i = Number(m) - 1;
  return y && i >= 0 && i < 12 ? `${MONTHS[i]} ${y}` : date;
}

export function ordinalWicket(n: number): string {
  const r = n % 100;
  return `${n}${r > 10 && r < 14 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
}

/** Overs as the scorecard writes them, from six-ball overs. */
const overs = (balls: number): string => `${Math.floor(balls / 6)}${balls % 6 ? `.${balls % 6}` : ''}`;

export interface PartnershipRow {
  key: string;
  matchId: number;
  /** The big figure: runs (starred when unbroken) or wickets. */
  figure: number;
  star: boolean;
  title: string;
  detail: string;
  /** The detail in three pieces, so the opponent's name can be its own link: `pre`, then "v ", the opponent, then `post`. */
  pre: string;
  post: string;
  opponent: string;
  opponentId: string | null;
  /** The parts of the bar, in order: the player, the partner, and the extras for a batting partnership. */
  parts: Array<{ label: string; value: number; who: 'me' | 'partner' | 'extras' }>;
  total: number;
}

export function batRow(p: BatPartnership): PartnershipRow {
  const extras = Math.max(0, p.runs - p.mine_runs - p.partner_runs);
  return {
    key: `${p.match_id}:${p.innings}:${p.wicket_number}:${p.partner}`, matchId: p.match_id,
    figure: p.runs, star: p.unbroken,
    title: `${ordinalWicket(p.wicket_number)} wicket with ${p.partner}`,
    detail: `${p.balls} ${p.balls === 1 ? 'ball' : 'balls'}, v ${p.opponent}, ${month(p.date)}`,
    pre: `${p.balls} ${p.balls === 1 ? 'ball' : 'balls'}, `, post: `, ${month(p.date)}`, opponent: p.opponent, opponentId: p.opponent_id ?? null,
    parts: [{ label: 'You', value: p.mine_runs, who: 'me' }, { label: p.partner, value: p.partner_runs, who: 'partner' }, ...(extras > 0 ? [{ label: 'Extras', value: extras, who: 'extras' as const }] : [])],
    total: p.runs,
  };
}

export function bowlRow(p: BowlPartnership): PartnershipRow {
  const per = p.hundred ? 5 : 6;
  const econ = p.balls > 0 ? ((p.runs / p.balls) * per).toFixed(2) : '-';
  return {
    key: `${p.match_id}:${p.innings}:${p.partner}:${p.balls}`, matchId: p.match_id,
    figure: p.wickets, star: false,
    title: `${p.wickets === 1 ? 'wicket' : 'wickets'} with ${p.partner}`,
    detail: `${p.hundred ? `${p.balls} balls` : `${overs(p.balls)} overs`}, ${p.runs} runs, econ ${econ}${p.hundred ? ' (5)' : ''}, v ${p.opponent}, ${month(p.date)}`,
    pre: `${p.hundred ? `${p.balls} balls` : `${overs(p.balls)} overs`}, ${p.runs} runs, econ ${econ}${p.hundred ? ' (5)' : ''}, `, post: `, ${month(p.date)}`, opponent: p.opponent, opponentId: p.opponent_id ?? null,
    parts: [{ label: 'You', value: p.mine_wickets, who: 'me' }, { label: p.partner, value: p.partner_wickets, who: 'partner' }],
    total: p.wickets,
  };
}
