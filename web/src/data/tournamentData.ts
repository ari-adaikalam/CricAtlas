import type { BatRow, BowlRow, Fmt, TInnings, TMatch, TournamentInfo } from '@/domain/tournament';
import { dataBaseUrl } from './sources';

// A tournament page reads one file for its first paint (n/b/<key>.json: the matches and the innings) and one more behind it (n/pl/<key>.json: the players' match rows), both JSON columns written by
// tools/tournament_files.py. Nothing here starts the query engine.

interface Cols { n: number; c: Record<string, unknown[]> }
interface Bundle { m: Cols; i: Cols }

export interface TournamentBundle { matches: TMatch[]; innings: TInnings[] }

const KEY = /^[a-z0-9-]{2,60}$/;
export const isTournamentKey = (key: string): boolean => KEY.test(key);

const col = <T,>(f: Cols, name: string): T[] => (f.c[name] ?? []) as T[];

/** The Hundred is a T20 match of 5-ball overs in the data (type Fran(Hundred)); the page treats it as its own format. */
const formatOf = (format: string, type: string): Fmt => (type === 'Fran(Hundred)' ? 'HUNDRED' : (format as Fmt));

function parseBundle(b: Bundle): TournamentBundle {
  const m = b.m;
  const id = col<number>(m, 'match_id'), date = col<string>(m, 'start_date'), season = col<string>(m, 'season'), edition = col<string>(m, 'edition'), format = col<string>(m, 'format'), type = col<string>(m, 'type');
  const sc = col<string | null>(m, 'stage_class'), sn = col<string | null>(m, 'stage_name'), grp = col<string | null>(m, 'event_group'), num = col<number | null>(m, 'match_number');
  const venue = col<string | null>(m, 'venue'), city = col<string | null>(m, 'city'), country = col<string | null>(m, 'venue_country');
  const t1 = col<string>(m, 'team_1'), t1i = col<string>(m, 'team_1_id'), t2 = col<string>(m, 'team_2'), t2i = col<string>(m, 'team_2_id');
  const tw = col<string | null>(m, 'toss_winner_id'), td = col<string | null>(m, 'toss_decision'), bf = col<string | null>(m, 'bat_first_id'), win = col<string | null>(m, 'winner_id'), out = col<string | null>(m, 'outcome');
  const wr = col<number | null>(m, 'winner_runs'), ww = col<number | null>(m, 'winner_wickets'), wi = col<boolean | null>(m, 'won_by_innings'), method = col<string | null>(m, 'result_method');
  const so = col<number | null>(m, 'scheduled_overs'), bpo = col<number | null>(m, 'balls_per_over'), ro = col<number | null>(m, 'revised_overs'), pid = col<string | null>(m, 'potm_id'), pn = col<string | null>(m, 'potm');
  const matches: TMatch[] = [];
  for (let k = 0; k < m.n; k++) {
    matches.push({
      id: id[k]!, date: date[k]!, season: season[k]!, edition: edition[k]!, format: formatOf(format[k]!, type[k]!), stageClass: sc[k] ?? null, stageName: sn[k] ?? null, group: grp[k] ?? null, number: num[k] ?? null,
      venue: venue[k] ?? null, city: city[k] ?? null, country: country[k] ?? null, team1: t1[k]!, team1Id: t1i[k]!, team2: t2[k]!, team2Id: t2i[k]!, tossWinnerId: tw[k] ?? null, tossDecision: td[k] ?? null,
      batFirstId: bf[k] ?? null, winnerId: win[k] ?? null, outcome: out[k] ?? null, byRuns: wr[k] ?? null, byWkts: ww[k] ?? null, byInnings: Boolean(wi[k]), method: method[k] ?? null,
      overs: so[k] ?? null, ballsPerOver: bpo[k] ?? 6, revisedOvers: ro[k] ?? null, potmId: pid[k] ?? null, potm: pn[k] ?? null,
    });
  }
  const n = b.i;
  const mid = col<number>(n, 'match_id'), inn = col<number>(n, 'innings'), bat = col<string>(n, 'batting_team_id'), bowl = col<string>(n, 'bowling_team_id'), sup = col<boolean>(n, 'is_super_over');
  const runs = col<number>(n, 'runs'), wk = col<number>(n, 'wickets'), balls = col<number>(n, 'balls'), f4 = col<number>(n, 'fours'), s6 = col<number>(n, 'sixes'), dc = col<boolean>(n, 'declared');
  const innings: TInnings[] = [];
  for (let k = 0; k < n.n; k++) innings.push({ matchId: mid[k]!, inn: inn[k]!, batId: bat[k]!, bowlId: bowl[k]!, superOver: Boolean(sup[k]), runs: runs[k] ?? 0, wkts: wk[k] ?? 0, balls: balls[k] ?? 0, fours: f4[k] ?? 0, sixes: s6[k] ?? 0, declared: Boolean(dc[k]) });
  return { matches, innings };
}

