// Writes src/generated/addresses.json: every player id, match id, team slug and tournament slug that has a page, read from the data host. The proxy answers 404 for an address not in it without a network request (src/proxy.ts), and the sitemap uses the same lists.
// Runs before every build (the "prebuild" script). A host that does not answer fails the build, so a stale list is never shipped by accident. With no host set (a plain local run) the committed file is kept.
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.NEXT_PUBLIC_DATA_BASE_URL?.replace(/\/$/, '');
if (!base) { console.log('addresses: NEXT_PUBLIC_DATA_BASE_URL is not set, keeping src/generated/addresses.json'); process.exit(0); }

async function get(file) {
  const res = await fetch(`${base}/${file}`);
  if (!res.ok) throw new Error(`addresses: ${file} answered ${res.status}`);
  return res.json();
}
const tournamentSlug = (key) => key.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
const [plist, mlist, teams, tournaments] = await Promise.all([get('plist.json'), get('mlist.json'), get('t/index.json'), get('n/index.json')]);
const out = {
  players: plist.map((p) => String(p[0])),
  matches: mlist.rows.map((m) => Number(m[0])),
  teams: teams.map((t) => String(t[0]).replace(/\|/g, '~')),
  tournaments: tournaments.map((t) => tournamentSlug(String(t[0]))),
};
mkdirSync('src/generated', { recursive: true });
writeFileSync('src/generated/addresses.json', JSON.stringify(out));
console.log(`addresses: ${out.players.length} players, ${out.matches.length} matches, ${out.teams.length} teams, ${out.tournaments.length} tournaments`);
