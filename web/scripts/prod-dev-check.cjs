// A production build has no development route: the /dev pages, the phone check page and its report route are `.dev` files that Next only builds in development.
//   NEXT_DIST_DIR=.next-prod npx next build && node scripts/prod-dev-check.cjs [.next-prod]
// Fails when the build's route list has a /dev path or the phone check report route, or when any built file holds the report path.
const fs = require('fs');
const path = require('path');
const dir = process.argv[2] ?? '.next-prod';
const manifest = path.join(dir, 'server', 'app-paths-manifest.json');
if (!fs.existsSync(manifest)) { console.log(`no build in ${dir}: run the build first`); process.exit(2); }
const routes = Object.keys(JSON.parse(fs.readFileSync(manifest, 'utf8')));
const bad = routes.filter((r) => r.startsWith('/dev') || r.includes('phone-check'));
const walk = (d, out = []) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p, out); else if (/\.(js|json|html|rsc|txt)$/.test(f)) out.push(p); } return out; };
const holding = walk(dir).filter((f) => fs.readFileSync(f, 'utf8').includes('/api/dev/phone-check'));
console.log(`${routes.length} routes in the build`);
if (bad.length || holding.length) { console.log(`development routes in a production build: ${[...bad, ...holding].join(', ')}`); process.exit(1); }
console.log('no development route in the build');
