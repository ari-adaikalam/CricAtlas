import { dataBaseUrl } from './sources';

// The Matches page's list: mlist.json, one short row for each match with lookup lists for the repeated names (tools/match_list.py), fetched whole and read from memory.

export interface ListMatch {
  id: number;
  /** YYYY-MM-DD. */
  date: string;
  kind: 'test' | 'odi' | 't20' | 'hundred';
  international: boolean;
  female: boolean;
  team1: { id: string; name: string };
  team2: { id: string; name: string };
  /** 0 or 1 for the side that won, -1 for none. */
  winner: -1 | 0 | 1;
  score1: string;
  score2: string;
  /** The result as the match page words it: "by 5 wickets (12 balls left)", "drawn", "tied", "no result". */
  margin: string;
  competition: string;
  /** The tournament key when the competition has a page of its own. */
  key: string | null;
  season: string | null;
  stage: string | null;
  venue: string | null;
  country: string | null;
  potm: { id: string; name: string } | null;
  tossWinner: -1 | 0 | 1;
  tossDecision: 0 | 1 | 2;
  batFirst: -1 | 0 | 1;
}

interface Payload { teams: [string, string][]; margins: string[]; competitions: string[]; keys: string[]; seasons: string[]; stages: string[]; venues: string[]; countries: string[]; potm: [string, string][]; rows: Array<Array<number | string>>; }
const KINDS = ['test', 'odi', 't20', 'hundred'] as const;

let list: Promise<ListMatch[]> | null = null;
export function fetchMatchList(): Promise<ListMatch[]> {
  list ??= fetch(`${dataBaseUrl()}/mlist.json`).then(async (r) => {
    if (!r.ok) throw new Error(`The match list answered ${r.status}`);
    const d = (await r.json()) as Payload;
    const at = <T,>(a: readonly T[], i: number): T | null => (i >= 0 ? (a[i] ?? null) : null);
    return d.rows.map((x): ListMatch => {
      const n = (i: number): number => x[i] as number;
      const text = (i: number): string => x[i] as unknown as string;
      const date = String(n(1));
      const t1 = d.teams[n(4)]!, t2 = d.teams[n(5)]!;
      const pm = at(d.potm, n(16));
      return {
        id: n(0), date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, kind: KINDS[n(2)]!, international: n(20) === 1, female: n(3) === 1, team1: { id: t1[0], name: t1[1] }, team2: { id: t2[0], name: t2[1] },
        winner: n(6) as -1 | 0 | 1, score1: text(7), score2: text(8), margin: d.margins[n(9)] ?? '', competition: d.competitions[n(10)] ?? '', key: at(d.keys, n(11)), season: at(d.seasons, n(12)),
        stage: at(d.stages, n(13)), venue: at(d.venues, n(14)), country: at(d.countries, n(15)), potm: pm ? { id: pm[0], name: pm[1] } : null,
        tossWinner: n(17) as -1 | 0 | 1, tossDecision: n(18) as 0 | 1 | 2, batFirst: n(19) as -1 | 0 | 1,
      };
    });
  }).catch((e: unknown) => { list = null; throw e; });
  return list;
}
