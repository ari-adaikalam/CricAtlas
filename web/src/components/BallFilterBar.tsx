import { useContext, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BallSlot } from './ballSlot';
import { CountedText } from './charts/CountedText';
import type { Opponent } from '@/data/scope';
import { typeOptions } from '@/domain/bowlerType';
import {
  anySet, blockedBy, countBalls, DEFAULT_BALL_FILTERS, NO_BALLS, options, visibleOptions, type BallFilterKey, type BallFilters, type Combo, type View,
} from '@/domain/ballFilters';
import { OpponentBox } from './OpponentBox';

const int = new Intl.NumberFormat('en');

interface Props {
  view: View;
  test: boolean;
  /** null while the counts load: the row stays and its options are not blocked yet. */
  combos: readonly Combo[] | null;
  /** null while the list of opponents loads. */
  opponents: readonly Opponent[] | null;
  /** Balls by first bowling style, for the Bowler type options. null while it loads. */
  styleCounts: ReadonlyMap<string, number> | null;
  value: BallFilters;
  onChange: (next: BallFilters) => void;
  /** The totals under these filters, such as '348 runs, avg 6.7', shown before the ball count and a divider. While they load the caller passes null and the bar keeps showing the last ones, so the filters beside them never move. */
  totals?: string | null;
}

// The labels of the mockup (BFL): the Bowling view says Batter hand. Both views say Wickets down. Tests would say Session, but the data has no sessions, so overs bands stand in.
const labelOf = (key: BallFilterKey, view: View, test: boolean): string => ({
  phase: test ? 'Overs' : 'Phase', superOvers: 'Super Overs', innings: 'Innings', wickets: 'Wickets down', result: 'Result',
  hand: 'Batter hand', type: 'Bowler type', opponent: view === 'bat' ? 'Bowler' : 'Batter',
}[key]);
// The mockup gives each select a fixed width by this name (data-bf), so the row never changes size when an option's text does.
const WIDTH_KEY: Record<BallFilterKey, string> = { phase: 'phase', superOvers: 'so', innings: 'inn', wickets: 'wk', result: 'res', hand: 'type', type: 'type', opponent: 'type' };
const WICKETS_TIP: Record<View, string> = {
  bat: "Wickets the batter's team had already lost when the ball was faced",
  bowl: 'Wickets the batting side had already lost when the ball was bowled',
};

/**
 * The second filter row of the mockup. An option is greyed only when the
 * data has no balls for it together with the other choices, and says which choice it does not go with.
 */
export function BallFilterBar({ view, test, combos, opponents, styleCounts, value, onChange, totals }: Props) {
  const keys: BallFilterKey[] = test ? ['phase', 'innings', 'wickets', 'result'] : ['phase', 'superOvers', 'innings', 'wickets', 'result'];
  const counted = combos ? countBalls(combos, value, test) : null;
  // A filter change empties the totals for a moment. The last ones stay on screen (dimmed) so the strip keeps its width, and dashes show only before anything has loaded.
  const last = useRef<{ totals: string | null; balls: number | null }>({ totals: null, balls: null });
  if (totals) last.current.totals = totals;
  if (counted !== null) last.current.balls = counted;
  const loading = !totals || counted === null;
  const shownTotals = totals ?? last.current.totals;
  const balls = counted ?? last.current.balls;
  const slot = useContext(BallSlot);
  const chosenOpponent = value.opponent !== '';

  const select = (key: BallFilterKey) => (
    <label className="fl2" key={key}>
      <span title={key === 'wickets' ? WICKETS_TIP[view] : undefined}>{labelOf(key, view, test)}</span>
      <select data-bf={WIDTH_KEY[key]} aria-label={labelOf(key, view, test)} value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })}>
        {visibleOptions(key, view, test, combos).map((o) => {
          const reason = combos && o.value !== value[key] ? blockedBy(combos, value, key, o.value, view, test) : null;
          return <option key={o.value} value={o.value} disabled={reason !== null}>{o.label}{reason === null ? '' : reason === NO_BALLS ? ' (no balls)' : ` (not with ${reason})`}</option>;
        })}
      </select>
    </label>
  );

  const bar = (
    <div className="bfbar">
      {view === 'bat' ? (
        <label className="fl2"><span>Bowler type</span>
          <select data-bf="type" aria-label="Bowler type" value={value.type} disabled={chosenOpponent} title={chosenOpponent ? 'Set by the bowler chosen' : undefined} onChange={(e) => onChange({ ...value, type: e.target.value })}>
            {typeOptions(styleCounts).map((o) => <option key={o.value} value={o.value} disabled={styleCounts !== null && o.balls === 0 && o.value !== value.type}>{o.label}{styleCounts !== null && o.balls === 0 && o.value !== 'all' ? ' (no balls)' : ''}</option>)}
          </select>
        </label>
      ) : (
        <label className="fl2"><span>Batter hand</span>
          <select data-bf="type" aria-label="Batter hand" value={value.hand} disabled={chosenOpponent} title={chosenOpponent ? 'Set by the batter chosen' : undefined} onChange={(e) => onChange({ ...value, hand: e.target.value })}>
            {options('hand', view, test).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}
      <OpponentBox label={view === 'bat' ? 'Bowler' : 'Batter'} opponents={opponents} value={value.opponent} onChange={(id) => onChange({ ...value, opponent: id, hand: id ? 'any' : value.hand, type: id ? 'all' : value.type })} />
      {keys.map(select)}
      <span className="bfg">
        {(totals !== undefined) && <><span className={`bft${loading ? ' wait' : ''}`}>{shownTotals === null ? '- avg -' : <CountedText text={shownTotals} />}</span><span className="bfsep" aria-hidden="true">|</span></>}
        <span className={`bfn${loading ? ' wait' : ''}`}><b>{balls === null ? '-' : <CountedText text={int.format(balls)} />}</b> balls{anySet(value) && <button type="button" className="mini" onClick={() => onChange(DEFAULT_BALL_FILTERS)}>Clear</button>}</span>
      </span>
    </div>
  );
  return slot ? createPortal(bar, slot) : bar;
}
