import { fetchMatchList } from './matchList';
import { fetchTeamIndex, teamSlugOf } from './teamData';
import { fetchTournamentIndex } from './tournamentData';
import { searchPlayers } from './search';
import { matchSlug, playerSlug, tournamentSlug } from '@/domain/slug';
import { API_BASE } from '@/domain/apiPage';

// What the top bar's hover menus list: nine of each root page, from the lists the pages read anyway (the best-known ones, not the latest). Each menu loads on its first hover.

export interface MenuLink { id: string; label: string; href: string; /** The full name when the label is short. */ title?: string; /** A page of another site: opens in a new tab. */ external?: boolean }
export interface MenuData { links: MenuLink[]; all: MenuLink }
export type MenuKey = 'players' | 'teams' | 'matches' | 'tournaments' | 'series' | 'records' | 'api';

/** Links in a hover menu, besides the link to the whole page: the same in every menu (Ari, 2026-10-24). */
const COUNT = 9;

/** Matches people look for, by match id: World Cup, T20 World Cup, Champions Trophy and IPL finals, and some of the best-known Tests and rivalry games. Chosen by hand (Ari asked for famous, not latest, 2026-10-24); a match missing from the data is skipped. */
const FAMOUS_MATCHES: ReadonlyArray<readonly [number, string, string]> = [
  [1384439, 'IND v AUS, 2023 WC final', 'India v Australia, 2023 Men\'s Cricket World Cup final'], [1144530, 'ENG v NZ, 2019 WC final', 'England v New Zealand, 2019 Men\'s Cricket World Cup final'],
  [433606, 'IND v SL, 2011 WC final', 'India v Sri Lanka, 2011 Men\'s Cricket World Cup final'], [1415755, 'IND v SA, 2024 T20 WC final', 'India v South Africa, 2024 Men\'s T20 World Cup final'],
  [287879, 'IND v PAK, 2007 T20 WC final', 'India v Pakistan, 2007 Men\'s T20 World Cup final'], [951373, 'ENG v WI, 2016 T20 WC final', 'England v West Indies, 2016 Men\'s T20 World Cup final'],
  [1298179, 'PAK v ENG, 2022 T20 WC final', 'Pakistan v England, 2022 Men\'s T20 World Cup final'], [1298150, 'PAK v IND, 2022 T20 WC, MCG', 'Pakistan v India, 2022 Men\'s T20 World Cup, Melbourne'],
  [1152848, 'ENG v AUS, Headingley 2019', 'England v Australia, the Headingley Ashes Test, 2019'], [1223872, 'AUS v IND, Gabba 2021', 'Australia v India, the Gabba Test, 2021'],
  [215010, 'ENG v AUS, Edgbaston 2005', 'England v Australia, the Edgbaston Ashes Test, 2005'], [1370353, 'GT v CSK, 2023 IPL final', 'Gujarat Titans v Chennai Super Kings, 2023 IPL final'],
  [1022375, 'IND v PAK, Champions Trophy 2017', 'India v Pakistan, 2017 Men\'s Champions Trophy final'], [1490443, "IND v SA, 2025 Women's WC final", "India v South Africa, 2025 Women's Cricket World Cup final"],
  [336040, 'RR v CSK, 2008 IPL final', 'Rajasthan Royals v Chennai Super Kings, 2008 IPL final'],
];

/** [label, search words, gender filter]. */
const RIVALRIES: ReadonlyArray<readonly [string, string, 'Men' | 'Women']> = [
  ['England v Australia, the Ashes', 'england australia', 'Men'], ['India v Australia, Border-Gavaskar', 'india australia', 'Men'], ['India v Pakistan', 'india pakistan', 'Men'],
  ['India v England', 'india england', 'Men'], ['England v West Indies', 'england west indies', 'Men'], ['Australia v South Africa', 'australia south africa', 'Men'],
  ['India v South Africa', 'india south africa', 'Men'], ['Australia v New Zealand', 'australia new zealand', 'Men'], ['England v Pakistan', 'england pakistan', 'Men'],
  ['India v Sri Lanka', 'india sri lanka', 'Men'], ['Pakistan v Australia', 'pakistan australia', 'Men'], ['India v West Indies', 'india west indies', 'Men'],
  ['England v South Africa', 'england south africa', 'Men'], ['India v New Zealand', 'india new zealand', 'Men'], ['England v Australia, the Women\'s Ashes', 'england australia', 'Women'],
];

