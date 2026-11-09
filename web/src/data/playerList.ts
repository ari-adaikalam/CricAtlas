import { dataBaseUrl } from './sources';

// The Players page's list: plist.json, one array for each player (tools/player_files.py, write_list), fetched whole and read from memory.

export interface ListPlayer {
  id: string; name: string; fullName: string | null; gender: 'male' | 'female' | null; country: string | null;
  role: string | null; batting: string | null; bowling: string | null; image: string | null;
  firstYear: number | null; lastYear: number | null; matches: number; runs: number; wickets: number;
  /** TEST, ODI, T20I, T20 (leagues and other T20 matches) and HUNDRED. */
  fmts: string[];
  /** The leagues played in, as tournament keys. */
  leagues: string[];
}

let list: Promise<ListPlayer[]> | null = null;
export function fetchPlayerList(): Promise<ListPlayer[]> {
  list ??= fetch(`${dataBaseUrl()}/plist.json`).then(async (r) => {
    if (!r.ok) throw new Error(`The player list answered ${r.status}`);
    return ((await r.json()) as unknown[][]).map((x): ListPlayer => ({
      id: x[0] as string, name: x[1] as string, fullName: (x[2] as string | null) ?? null, gender: x[3] === 'M' ? 'male' : x[3] === 'F' ? 'female' : null, country: (x[4] as string | null) ?? null,
      role: (x[5] as string | null) ?? null, batting: (x[6] as string | null) ?? null, bowling: (x[7] as string | null) ?? null, image: (x[8] as string | null) ?? null,
      firstYear: (x[9] as number | null) ?? null, lastYear: (x[10] as number | null) ?? null, matches: x[11] as number, runs: x[12] as number, wickets: x[13] as number,
      fmts: (x[14] as string[] | null) ?? [], leagues: (x[15] as string[] | null) ?? [],
    }));
  }).catch((e: unknown) => { list = null; throw e; });
  return list;
}
