// The second filter row: Phase, Super Overs, Innings, Wickets down, Result, and the opponent (Batter hand and Batter on
// the Bowling view).
// They narrow the balls that every tile reads. An option is greyed only when the data has no balls for it together with the other choices.

import { isKnownType } from './bowlerType';

export type View = 'bat' | 'bowl';
export type SuperOvers = 'excluded' | 'included' | 'only';

export interface BallFilters {
  /** all, powerplay, middle, death, rest (The Hundred), or band0 to band4 (Tests, 20 overs each). */
  phase: string;
  superOvers: SuperOvers;
  /** all, or 1 to 4 (the innings number). Limited overs use 1 and 2. */
  innings: string;
  /** any, low (0 to 2 fallen), mid (3 to 5), high (6 or more). */
  wickets: string;
  /** any, won, lost, draw. Relative to the player's own team. */
  result: string;
  /** Batting hand of the batters a bowler faced: any, right or left. Bowling view only. */
  hand: string;
  /** Bowler type on the Batting view: all, pace, spin or one label (see bowlerType.ts). */
  type: string;
  /** One opponent, by player id: the bowler a batter faced, or the batter a bowler bowled to. Empty is all. */
  opponent: string;
}

export const DEFAULT_BALL_FILTERS: BallFilters = { phase: 'all', superOvers: 'excluded', innings: 'all', wickets: 'any', result: 'any', hand: 'any', type: 'all', opponent: '' };

export type BallFilterKey = keyof BallFilters;
/** The filters whose counts the page keeps in the combination table. Hand and opponent narrow the table itself. */
export const COMBO_KEYS = ['phase', 'superOvers', 'innings', 'wickets', 'result'] as const satisfies readonly BallFilterKey[];
export const OPPONENT_ID = /^[0-9a-f]{8}$/;
export interface Option { value: string; label: string }

/** One group of balls with the same values of every filter, and how many there are. The page asks for this table once and works out the rest. */
export interface Combo {
  phase: string | null;
  band: number;
  superOver: boolean;
  innings: number;
  wickets: 'low' | 'mid' | 'high';
  result: 'won' | 'lost' | 'draw' | 'other';
  balls: number;
}

export const isDefault = (f: BallFilters, key: BallFilterKey): boolean => f[key] === DEFAULT_BALL_FILTERS[key];
export const anySet = (f: BallFilters): boolean => (Object.keys(DEFAULT_BALL_FILTERS) as BallFilterKey[]).some((k) => !isDefault(f, k));

export const BAND_LABELS = ['Overs 1 to 20', 'Overs 21 to 40', 'Overs 41 to 60', 'Overs 61 to 80', 'Overs 81 or more'];
export const WICKET_LABELS: Record<string, string> = { any: 'Any', low: '0 to 2', mid: '3 to 5', high: '6 or more' };

/** The options of one filter. Tests use overs bands in place of phases, since the data has no sessions or days. */
export function options(key: BallFilterKey, view: View, test: boolean): Option[] {
  switch (key) {
    case 'phase': return test
      ? [{ value: 'all', label: 'All overs' }, ...BAND_LABELS.map((label, i) => ({ value: `band${i}`, label }))]
      : [{ value: 'all', label: 'All phases' }, { value: 'powerplay', label: 'Powerplay' }, { value: 'middle', label: 'Middle overs' }, { value: 'death', label: 'Death overs' }, { value: 'rest', label: 'Rest of innings' }];
    case 'superOvers': return [{ value: 'excluded', label: 'Excluded' }, { value: 'included', label: 'Included' }, { value: 'only', label: 'Only' }];
    case 'innings': return test
      ? [{ value: 'all', label: 'All innings' }, ...['1st', '2nd', '3rd', '4th'].map((n, i) => ({ value: String(i + 1), label: `${n} innings` }))]
      : [{ value: 'all', label: 'All innings' }, { value: '1', label: view === 'bat' ? 'Batting first' : 'Bowling first' }, { value: '2', label: view === 'bat' ? 'Chasing' : 'Defending' }];
    case 'wickets': return Object.entries(WICKET_LABELS).map(([value, label]) => ({ value, label }));
    case 'hand': return [{ value: 'any', label: 'All batters' }, { value: 'right', label: 'Right-hand' }, { value: 'left', label: 'Left-hand' }];
    case 'type': return [];
    case 'opponent': return [];
    case 'result': return [{ value: 'any', label: 'Any result' }, { value: 'won', label: 'Team won' }, { value: 'lost', label: 'Team lost' }, ...(test ? [{ value: 'draw', label: 'Draw' }] : [])];
  }
}

/**
 * The options to list. Phase follows the format: The Hundred has Powerplay and Rest of innings only, the other limited-overs formats have
 * Powerplay, Middle and Death. This is the format's own definition, so those options are left out, not greyed.
 */
export function visibleOptions(key: BallFilterKey, view: View, test: boolean, combos: readonly Combo[] | null): Option[] {
  const all = options(key, view, test);
  if (key !== 'phase' || test) return all;
  const has = (phase: string): boolean => combos?.some((c) => c.phase === phase) ?? false;
  const hundred = has('rest');
  const standard = has('middle') || has('death');
  return all.filter((o) => (o.value === 'rest' ? hundred : (o.value === 'middle' || o.value === 'death') ? standard || !hundred : true));
}

