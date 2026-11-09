/** Player URLs read `/players/v-kohli-ba607b88`: a readable name, then the 8 character player id the lookup uses. */
export function playerSlug(name: string, playerId: string): string {
  const readable = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return readable ? `${readable}-${playerId}` : playerId;
}

export function playerIdFromSlug(slug: string): string | null {
  const id = slug.slice(-8);
  return /^[0-9a-f]{8}$/.test(id) && (slug.length === 8 || slug[slug.length - 9] === '-') ? id : null;
}

/** Match URLs read `/matches/india-v-england-2024-03-12-1426310`: the two sides, the date, then the match id the lookup uses. */
export function matchSlug(teamA: string, teamB: string, date: string, matchId: number): string {
  const words = (text: string): string => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const readable = [words(teamA), 'v', words(teamB), date].filter(Boolean).join('-');
  return `${readable}-${matchId}`;
}

export function matchIdFromSlug(slug: string): number | null {
  const found = /(?:^|-)(\d{1,9})$/.exec(slug);
  return found ? Number(found[1]) : null;
}

/** Team URLs read `/teams/india~intl~male`: the team id of the data with '|' written as '~', so the page can name its file from the address alone. */
export function teamSlug(teamId: string): string { return teamId.replace(/\|/g, '~'); }
export function teamIdFromSlug(slug: string): string | null { return /^[a-z0-9-]+~[a-z0-9-]+~(male|female)$/.test(slug) ? slug.replace(/~/g, '|') : null; }

/** Competition URLs read `/tournaments/t20-world-cup-male`: the tournament key. */
export function tournamentSlug(key: string): string { return key.toLowerCase().replace(/[^a-z0-9-]+/g, '-'); }
