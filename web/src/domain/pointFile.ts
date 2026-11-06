// A batter's point file (tools/point_files.py): every ball placed on the ground, as packed columns the browser reads whole and filters in JavaScript, with no query engine
//This reads the file; pointFilter.ts selects from it.

export const NONE16 = 65535;
export const NONE8 = 255;

export interface PointSet {
  n: number;
  /** The batter's hand in a bowler's file: 1 right, 2 left, 0 unknown. 0 in a batter's file. */
  hand: Uint8Array; length: Uint8Array; line: Uint8Array; control: Uint8Array; match: Int32Array; date: Int32Array; opponent: Uint16Array;
  x: Int16Array; y: Int16Array;
  runs: Uint8Array; flags: Uint8Array;
  over: Uint16Array; ball: Uint8Array; innings: Uint8Array; wickets: Uint8Array;
  phase: Uint8Array; result: Uint8Array; superOver: Uint8Array; format: Uint8Array; international: Uint8Array;
  tournament: Uint16Array; season: Uint16Array; bowler: Uint16Array; name: Uint16Array; shot: Uint8Array; style: Uint8Array;
  tournaments: string[]; seasons: string[];
  /** Each bowler as [player id, first listed bowling style]. */
  bowlers: Array<[string, string | null]>;
  /** The bowler's name as written on the row. */
  names: string[];
  /** The bowling teams, which the opponent codes point into. */
  opponents: string[];
  shots: string[]; styles: string[];
}

/** The lengths and lines as the data names them, in the order of their codes 1 to 6 and 1 to 5 (0 is none). */
export const LENGTH_NAMES = ['full toss', 'yorker', 'full', 'good length', 'short of a good length', 'short'] as const;
export const LINE_NAMES = ['wide down leg', 'down leg', 'on the stumps', 'outside offstump', 'wide outside offstump'] as const;

export const FLAG_OUT = 1;
export const FLAG_WIDE = 2;
/** A dismissal of this batter at the non-striker's end, on a ball faced by another batter: a row for the dismissal map only. */
export const FLAG_NONSTRIKER = 4;
/** The ball has a position on the ground. */
export const FLAG_POSITION = 8;
/** The dismissal was a catch (caught or caught and bowled). */
export const FLAG_CAUGHT = 16;

type ColumnName = 'hand' | 'length' | 'line' | 'control' | 'match' | 'date' | 'opponent' | 'x' | 'y' | 'runs' | 'flags' | 'over' | 'ball' | 'innings' | 'wickets' | 'phase' | 'result' | 'superOver' | 'format' | 'international' | 'tournament' | 'season' | 'bowler' | 'name' | 'shot' | 'style';
const TYPES: Record<string, (b: ArrayBuffer, o: number, n: number) => ArrayLike<number>> = {
  i2: (b, o, n) => new Int16Array(b, o, n), i4: (b, o, n) => new Int32Array(b, o, n), u1: (b, o, n) => new Uint8Array(b, o, n), u2: (b, o, n) => new Uint16Array(b, o, n),
};
const WIDTH: Record<string, number> = { i2: 2, i4: 4, u1: 1, u2: 2 };

/** An empty set, for a batter with no ball on the ground. */
export function emptyPointSet(): PointSet {
  return {
    n: 0, hand: new Uint8Array(0), length: new Uint8Array(0), line: new Uint8Array(0), control: new Uint8Array(0), match: new Int32Array(0), date: new Int32Array(0), opponent: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), runs: new Uint8Array(0), flags: new Uint8Array(0), over: new Uint16Array(0), ball: new Uint8Array(0), innings: new Uint8Array(0),
    wickets: new Uint8Array(0), phase: new Uint8Array(0), result: new Uint8Array(0), superOver: new Uint8Array(0), format: new Uint8Array(0), international: new Uint8Array(0),
    tournament: new Uint16Array(0), season: new Uint16Array(0), bowler: new Uint16Array(0), name: new Uint16Array(0), shot: new Uint8Array(0), style: new Uint8Array(0),
    tournaments: [], seasons: [], bowlers: [], names: [], opponents: [], shots: [], styles: [],
  };
}

/** Reads a point file. The columns are views on the buffer, not copies. */
export function parsePointFile(buffer: ArrayBuffer): PointSet {
  const view = new DataView(buffer);
  const headerLength = view.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength))) as {
    n: number; columns: Array<[ColumnName, string, number, number]>; tournaments: string[]; seasons: string[]; bowlers: PointSet['bowlers']; names: string[]; opponents: string[]; shots: string[]; styles: string[];
  };
  const base = 4 + headerLength;
  const set = emptyPointSet() as unknown as Record<string, unknown>;
  set.n = header.n;
  for (const [name, type, offset, bytes] of header.columns) {
    const read = TYPES[type];
    const width = WIDTH[type];
    if (!read || !width) throw new Error(`Unknown column type ${type} in a point file`);
    set[name] = read(buffer, base + offset, bytes / width);
  }
  set.tournaments = header.tournaments; set.seasons = header.seasons; set.bowlers = header.bowlers; set.names = header.names; set.opponents = header.opponents; set.shots = header.shots; set.styles = header.styles;
  return set as unknown as PointSet;
}
