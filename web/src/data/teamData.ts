import { kindOf, type PhaseAverage, type TeamStyleRow, type TeamInfo, type TeamInnings, type TeamMatch, type TeamPhaseRow, type TeamPlayerRow, type TeamReviewRow, type TeamWicketRow, type Result } from '@/domain/team';
import { dataBaseUrl } from './sources';

// A team page reads one file for its first paint (t/b/<slug>.json: the matches and the innings) and four more behind it (t/ph, t/wk, t/pl, t/rv), all JSON columns written by tools/team_files.py. Nothing here
// starts the query engine. The slug is the team id with '|' written as '~', so the route can preload the bundle from the address alone.

interface Cols { n: number; c: Record<string, unknown[]> }
interface Bundle { ma: Cols; in: Cols }

export interface TeamBundle { info: TeamInfo; matches: TeamMatch[]; innings: TeamInnings[] }

const SLUG = /^[a-z0-9-]+~[a-z0-9-]+~(male|female)$/;
export const isTeamSlug = (slug: string): boolean => SLUG.test(slug);
export const teamIdOf = (slug: string): string => slug.replace(/~/g, '|');
export const teamSlugOf = (id: string): string => id.replace(/\|/g, '~');

/** Reads a column of a file as the type the file's writer gave it. */
const col = <T,>(f: Cols, name: string): T[] => (f.c[name] ?? []) as T[];

function parseBundle(slug: string, b: Bundle): TeamBundle | null {
  const m = b.ma;
  if (m.n === 0) return null;
  const id = col<number>(m, 'match_id'), date = col<string>(m, 'start_date'), season = col<string>(m, 'season'), format = col<string>(m, 'format'), type = col<string>(m, 'type');
  const tk = col<string | null>(m, 'tournament_key'), tname = col<string | null>(m, 'tournament_name'), tkind = col<string | null>(m, 'tournament_kind'), section = col<string | null>(m, 'filter_section');
  const event = col<string | null>(m, 'event'), edition = col<string | null>(m, 'edition'), sc = col<string | null>(m, 'stage_class'), sn = col<string | null>(m, 'stage_name');
  const venue = col<string | null>(m, 'venue'), city = col<string | null>(m, 'city'), country = col<string | null>(m, 'venue_country'), team = col<string>(m, 'team'), opp = col<string>(m, 'opp'), oppId = col<string>(m, 'opp_id');
  const tossWon = col<boolean | null>(m, 'toss_won'), tossDec = col<string | null>(m, 'toss_decision'), result = col<Result>(m, 'result'), tied = col<boolean>(m, 'tied');
  const byRuns = col<number | null>(m, 'winner_runs'), byWkts = col<number | null>(m, 'winner_wickets'), byInn = col<boolean | null>(m, 'won_by_innings'), overs = col<number | null>(m, 'scheduled_overs');
  const bat = col<boolean | null>(m, 'bat_first'), potmId = col<string | null>(m, 'potm_id'), potm = col<string | null>(m, 'potm');
  const trackedOf = col<number | null>(m, 'tracked_of'), tracked = col<number | null>(m, 'tracked_balls'), dropped = col<number | null>(m, 'dropped_catches');
  const matches: TeamMatch[] = [];
  for (let i = 0; i < m.n; i++) {
    matches.push({
      id: id[i]!, date: date[i]!, season: season[i]!, year: Number(date[i]!.slice(0, 4)), format: format[i]!, kind: kindOf(format[i]!, type[i]!), tk: tk[i] ?? null, tname: tname[i] ?? null, tkind: tkind[i] ?? null,
      league: section[i] === 'Leagues', event: event[i] ?? null, edition: edition[i] ?? null, stageClass: sc[i] ?? null, stageName: sn[i] ?? null, venue: venue[i] ?? null, city: city[i] ?? null, country: country[i] ?? null,
      opp: opp[i]!, oppId: oppId[i]!, tossWon: tossWon[i] ?? null, tossDecision: tossDec[i] ?? null, result: result[i]!, tied: Boolean(tied[i]), byRuns: byRuns[i] ?? null, byWkts: byWkts[i] ?? null,
      byInnings: Boolean(byInn[i]), scheduledOvers: overs[i] ?? null, batFirst: bat[i] ?? null, potmId: potmId[i] ?? null, potm: potm[i] ?? null, tracked: tracked[i] ?? 0, trackedOf: trackedOf[i] ?? 0, dropped: dropped[i] ?? 0,
    });
  }
  const last = matches.reduce((a, x) => (x.date > a.date ? x : a), matches[0]!);
  const years = matches.map((x) => x.year);
  const info: TeamInfo = {
    id: teamIdOf(slug), name: team[matches.indexOf(last)] ?? team[0]!, gender: col<string>(m, 'gender')[0] === 'female' ? 'female' : 'male', national: type[0] === 'Intl',
    matches: matches.length, firstYear: Math.min(...years), lastYear: Math.max(...years), hasReviews: false,
  };
  const n = b.in;
  const innings: TeamInnings[] = [];
  const mid = col<number>(n, 'match_id'), inn = col<number>(n, 'innings'), side = col<'for' | 'against'>(n, 'side'), so = col<boolean>(n, 'is_super_over'), runs = col<number>(n, 'runs'), wk = col<number>(n, 'wickets'), balls = col<number>(n, 'balls');
  const wd = col<number>(n, 'wides'), nb = col<number>(n, 'noballs'), by = col<number>(n, 'byes'), lb = col<number>(n, 'legbyes'), pe = col<number>(n, 'penalty'), f4 = col<number>(n, 'fours'), s6 = col<number>(n, 'sixes'), dc = col<boolean>(n, 'declared');
  for (let i = 0; i < n.n; i++) innings.push({ matchId: mid[i]!, inn: inn[i]!, side: side[i]!, superOver: so[i]!, runs: runs[i]!, wkts: wk[i]!, balls: balls[i]!, wides: wd[i]!, noballs: nb[i]!, byes: by[i]!, legbyes: lb[i]!, penalty: pe[i]!, fours: f4[i]!, sixes: s6[i]!, declared: dc[i]! });
  return { info, matches, innings };
}

