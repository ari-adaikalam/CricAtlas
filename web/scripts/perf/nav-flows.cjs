// The openings the navigation checks run through: a click on a menu entry, a top bar link, a row of a list, the brand. Each is [name, start address, a function that finds the thing to click].
const menu = (name, n = 0) => async (p) => { await p.locator('.nmi > a:visible', { hasText: new RegExp('^' + name + '$') }).first().hover(); await p.waitForTimeout(900); const e = p.locator('.nmi:has(> a:visible) .nmp.on a:visible').nth(n); await e.hover(); await p.waitForTimeout(150); return e; };
const main = (name) => async (p) => p.locator('.nmi > a:visible, .nav-panel > a:visible', { hasText: new RegExp('^' + name + '$') }).first();
const first = (sel) => async (p) => p.locator(`${sel}:visible`).first();
const brand = async (p) => p.locator('a.brand:visible').first();
const FLOWS = [
  ['Home to a team (menu)', '/', menu('Teams')], ['Home to a match (menu)', '/', menu('Matches')], ['Home to a player (menu)', '/', menu('Players')], ['Home to a tournament (menu)', '/', menu('Tournaments', 1)],
  ['Home to Teams', '/', main('Teams')], ['Home to API', '/', main('API')], ['API to Home', '/api', brand], ['Home to Matches', '/', main('Matches')], ['Home to Compare', '/', first('a.cmp')],
  ['Teams to a team', '/teams', first('a[href^="/teams/"]:not([href*="compare"])')], ['Players to a player', '/players', first('a[href^="/players/"]')],
  ['Matches to a match', '/matches', first('.pgx [role="link"], .pgx a[href^="/matches/"]')], ['Tournaments to a tournament', '/tournaments', first('a[href^="/tournaments/"]')],
  ['A team to Home', '/teams/india~intl~male', brand], ['A team to a team (menu)', '/teams/india~intl~male', menu('Teams', 1)], ['A team to Matches', '/teams/india~intl~male', main('Matches')],
  ['A player to a match (menu)', '/players/ba607b88', menu('Matches')], ['A tournament to Home', '/tournaments/ipl', brand], ['A match to Home', '/matches/1415755', brand], ['A match to a team (menu)', '/matches/1415755', menu('Teams')],
];
module.exports = { FLOWS };
