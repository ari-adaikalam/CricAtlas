import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shareMeta, type ShareSection } from '../shareMeta';

const SECTIONS: ShareSection[] = ['home', 'players', 'teams', 'matches', 'tournaments', 'compare', 'records', 'series', 'api'];

describe('shareMeta', () => {
  it('points every section at a banner file that exists', () => {
    for (const section of SECTIONS.filter((s) => s !== 'api')) {
      const image = (shareMeta('X', section).openGraph as { images: { url: string }[] }).images[0]!;
      expect(existsSync(join(__dirname, '..', '..', '..', 'public', image.url)), section).toBe(true);
    }
  });

  it('points the API at its drawn banner route, which exists', () => {
    const image = (shareMeta('API', 'api').openGraph as { images: { url: string }[] }).images[0]!;
    expect(image.url).toBe('/og/api');
    expect(existsSync(join(__dirname, '..', '..', 'app', 'og', 'api', 'route.tsx'))).toBe(true);
  });

  it('gives each page a large-image card, a description and a branded title', () => {
    const meta = shareMeta('Players', 'players');
    expect((meta.twitter as { card: string }).card).toBe('summary_large_image');
    expect(meta.description).toBeTruthy();
    expect((meta.openGraph as { title: string }).title).toBe('Players | CricAtlas');
    expect((shareMeta(null, 'home').openGraph as { title: string }).title).toBe('CricAtlas');
  });
});
