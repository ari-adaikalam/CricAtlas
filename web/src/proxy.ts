import { NextResponse, type NextRequest } from 'next/server';
import { addressChecker } from '@/domain/addresses';
import { mapApiPath, upstreamHeaders } from '@/domain/apiProxy';
import lists from '@/generated/addresses.json';

/**
 * An address that names a player, match, team or tournament the data does not have answers 404, not 200 with a not-found panel (Ari, 2026-10-24). The check is a lookup in the lists the build
 * wrote (scripts/build-addresses.mjs), so it costs no request. A missing address is rewritten to `/<section>/_`, which gives that section's not-found page with a 404 status. A real address is
 * rewritten to one prebuilt page for its section, `/<section>/_shell` (2026-10-28): the page is the same for every player, match, team and tournament, and the browser reads which one from the
 * address, so the first visit to an address nobody has opened yet is served from the edge like every other (it was 0.6 to 0.9 s of rendering on demand).
 *
 * The same file sends the API's paths under /api to the API. The origin and the credential are read when a request arrives, never at build time, so neither
 * is in the build. Without both, the API paths answer 503 and send nothing.
 */
const known = addressChecker(lists);

function api(req: NextRequest): NextResponse {
  const origin = process.env.API_PROXY_ORIGIN ?? '';
  const token = process.env.API_PROXY_TOKEN ?? '';
  if (!origin || !token) return new NextResponse('not configured', { status: 503 });
  if (req.method !== 'GET') return new NextResponse(null, { status: 405, headers: { Allow: 'GET' } });       // the API itself answers every other method with 405
  const path = mapApiPath(req.nextUrl.pathname);
  if (path === null) return new NextResponse(null, { status: 404 });
  const headers = upstreamHeaders((name) => req.headers.get(name), token);
  return NextResponse.rewrite(new URL(origin + path + req.nextUrl.search), { request: { headers } });
}

export function proxy(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith('/api/')) return api(req);
  const [, section, slug] = req.nextUrl.pathname.split('/');
  if (!section || !slug || slug === '_' || slug === '_shell') return NextResponse.next();
  let name: string;
  try { name = decodeURIComponent(slug); } catch { return NextResponse.rewrite(new URL(`/${section}/_`, req.url), { status: 404 }); }
  if (!known(section, name)) return NextResponse.rewrite(new URL(`/${section}/_`, req.url), { status: 404 });
  return NextResponse.rewrite(new URL(`/${section}/_shell`, req.url));
}

// Next reads this at compile time, so it must be a literal (a spread of an imported list is refused). The API part must equal API_MATCHER: src/domain/__tests__/apiProxy.test.ts checks it.
export const config = { matcher: ['/players/:slug', '/matches/:slug', '/teams/:slug', '/tournaments/:slug', '/api/v1/:path+', '/api/health', '/api/status', '/api/freshness', '/api/docs', '/api/docs/assets/:name', '/api/openapi.json'] };
