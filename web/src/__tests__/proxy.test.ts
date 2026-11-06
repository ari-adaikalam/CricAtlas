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
