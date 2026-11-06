import { describe, expect, it } from 'vitest';
import { earlyFetchScript } from '../earlyFetch';

type Link = { rel: string; as: string; href: string; crossOrigin: string };

/** Runs the script against a fake address and returns the link it adds, or null. */
function run(path: string, base: string | undefined = 'https://data.test/v1'): Link | null {
  let added: Link | null = null;
  const document = { createElement: (): Link => ({ rel: '', as: '', href: '', crossOrigin: '' }), head: { appendChild: (l: Link) => { added = l; } } };
  new Function('location', 'document', earlyFetchScript(base))({ pathname: path }, document);
  return added;
}

describe('earlyFetchScript', () => {
  it('asks for the data file each kind of address needs', () => {
    expect(run('/players/v-kohli-ba607b88')?.href).toBe('https://data.test/v1/p/profile/ba607b88.json');
    expect(run('/matches/india-v-pakistan-2022-10-23-1298150')?.href).toBe('https://data.test/v1/m/bundle/1298150.json');
    expect(run('/teams/india~intl~male')?.href).toBe('https://data.test/v1/t/b/india~intl~male.json');
    expect(run('/tournaments/ipl')?.href).toBe('https://data.test/v1/n/b/ipl.json');
  });
  it('is a preload of a fetch that the page can share', () => {
    expect(run('/players/ba607b88')).toMatchObject({ rel: 'preload', as: 'fetch', crossOrigin: 'anonymous' });
  });
  it('does nothing on other pages, the shell, or without a data host', () => {
    expect(run('/players')).toBeNull();
    expect(run('/api')).toBeNull();
    expect(run('/players/_shell')).toBeNull();
    expect(run('/players/not-an-id')).toBeNull();
    expect(earlyFetchScript(undefined)).toBe('');
  });
});