const loaders: Record<MenuKey, () => Promise<MenuData>> = {
  // The most capped men and women, three of them women (placed third, sixth and ninth) so the menu shows both.
  players: async () => {
    const women = await searchPlayers('', 3, 'women');
    const men = await searchPlayers('', COUNT - women.length, 'men');
    const mixed = [...men];
    women.forEach((w, i) => mixed.splice(2 + 3 * i, 0, w));
    return {
      links: mixed.map((p) => ({ id: p.playerId, label: p.name, href: `/players/${playerSlug(p.name, p.playerId)}` })),
      all: { id: 'all', label: 'All players', href: '/players' },
    };
  },
  teams: async () => ({
    links: (await fetchTeamIndex()).sort((a, b) => b.matches - a.matches).slice(0, COUNT).map((t) => ({ id: t.id, label: t.gender === 'female' && !/women/i.test(t.name) ? `${t.name} (women)` : t.name, href: `/teams/${teamSlugOf(t.id)}` })),
    all: { id: 'all', label: 'All teams', href: '/teams' },
  }),
  matches: async () => {
    const byId = new Map((await fetchMatchList()).map((m) => [m.id, m]));
    const links: MenuLink[] = [];
    for (const [id, label, title] of FAMOUS_MATCHES.slice(0, COUNT)) {
      const m = byId.get(id);
      if (m) links.push({ id: String(id), label, title, href: `/matches/${matchSlug(m.team1.name, m.team2.name, m.date, m.id)}` });
    }
    return { links, all: { id: 'all', label: 'All matches', href: '/matches' } };
  },
  tournaments: async () => ({
    links: (await fetchTournamentIndex()).slice().sort((a, b) => b.matches - a.matches).slice(0, COUNT).map((t) => ({ id: t.key, label: t.name, href: `/tournaments/${tournamentSlug(t.key)}` })),
    all: { id: 'all', label: 'All tournaments', href: '/tournaments' },
  }),
  // The records of the formats and competitions people look for first, each opening the Records page on that scope (the scope keys are in r/index.json).
  records: async () => ({
    links: ([
      ['test-male', 'Test records'], ['odi-male', 'ODI records'], ['t20i-male', 'T20I records'], ['t-ipl', 'IPL records'],
      ['t-bbl', 'Big Bash League records'], ['t-odi-world-cup-male', 'Cricket World Cup records'], ['t-t20-world-cup-male', 'T20 World Cup records'], ['odi-female', "Women's ODI records"], ['t20i-female', "Women's T20I records"],
    ] as const).map(([scope, label]) => ({ id: scope, label, href: `/records?scope=${scope}` })),
    all: { id: 'all', label: 'All records', href: '/records' },
  }),
  // The API page: its first two tiles (each link names its tile, so a link always changes the address), and the reference on the API's own server (a new tab).
  api: async () => ({
    links: [
      { id: 'try', label: 'Try it', href: '/api?tile=try' },
      { id: 'routes', label: 'What you can get', href: '/api?tile=routes' },
    ],
    all: { id: 'reference', label: 'Open the reference', href: `${API_BASE}/docs`, external: true },
  }),
  // The rivalries people look for. Each opens the Series page on every bilateral tour between the two sides, in every format.
  series: async () => ({
    links: RIVALRIES.slice(0, COUNT).map(([label, q, gender]) => ({ id: label, label, href: `/series?${new URLSearchParams({ q, kind: 'Bilateral tour', gender, season: '' }).toString()}` })),
    all: { id: 'all', label: 'All series', href: '/series?season=' },
  }),
};

const cache = new Map<MenuKey, Promise<MenuData>>();
export function loadMenu(key: MenuKey): Promise<MenuData> {
  let p = cache.get(key);
  if (!p) { p = loaders[key]().catch((e: unknown) => { cache.delete(key); throw e; }); cache.set(key, p); }
  return p;
}
