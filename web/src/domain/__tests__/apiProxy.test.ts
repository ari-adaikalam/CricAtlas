import { describe, expect, it } from 'vitest';
import { config } from '../../proxy';
import { API_MATCHER, mapApiPath, upstreamHeaders, visitorAddress } from '../apiProxy';

const headers = (h: Record<string, string>) => (name: string): string | null => h[name] ?? null;

describe('the API on this domain: which paths go to the API', () => {
  it('maps the allowed paths and sends the web variant of the documentation to its own place', () => {
    expect(mapApiPath('/api/v1/meta')).toBe('/_via/web/v1/meta');
    expect(mapApiPath('/api/v1/players/abc-123')).toBe('/_via/web/v1/players/abc-123');
    expect(mapApiPath('/api/v1/teams/x%20y')).toBe('/_via/web/v1/teams/x%20y');
    expect(mapApiPath('/api/health')).toBe('/_via/web/health');
    expect(mapApiPath('/api/status')).toBe('/_via/web/status');
    expect(mapApiPath('/api/freshness')).toBe('/_via/web/freshness');
    expect(mapApiPath('/api/docs')).toBe('/_via/web/docs');
    expect(mapApiPath('/api/openapi.json')).toBe('/_via/web/openapi.json');
    expect(mapApiPath('/api/docs/assets/docs.css')).toBe('/_via/web/docs/assets/docs.css');
  });

  it('never sends the app\'s own /api page, the development route or anything not named', () => {
    for (const p of ['/api', '/api/', '/api/dev/phone-check', '/api/foo', '/api/v1', '/api/v10/x', '/api/healthz', '/api/health/x', '/api/status/x', '/api/docs/', '/api/docs/assets/', '/api/docs/assets/a/b',
      '/api/docs/x', '/api/openapi.json/x', '/api/V1/meta', '/API/v1/meta', '/_via/web/v1/meta', '/v1/meta', '/']) expect(mapApiPath(p), p).toBeNull();
  });

  it('refuses traversal, encoded slashes, double encoding, control characters and empty segments', () => {
    for (const p of ['/api/v1/../docs', '/api/v1/%2e%2e/docs', '/api/v1/%2E%2E/docs', '/api/v1/a%2Fb', '/api/v1/a%2fb', '/api/v1/a%5Cb', '/api/v1/%00', '/api/v1/a%00b', '/api/v1/%252e%252e/docs',
      '/api/v1//meta', '/api//v1/meta', '/api/v1/meta/', '/api/v1/.', '/api/v1/%', '/api/v1/%zz', '/api/v1/a b', '/api/v1/a?b', '/api/v1/a#b', '/api/docs/assets/a%2Fb', '/api/docs/assets/%2e%2e']) expect(mapApiPath(p), p).toBeNull();
  });

  it('matches exactly the paths it maps, so the matcher and the function cannot drift apart', () => {
    expect(API_MATCHER).toEqual(['/api/v1/:path+', '/api/health', '/api/status', '/api/freshness', '/api/docs', '/api/docs/assets/:name', '/api/openapi.json']);
    expect(config.matcher.filter((m) => m.startsWith('/api/'))).toEqual(API_MATCHER);                       // the literal in src/proxy.ts
    expect(API_MATCHER.every((m) => m.startsWith('/api/') && m !== '/api')).toBe(true);
  });
});

describe('the API on this domain: who the visitor is and what goes with the request', () => {
  it('takes the visitor from the platform headers only, in order, and only a clean address', () => {
    expect(visitorAddress(headers({ 'x-vercel-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
    expect(visitorAddress(headers({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(visitorAddress(headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }))).toBe('203.0.113.5');
    expect(visitorAddress(headers({ 'x-vercel-forwarded-for': '198.51.100.1', 'x-forwarded-for': '203.0.113.9' }))).toBe('198.51.100.1');
    for (const bad of ['not-an-ip', '999.1.1.1', '', ' ', '1.2.3.4:80', 'evil.example']) expect(visitorAddress(headers({ 'x-vercel-forwarded-for': bad })), bad).toBeNull();
    expect(visitorAddress(headers({}))).toBeNull();
  });

  it('never reads a header a visitor names themselves', () => {
    expect(visitorAddress(headers({ 'x-web-client-ip': '66.66.66.66', 'x-client-ip': '77.77.77.77', 'cf-connecting-ip': '44.44.44.44', forwarded: 'for=99.99.99.99' }))).toBeNull();
  });

  it('sends two of the visitor\'s headers, the credential and the visitor, and nothing else', () => {
    const out = upstreamHeaders(headers({ accept: 'application/json', 'if-none-match': 'W/"x"', cookie: 'a=b', authorization: 'Bearer x', 'x-web-proxy-token': 'forged', 'x-web-client-ip': '66.66.66.66',
      'x-forwarded-host': 'evil.example', 'x-vercel-forwarded-for': '203.0.113.7' }), 'the-real-credential');
    expect([...out.keys()].sort()).toEqual(['accept', 'if-none-match', 'x-web-client-ip', 'x-web-proxy-token']);
    expect(out.get('x-web-proxy-token')).toBe('the-real-credential');
    expect(out.get('x-web-client-ip')).toBe('203.0.113.7');
  });

  it('sends no visitor header when no clean address is known, and caps a long conditional header', () => {
    const out = upstreamHeaders(headers({ 'if-none-match': 'x'.repeat(2000), 'x-forwarded-for': 'junk' }), 't');
    expect(out.has('x-web-client-ip')).toBe(false);
    expect(out.get('if-none-match')?.length).toBe(512);
  });
});