/** Whether a group of balls passes the filters, leaving out one filter when asked. Tests have no phase and no Super Overs. */
export function passes(c: Combo, f: BallFilters, test: boolean, skip?: BallFilterKey): boolean {
  if (skip !== 'phase' && f.phase !== 'all' && (test ? f.phase !== `band${c.band}` : f.phase !== c.phase)) return false;
  if (!test && skip !== 'superOvers' && (f.superOvers === 'excluded' ? c.superOver : f.superOvers === 'only' ? !c.superOver : false)) return false;
  if (skip !== 'innings' && f.innings !== 'all' && f.innings !== String(c.innings)) return false;
  if (skip !== 'wickets' && f.wickets !== 'any' && f.wickets !== c.wickets) return false;
  if (skip !== 'result' && f.result !== 'any' && f.result !== c.result) return false;
  return true;
}

export const countBalls = (combos: readonly Combo[], f: BallFilters, test: boolean): number =>
  combos.reduce((sum, c) => sum + (passes(c, f, test) ? c.balls : 0), 0);

/** The reason when no other choice is to blame: the scope itself has no such balls. */
export const NO_BALLS = '';

const VALUE_LABEL = (key: BallFilterKey, value: string, view: View, test: boolean): string => {
  const label = options(key, view, test).find((o) => o.value === value)?.label ?? value;
  // "0 to 2" alone says nothing in a reason, so the wickets say what they are.
  return key === 'wickets' ? `${label} wickets down` : label;
};

/**
 * Why an option is greyed, or null when it can be chosen. Blocking comes from the data: the option has no balls together with the other
 * choices. The reason names the first choice that, taken away, would bring balls back.
 */
export function blockedBy(combos: readonly Combo[], f: BallFilters, key: BallFilterKey, value: string, view: View, test: boolean): string | null {
  const probe = { ...f, [key]: value } as BallFilters;
  if (countBalls(combos, probe, test) > 0) return null;
  const others = COMBO_KEYS.filter((k) => k !== key && !isDefault(f, k));
  for (const k of others) {
    const without = { ...probe, [k]: DEFAULT_BALL_FILTERS[k] } as BallFilters;
    if (countBalls(combos, without, test) > 0) return VALUE_LABEL(k, f[k], view, test).toLowerCase();
  }
  return others.length ? VALUE_LABEL(others[0]!, f[others[0]!], view, test).toLowerCase() : NO_BALLS;
}

/** Drops any choice that has no balls under the others, so changing the Format never leaves a filter pointing at nothing. */
export function normaliseBall(combos: readonly Combo[], f: BallFilters, test: boolean): BallFilters {
  let out = f;
  // Later filters in the row give way first, so Phase, which names what the player is looking at, stays.
  // A hand or opponent with no balls in this scope (a changed format, say) goes back to all.
  if (combos.length === 0 && (f.hand !== 'any' || f.type !== 'all' || f.opponent !== '')) out = { ...out, hand: 'any', type: 'all', opponent: '' };
  for (const key of [...COMBO_KEYS].reverse()) {
    if (isDefault(out, key)) continue;
    const ok = combos.some((c) => passes(c, out, test));
    if (!ok) out = { ...out, [key]: DEFAULT_BALL_FILTERS[key] };
  }
  return out;
}

/**
 * Moving between Tests and the other formats changes what Phase means (overs bands or phases) and Super Overs and Draw exist in only one of them,
 * so those restart. Wickets down, a first or second innings and a won or lost result carry over, as the filter rules asks.
 */
export function resetForFormat(f: BallFilters): BallFilters {
  return { ...DEFAULT_BALL_FILTERS, hand: f.hand, type: f.type, opponent: f.opponent, wickets: f.wickets, innings: f.innings === '1' || f.innings === '2' ? f.innings : 'all', result: f.result === 'draw' ? 'any' : f.result };
}

const PARAM: Record<BallFilterKey, string> = { phase: 'phase', superOvers: 'so', innings: 'inn', wickets: 'wk', result: 'res', hand: 'bh', type: 'bt', opponent: 'vs' };
const SAFE = /^[a-z0-9]{1,12}$/;

/** URL parameters are untrusted: a value that is not one of the known options is ignored. */
export function ballFiltersFromParams(params: URLSearchParams, view: View, test: boolean): BallFilters {
  const out: BallFilters = { ...DEFAULT_BALL_FILTERS };
  for (const key of COMBO_KEYS) {
    const raw = params.get(PARAM[key]);
    if (raw !== null && SAFE.test(raw) && options(key, view, test).some((o) => o.value === raw)) (out as unknown as Record<string, string>)[key] = raw;
  }
  const hand = params.get(PARAM.hand);
  if (view === 'bowl' && hand !== null && options('hand', view, test).some((o) => o.value === hand)) out.hand = hand;
  const type = params.get(PARAM.type);
  if (view === 'bat' && type !== null && isKnownType(type)) out.type = type;
  const opponent = params.get(PARAM.opponent);
  if (opponent !== null && OPPONENT_ID.test(opponent)) out.opponent = opponent;
  return out;
}

export function ballFiltersToParams(f: BallFilters, into: URLSearchParams): void {
  for (const key of Object.keys(PARAM) as BallFilterKey[]) if (!isDefault(f, key)) into.set(PARAM[key], f[key]);
}
