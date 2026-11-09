import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

const answer = (path: string) => proxy(new NextRequest(`http://app.test${path}`));

describe('proxy', () => {
  it('serves a real address from the one prebuilt page of its section', () => {
    const res = answer('/players/v-kohli-ba607b88');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-rewrite')).toContain('/players/_shell');
    expect(answer('/teams/india~intl~male').headers.get('x-middleware-rewrite')).toContain('/teams/_shell');
  });
  it('answers an address the data does not have with a 404', () => {
    const res = answer('/players/zzz-00000000');
    expect(res.status).toBe(404);
    expect(res.headers.get('x-middleware-rewrite')).toContain('/players/_');
  });
  it('answers a malformed escape with a 404 and not a server error', () => {
    expect(answer('/players/%E0%A4%A').status).toBe(404);
  });
  it('leaves the prebuilt page and the not-found page alone', () => {
    expect(answer('/players/_shell').headers.get('x-middleware-rewrite')).toBeNull();
    expect(answer('/players/_').headers.get('x-middleware-rewrite')).toBeNull();
  });
});

describe('proxy: the status page', () => {
  const get = (path: string, method = 'GET') => proxy(new NextRequest(`http://app.test${path}`, { method }));
  const withOrigin = (fn: () => void) => { process.env.STATUS_ORIGIN = 'https://status.example.test'; try { fn(); } finally { delete process.env.STATUS_ORIGIN; } };

  it('sends /api/status and /api/v1/status to the status service, with nothing of the visitor\'s', () => withOrigin(() => {
    const page = get('/api/status');
    expect(page.headers.get('x-middleware-rewrite')).toBe('https://status.example.test/');
    expect(get('/api/v1/status').headers.get('x-middleware-rewrite')).toBe('https://status.example.test/status.json');
    expect(page.headers.get('x-middleware-request-cookie')).toBeNull();
  }));
  it('answers 503 and sends nothing when the status service is not configured', () => {
    const res = get('/api/status');
    expect(res.status).toBe(503);
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });
  it('allows GET and HEAD only', () => withOrigin(() => {
    expect(get('/api/status', 'POST').status).toBe(405);
    expect(get('/api/v1/status', 'DELETE').headers.get('allow')).toBe('GET, HEAD');
    expect(get('/api/status', 'HEAD').headers.get('x-middleware-rewrite')).toBe('https://status.example.test/');
  }));
  it('sends /status to /api/status', () => {
    const res = get('/status');
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/api/status');
  });
  it('sends /docs to /api/docs', () => {
    const res = get('/docs');
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/api/docs');
  });
});