const bundles = new Map<string, Promise<TournamentBundle | null>>();

export function fetchTournament(key: string): Promise<TournamentBundle | null> {
  if (!isTournamentKey(key)) return Promise.resolve(null);
  const have = bundles.get(key);
  if (have) return have;
  const promise = (async () => {
    const response = await fetch(`${dataBaseUrl()}/n/b/${key}.json`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`The tournament ${key} answered ${response.status}`);
    return parseBundle((await response.json()) as Bundle);
  })().catch((error: unknown) => { bundles.delete(key); throw error; });
  bundles.set(key, promise);
  while (bundles.size > 8) { const oldest = bundles.keys().next().value; if (oldest === undefined) break; bundles.delete(oldest); }
  return promise;
}

export interface TournamentPlayers { bat: BatRow[]; bowl: BowlRow[] }
const players = new Map<string, Promise<TournamentPlayers>>();

/** The players' match rows, which load behind the first paint (the largest, the IPL's, is about 200 KB compressed). */
export function fetchTournamentPlayers(key: string): Promise<TournamentPlayers> {
  const have = players.get(key);
  if (have) return have;
  const promise = (async () => {
    const response = await fetch(`${dataBaseUrl()}/n/pl/${key}.json`);
    if (response.status === 404) return { bat: [], bowl: [] };
    if (!response.ok) throw new Error(`The players of ${key} answered ${response.status}`);
    const f = (await response.json()) as { bat: Cols; bowl: Cols };
    const b = f.bat, w = f.bowl;
    const bm = col<number>(b, 'match_id'), bi = col<number>(b, 'innings'), bid = col<string>(b, 'player_id'), bn = col<string | null>(b, 'name'), bt = col<string>(b, 'team_id');
    const br = col<number>(b, 'runs'), bb = col<number>(b, 'balls'), bf = col<number>(b, 'fours'), bs = col<number>(b, 'sixes'), bo = col<boolean>(b, 'is_out');
    const wm = col<number>(w, 'match_id'), wi = col<number>(w, 'innings'), wid = col<string>(w, 'player_id'), wn = col<string | null>(w, 'name'), wt = col<string>(w, 'team_id');
    const wb = col<number>(w, 'balls'), wr = col<number>(w, 'runs'), wk = col<number>(w, 'wickets'), wmd = col<number>(w, 'maidens');
    return {
      bat: Array.from({ length: b.n }, (_, k): BatRow => ({ matchId: bm[k]!, inn: bi[k]!, id: bid[k]!, name: bn[k] ?? 'Unknown player', teamId: bt[k]!, runs: br[k] ?? 0, balls: bb[k] ?? 0, fours: bf[k] ?? 0, sixes: bs[k] ?? 0, out: Boolean(bo[k]) })),
      bowl: Array.from({ length: w.n }, (_, k): BowlRow => ({ matchId: wm[k]!, inn: wi[k]!, id: wid[k]!, name: wn[k] ?? 'Unknown player', teamId: wt[k]!, balls: wb[k] ?? 0, runs: wr[k] ?? 0, wkts: wk[k] ?? 0, maidens: wmd[k] ?? 0 })),
    };
  })().catch((error: unknown) => { players.delete(key); throw error; });
  players.set(key, promise);
  while (players.size > 6) { const oldest = players.keys().next().value; if (oldest === undefined) break; players.delete(oldest); }
  return promise;
}

export function prefetchTournamentLater(key: string): void { fetchTournamentPlayers(key).catch(() => undefined); }

let index: Promise<TournamentInfo[]> | null = null;
export function fetchTournamentIndex(): Promise<TournamentInfo[]> {
  index ??= fetch(`${dataBaseUrl()}/n/index.json`).then(async (r) => {
    if (!r.ok) throw new Error(`The tournament list answered ${r.status}`);
    return ((await r.json()) as unknown[][]).map((x): TournamentInfo => ({
      key: x[0] as string, name: x[1] as string, kind: x[2] as TournamentInfo['kind'], gender: x[3] as TournamentInfo['gender'], editions: x[4] as number, firstSeason: x[5] as string, lastSeason: x[6] as string,
      matches: x[7] as number, teams: x[8] as number, formats: (x[9] as string[]).map((f) => f as Fmt),
      champion: x[10] ? { id: (x[10] as string[])[0]!, name: (x[10] as string[])[1]!, edition: (x[10] as string[])[2]! } : null,
      titles: ((x[11] as Array<[string, string, number]> | null) ?? []).map(([id, name, count]) => ({ id, name, count })),
    }));
  }).catch((e: unknown) => { index = null; throw e; });
  return index;
}