const bundles = new Map<string, Promise<TeamBundle | null>>();

export function fetchTeam(slug: string): Promise<TeamBundle | null> {
  if (!isTeamSlug(slug)) return Promise.resolve(null);
  const have = bundles.get(slug);
  if (have) return have;
  const promise = (async () => {
    const response = await fetch(`${dataBaseUrl()}/t/b/${slug}.json`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`The team ${slug} answered ${response.status}`);
    return parseBundle(slug, (await response.json()) as Bundle);
  })().catch((error: unknown) => { bundles.delete(slug); throw error; });
  bundles.set(slug, promise);
  // A few recent teams stay, so going back to one is instant.
  while (bundles.size > 12) { const oldest = bundles.keys().next().value; if (oldest === undefined) break; bundles.delete(oldest); }
  return promise;
}

export function prefetchTeam(slug: string): void { fetchTeam(slug).catch(() => undefined); }

const later = new Map<string, Promise<Cols | null>>();
function fetchLater(kind: 'ph' | 'wk' | 'pl' | 'rv' | 'bs', slug: string): Promise<Cols | null> {
  const key = `${kind}/${slug}`;
  const have = later.get(key);
  if (have) return have;
  const promise = (async () => {
    const response = await fetch(`${dataBaseUrl()}/t/${kind}/${slug}.json`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`The ${kind} file of ${slug} answered ${response.status}`);
    return (await response.json()) as Cols;
  })().catch((error: unknown) => { later.delete(key); throw error; });
  later.set(key, promise);
  while (later.size > 24) { const oldest = later.keys().next().value; if (oldest === undefined) break; later.delete(oldest); }
  return promise;
}

