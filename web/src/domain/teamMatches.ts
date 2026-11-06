import { counts, outcomeOf, outcomeText, seasonOf, sortByDate, type Counts, type TeamMatch } from './team';

// The Matches tile of the Results view (Ari, 2026-10-22). A national team's matches are grouped by season, then by series: a tournament edition, or a bilateral tour split by format. A league
// team's matches are grouped by season only, with one line for the season. Everything follows the filters, so these functions get the matches already in scope.

export type SeriesKind = 'tournament' | 'bilateral' | 'league';

export interface Series {
  key: string;
  kind: SeriesKind;
  /** "ICC Men's T20 World Cup", "England tour of India", "Indian Premier League". */
  title: string;
  /** "3 Tests v England", "Group stage and knockouts", the league's own line. */
  subtitle: string;
  /** The competition key for a tournament or a league, null for a bilateral series. Plain text for now, the link is ready (domain/links.ts). */
  tournament: string | null;
  edition: string | null;
  counts: Counts;
  /** "India won 2-1", "Series drawn 1-1". A tournament and a league season say how far the team went. */
  result: string;
  from: string;
  to: string;
  /** Where it was played: the countries when the matches were in one or two, else a count of grounds. */
  where: string;
  matches: TeamMatch[];
}

export interface SeasonGroup { season: string; counts: Counts; series: Series[] }

const FORMAT_NOUN: Record<string, [string, string]> = { TEST: ['Test', 'Tests'], ODI: ['ODI', 'ODIs'], T20: ['T20I', 'T20Is'] };

function nounOf(ms: readonly TeamMatch[]): string {
  const m = ms[0]!;
  const [one, many] = m.kind === 'hundred' ? ['match', 'matches'] : (FORMAT_NOUN[m.format] ?? ['match', 'matches']);
  return ms.length === 1 ? `1 ${one}` : `${ms.length} ${many}`;
}

/** "India won 2-1", "England won 3-0", "Series drawn 1-1" and, when there were draws or no results, how many. */
export function tallyText(team: string, opp: string, c: Counts): string {
  const lead = c.won > c.lost ? `${team} won ${c.won}-${c.lost}` : c.lost > c.won ? `${opp} won ${c.lost}-${c.won}` : c.played === 1 && c.won === 0 && c.lost === 0 ? '' : `Series ${c.won === 0 && c.lost === 0 ? 'drawn' : 'level'} ${c.won}-${c.lost}`;
  const rest = [c.draw ? `${c.draw} drawn` : '', c.tie ? `${c.tie} tied` : '', c.nr ? `${c.nr} no result` : ''].filter(Boolean).join(', ');
  if (c.played === 1) return singleResult(team, opp, c);
  return rest ? `${lead}, ${rest}` : lead;
}

function singleResult(team: string, opp: string, c: Counts): string {
  if (c.won) return `${team} won`;
  if (c.lost) return `${opp} won`;
  return c.draw ? 'Drawn' : c.tie ? 'Tied' : 'No result';
}

function where(ms: readonly TeamMatch[]): string {
  const countries = [...new Set(ms.map((m) => m.country).filter((c): c is string => Boolean(c)))];
  if (countries.length === 1) return countries[0]!;
  if (countries.length === 2) return countries.join(' and ');
  const grounds = new Set(ms.map((m) => m.venue).filter(Boolean)).size;
  return grounds > 0 ? `${grounds} grounds` : '';
}

/** How far a team went in an edition, in words: Champion, Runner-up, out in the semi final, league stage. */
/** `ms` is every match of the team, so a filter that hides the Final still gives the edition's real outcome. */
function editionLine(edition: string | null, ms: readonly TeamMatch[]): string {
  if (!edition) return '';
  const o = outcomeOf(ms.filter((m) => m.edition === edition));
  return outcomeText(o, ms.some((m) => m.stageClass === 'second_phase') ? 'the second phase' : 'the league stage');
}

const seriesOf = (key: string, kind: SeriesKind, ms: TeamMatch[], team: string, all: readonly TeamMatch[]): Series => {
  const sorted = sortByDate(ms);
  const first = sorted[0]!;
  const c = counts(sorted);
  const opp = first.opp;
  if (kind === 'bilateral') {
    return { key, kind, title: first.event ?? `v ${opp}`, subtitle: `${nounOf(sorted)} v ${opp}`, tournament: null, edition: null, counts: c, result: tallyText(team, opp, c), from: sorted[0]!.date, to: sorted[sorted.length - 1]!.date, where: where(sorted), matches: sorted };
  }
  const line = editionLine(first.edition, all);
  return {
    key, kind, title: first.tname ?? first.event ?? 'Tournament', subtitle: `${nounOf(sorted)}`, tournament: first.tk, edition: first.edition, counts: c,
    result: line || `Won ${c.won}, lost ${c.lost}`, from: sorted[0]!.date, to: sorted[sorted.length - 1]!.date, where: where(sorted), matches: sorted,
  };
};

/**
 * The matches grouped for the tile, newest season first. A national team's series are its tournament editions (one row for each edition) and its bilateral series (one row for each event and
 * format, so a tour of three Tests, three ODIs and three T20Is is three rows). Within a season, series run by the date they began, the newest first. A league team's season is one series.
 * `all` is every match of the team (not just those in scope), which is where the edition's champion is read from.
 */
export function groupMatches(ms: readonly TeamMatch[], team: string, national: boolean, all: readonly TeamMatch[] = ms): SeasonGroup[] {
  const bySeason = new Map<string, TeamMatch[]>();
  for (const m of ms) { const s = seasonOf(m, national); const l = bySeason.get(s); if (l) l.push(m); else bySeason.set(s, [m]); }
  return [...bySeason.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([season, list]) => {
    const bySeries = new Map<string, { kind: SeriesKind; ms: TeamMatch[] }>();
    for (const m of list) {
      const kind: SeriesKind = !national ? 'league' : m.tk && m.edition ? 'tournament' : 'bilateral';
      // A league team's season is one series, a tournament is one edition, a bilateral series is one event in one format.
      const key = `${season}|${kind === 'league' ? m.tk ?? 'league' : kind === 'tournament' ? m.edition! : `${m.event ?? m.oppId}|${m.format}|${m.oppId}`}`;
      const e = bySeries.get(key) ?? { kind, ms: [] };
      e.ms.push(m); bySeries.set(key, e);
    }
    const series = [...bySeries.entries()].map(([key, e]) => seriesOf(key, e.kind, e.ms, team, all)).sort((a, b) => b.from.localeCompare(a.from) || a.title.localeCompare(b.title));
    return { season, counts: counts(list), series };
  });
}

/** The stage label of a match inside a series: the stage name, or the match number of a league phase. Null when there is nothing to say. */
export function stageLabel(m: TeamMatch): string | null {
  return m.stageName ?? null;
}
