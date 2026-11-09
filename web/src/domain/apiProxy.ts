import { isIP } from 'node:net';

/**
 * The API under this site's own /api. The pure parts of the proxy: which paths go to the API, where they go, which request headers go with them, and who the visitor is.
 * `/api` itself is the app's own page and is never sent on. Only these paths are, and only GET.
 */
export const API_MATCHER = ['/api/v1/:path+', '/api/health', '/api/status', '/api/freshness', '/api/docs', '/api/docs/assets/:name', '/api/openapi.json'];

const SEGMENT = /^[A-Za-z0-9._~%-]+$/;
const ASSET = /^[A-Za-z0-9._-]{1,64}$/;
const FIXED = new Set(['health', 'freshness']);
/**
 * The status page and its JSON come from the status service (api/status in the dataset repo), not from the API, so they still answer when the API's server is down. `/api/status` is the page and
 * `/api/v1/status` is the JSON. The API's own `/status` stays reachable on its own host for the refresh tooling. Returns the path on the status service, or null.
 */
export function statusPath(pathname: string): '/' | '/status.json' | null {
  if (pathname === '/api/status') return '/';
  if (pathname === '/api/v1/status') return '/status.json';
  return null;
}

/** The only request headers of the visitor's that go on to the API. */
const PASS = ['accept', 'if-none-match'] as const;
/** The headers the platform sets itself and overwrites on every request, all holding the visitor's address. Nothing a visitor can name. */
const VISITOR = ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for'] as const;

/** The path the API knows this one by, or null for anything that is not an allowed API path. The web variant lives under /_via/web, so its answers are kept apart from direct callers' by every cache. */
export function mapApiPath(pathname: string): string | null {
  const parts = pathname.split('/');                                             // ['', 'api', ...]
  if (parts[0] !== '' || parts[1] !== 'api' || parts.length < 3) return null;
  const rest = parts.slice(2);
  for (const seg of rest) {
    if (!SEGMENT.test(seg) || seg === '.' || seg === '..') return null;          // empty segments (a '//' or a trailing '/') fail the pattern
    let decoded: string;
    try { decoded = decodeURIComponent(seg); } catch { return null; }
    if (decoded.includes('/') || decoded.includes('\\') || decoded === '.' || decoded === '..' || /[\u0000-\u001f]/.test(decoded) || /%[0-9a-f]{2}/i.test(decoded)) return null;   // the last test refuses a double-encoded segment
  }
  const [first = '', second = '', third = ''] = rest;
  if (statusPath(pathname) !== null) return null;                                // the status page and its JSON are answered by the status service, never by the API
  if (rest.length === 1 && FIXED.has(first)) return `/_via/web/${first}`;
  if (rest.length === 1 && first === 'docs') return '/_via/web/docs';
  if (rest.length === 1 && first === 'openapi.json') return '/_via/web/openapi.json';
  if (rest.length === 3 && first === 'docs' && second === 'assets' && ASSET.test(third)) return `/_via/web/docs/assets/${third}`;
  if (first === 'v1' && rest.length >= 2) return `/_via/web/${rest.join('/')}`;
  return null;
}

/** The visitor's address from the platform's own headers, or null. A forged x-web-client-ip or anything else the visitor sent is never read. */
export function visitorAddress(get: (name: string) => string | null): string | null {
  for (const name of VISITOR) {
    const first = get(name)?.split(',')[0]?.trim();
    if (first && isIP(first)) return first;
  }
  return null;
}

/** The headers that go to the API: two of the visitor's, the credential and the visitor's address. Nothing else, so no cookie, authorization header or forged forwarding header can pass. */
export function upstreamHeaders(get: (name: string) => string | null, token: string): Headers {
  const out = new Headers();
  for (const name of PASS) { const value = get(name); if (value) out.set(name, value.slice(0, 512)); }
  out.set('x-web-proxy-token', token);
  const ip = visitorAddress(get);
  if (ip) out.set('x-web-client-ip', ip);
  return out;
}
