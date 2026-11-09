import type { Shot } from './shots';

// The Runs filter of the wagon wheel and the pitch map (Ari, 2026-10-18). It is not in the mockups. Clicking an entry of a chart's legend sets it.

export type WagonRuns = 'all' | '13' | '1' | '2' | '3' | '4' | '6' | 'out';

export const WAGON_RUNS_OPTIONS: ReadonlyArray<{ value: WagonRuns; label: string }> = [
  { value: 'all', label: 'All runs' }, { value: '13', label: '1 to 3 runs' }, { value: '1', label: '1 run' }, { value: '2', label: '2 runs' }, { value: '3', label: '3 runs' },
  { value: '4', label: 'Fours' }, { value: '6', label: 'Sixes' }, { value: 'out', label: 'Out' },
];

/** The wagon wheel opens on fours (Ari, 2026-10-18). Clearing the filters shows every shot. */
export const WAGON_RUNS_DEFAULT: WagonRuns = '4';

/** The shots a Runs choice keeps. A dismissal is Out whatever the runs on the ball. Five runs show under All runs only. */
export function inRuns(shots: readonly Shot[], choice: WagonRuns): Shot[] {
  switch (choice) {
    case 'all': return [...shots];
    case 'out': return shots.filter((s) => s.out);
    case '13': return shots.filter((s) => !s.out && s.runs >= 1 && s.runs <= 3);
    case '6': return shots.filter((s) => !s.out && s.runs >= 6);
    default: return shots.filter((s) => !s.out && s.runs === Number(choice));
  }
}

export type PitchRuns = 'all' | 'dot' | '13' | '1' | '2' | '3' | '4' | '6' | 'wicket';

export const PITCH_RUNS_OPTIONS: ReadonlyArray<{ value: PitchRuns; label: string }> = [
  { value: 'all', label: 'All balls' }, { value: 'dot', label: 'Dot balls' }, { value: '13', label: '1 to 3 runs' }, { value: '1', label: '1 run' }, { value: '2', label: '2 runs' },
  { value: '3', label: '3 runs' }, { value: '4', label: 'Fours' }, { value: '6', label: 'Sixes' }, { value: 'wicket', label: 'Wickets' },
];

export const isPitchRuns = (value: string): value is PitchRuns => PITCH_RUNS_OPTIONS.some((o) => o.value === value);
