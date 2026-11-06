// Records: Trophies. One row for each edition of a major tournament or league the player was in (tools/export.py, trophies_by_player). The champion of an edition is the winner of its
// Final, and a player's trophy is any edition in which they played a match for the champion.

export interface TrophyEdition {
  tournament_key: string;
  tournament_name: string;
  season_label: string;
  team: string;
  /** Every season in the edition, joined with '|' (an edition can span two calendar years or merge two seasons). */
  seasons: string;
  result: 'champion' | 'runner-up' | 'played';
}

export interface TrophyRow {
  key: string;
  name: string;
  editions: TrophyEdition[];
  titles: number;
  finals: number;
  /** The teams the player won with, in order. */
  winners: string[];
}

export interface Trophies { rows: TrophyRow[]; titles: number; finals: number; editions: number; won: number }

/** The two digits on a chip: the year the edition ended, so 2010/11 is 11 and 2014-16 is 16. */
export function chipYear(label: string): string {
  const m = /(\d{4})(?:\s*[/-]\s*(\d{2,4}))?/.exec(label);
  if (!m) return label.slice(-2);
  return (m[2] ?? m[1]!).slice(-2);
}

/** The editions in a Season, or all of them. The seasons of an edition are a list, so a merged edition is found by any one of them. */
export const inSeason = (editions: readonly TrophyEdition[], season: string | null): TrophyEdition[] =>
  season ? editions.filter((e) => e.seasons.split('|').includes(season)) : [...editions];

/** Tournaments sorted by titles, then lost finals, then editions played, as in the mockup. Editions inside a tournament run oldest first, which is the order they arrive in. */
export function trophies(editions: readonly TrophyEdition[]): Trophies {
  const by = new Map<string, TrophyEdition[]>();
  for (const e of editions) by.set(e.tournament_key, [...(by.get(e.tournament_key) ?? []), e]);
  const rows: TrophyRow[] = [...by.entries()].map(([key, es]) => ({
    key, name: es[0]!.tournament_name, editions: es,
    titles: es.filter((e) => e.result === 'champion').length, finals: es.filter((e) => e.result === 'runner-up').length,
    winners: [...new Set(es.filter((e) => e.result === 'champion').map((e) => e.team))],
  })).sort((a, b) => b.titles - a.titles || b.finals - a.finals || b.editions.length - a.editions.length || a.name.localeCompare(b.name));
  return {
    rows, titles: rows.reduce((a, r) => a + r.titles, 0), finals: rows.reduce((a, r) => a + r.finals, 0),
    editions: editions.length, won: rows.filter((r) => r.titles > 0).length,
  };
}

export const resultLabel = (r: TrophyEdition['result']): string => (r === 'champion' ? 'Champion' : r === 'runner-up' ? 'Lost the final' : 'Played');