export async function fetchPhases(slug: string): Promise<TeamPhaseRow[]> {
  const f = await fetchLater('ph', slug);
  if (!f) return [];
  const mid = col<number>(f, 'match_id'), inn = col<number>(f, 'innings'), side = col<'for' | 'against'>(f, 'side'), phase = col<string>(f, 'phase'), runs = col<number>(f, 'runs'), balls = col<number>(f, 'balls');
  const wk = col<number>(f, 'wickets'), bd = col<number>(f, 'boundaries'), dots = col<number>(f, 'dots');
  return Array.from({ length: f.n }, (_, i) => ({ matchId: mid[i]!, inn: inn[i]!, side: side[i]!, phase: phase[i]!, runs: runs[i]!, balls: balls[i]!, wkts: wk[i]!, boundaries: bd[i]!, dots: dots[i]! }));
}

export async function fetchWickets(slug: string): Promise<TeamWicketRow[]> {
  const f = await fetchLater('wk', slug);
  if (!f) return [];
  const mid = col<number>(f, 'match_id'), inn = col<number>(f, 'innings'), side = col<'for' | 'against'>(f, 'side'), type = col<string>(f, 'wicket_type'), n = col<number>(f, 'n');
  return Array.from({ length: f.n }, (_, i) => ({ matchId: mid[i]!, inn: inn[i]!, side: side[i]!, type: type[i]!, n: n[i]! }));
}

export async function fetchReviews(slug: string): Promise<TeamReviewRow[]> {
  // A team with no review rows has no file (the list says so), so none is asked for.
  const row = (await fetchTeamIndex().catch(() => [])).find((r) => teamSlugOf(r.id) === slug);
  if (row && !row.hasReviews) return [];
  const f = await fetchLater('rv', slug);
  if (!f) return [];
  const mid = col<number>(f, 'match_id'), inn = col<number>(f, 'innings'), ball = col<number>(f, 'delivery_number'), by = col<boolean>(f, 'by_team'), bat = col<boolean | null>(f, 'team_batting');
  const dec = col<string>(f, 'decision'), type = col<string | null>(f, 'review_type'), uc = col<boolean | null>(f, 'umpires_call');
  return Array.from({ length: f.n }, (_, i) => ({ matchId: mid[i]!, inn: inn[i]!, ball: ball[i]!, byTeam: Boolean(by[i]), batting: bat[i] ?? null, decision: dec[i]!, type: type[i] ?? null, umpiresCall: uc[i] ?? null }));
}

export async function fetchPlayers(slug: string): Promise<TeamPlayerRow[]> {
  const f = await fetchLater('pl', slug);
  if (!f) return [];
  const n = (name: string): number[] => col<number>(f, name);
  const mid = col<number>(f, 'match_id'), date = col<string>(f, 'start_date'), id = col<string>(f, 'player_id'), name = col<string | null>(f, 'name'), named = col<boolean>(f, 'named'), potm = col<boolean>(f, 'potm');
  const bi = n('bat_inns'), br = n('bat_runs'), bb = n('bat_balls'), f4 = n('fours'), s6 = n('sixes'), outs = n('outs'), hi = n('high'), f50 = n('fifties'), h100 = n('hundreds'), du = n('ducks');
  const wi = n('bowl_inns'), wb = n('bowl_balls'), wr = n('bowl_runs'), wk = n('wkts'), mi = n('maidens'), fv = n('fivefers'), bw = n('best_wkts'), br2 = n('best_runs'), ct = n('catches'), st = n('stumpings'), ro = n('runouts');
  return Array.from({ length: f.n }, (_, i) => ({
    matchId: mid[i]!, date: date[i]!, id: id[i]!, name: name[i] ?? 'Unknown player', named: Boolean(named[i]), batInns: bi[i]!, runs: br[i]!, balls: bb[i]!, fours: f4[i]!, sixes: s6[i]!, outs: outs[i]!, high: hi[i]!, fifties: f50[i]!, hundreds: h100[i]!, ducks: du[i]!,
    bowlInns: wi[i]!, bowlBalls: wb[i]!, conceded: wr[i]!, wkts: wk[i]!, maidens: mi[i]!, fivefers: fv[i]!, bestWkts: bw[i]!, bestRuns: br2[i]!, catches: ct[i]!, stumpings: st[i]!, runOuts: ro[i]!, potm: Boolean(potm[i]),
  }));
}

/** Starts the files behind the first paint, so the Players and Bat, bowl and field views have them when opened. Nothing waits on this. */
export function prefetchTeamLater(slug: string): void {
  for (const kind of ['pl', 'ph', 'wk', 'bs'] as const) fetchLater(kind, slug).catch(() => undefined);
  // Reviews go through their own loader, which knows which teams have no file.
  fetchReviews(slug).catch(() => undefined);
}

export interface TeamIndexRow { id: string; name: string; gender: 'male' | 'female'; national: boolean; matches: number; firstYear: number; lastYear: number; hasReviews: boolean; earlier: string[];
  /** Matches won, lost (a side won, not this one) and with no result, titles (editions won, from the Final), the tournaments and leagues played (keys) and the formats (TEST, ODI, T20I, T20, HUNDRED). */
  won: number; lost: number; nr: number; titles: number; comps: string[]; fmts: string[] }
let index: Promise<TeamIndexRow[]> | null = null;
export function fetchTeamIndex(): Promise<TeamIndexRow[]> {
  index ??= fetch(`${dataBaseUrl()}/t/index.json`).then(async (r) => {
    if (!r.ok) throw new Error(`The team list answered ${r.status}`);
    return ((await r.json()) as unknown[][]).map((x) => ({ id: x[0] as string, name: x[1] as string, gender: x[2] as 'male' | 'female', national: x[3] === 'national', matches: x[4] as number, firstYear: x[5] as number, lastYear: x[6] as number, hasReviews: Boolean(x[7]), earlier: x[8] as string[] , won: x[9] as number, lost: x[10] as number, nr: x[11] as number, titles: x[12] as number, comps: (x[13] as string[] | null) ?? [], fmts: (x[14] as string[] | null) ?? []}));
  }).catch((e: unknown) => { index = null; throw e; });
  return index;
}

export async function fetchStyles(slug: string): Promise<TeamStyleRow[]> {
  const f = await fetchLater('bs', slug);
  if (!f) return [];
  const mid = col<number>(f, 'match_id'), grp = col<TeamStyleRow['group']>(f, 'grp'), balls = col<number>(f, 'balls'), runs = col<number>(f, 'runs'), wk = col<number>(f, 'wkts');
  return Array.from({ length: f.n }, (_, i) => ({ matchId: mid[i]!, group: grp[i]!, balls: balls[i]!, conceded: runs[i]!, wkts: wk[i]! }));
}

let phaseAvg: Promise<PhaseAverage[]> | null = null;
/** One shared list (t/phase_avg.json, under 4 KB) for the 'against the format' marks. */
export function fetchPhaseAverages(): Promise<PhaseAverage[]> {
  phaseAvg ??= fetch(`${dataBaseUrl()}/t/phase_avg.json`).then(async (r) => {
    if (!r.ok) throw new Error(`The phase averages answered ${r.status}`);
    return ((await r.json()) as Array<[PhaseAverage['kind'], boolean, PhaseAverage['gender'], string, number, number, number, number, number]>)
      .map(([kind, league, gender, phase, runs, balls, wkts, boundaries, dots]) => ({ kind, league, gender, phase, runs, balls, wkts, boundaries, dots }));
  }).catch((e: unknown) => { phaseAvg = null; throw e; });
  return phaseAvg;
}
