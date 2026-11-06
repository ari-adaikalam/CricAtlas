import { describe, expect, it } from 'vitest';
import { FIXED_PAGES, sitemapPaths } from '../sitemap';

describe('sitemapPaths', () => {
  const paths = sitemapPaths(
    [['ba607b88', 'V Kohli', 'Virat Kohli']],
    { rows: [[1490706, 20221023]] },
    [['india|intl|male', 'India']],
    [['ipl', 'Indian Premier League']],
  );
  it('lists the fixed pages first', () => expect(paths.slice(0, FIXED_PAGES.length)).toEqual(FIXED_PAGES));
  it('writes each kind of page in the address form the pages use', () => {
    expect(paths).toContain('/players/v-kohli-ba607b88');
    expect(paths).toContain('/teams/india~intl~male');
    expect(paths).toContain('/tournaments/ipl');
    expect(paths).toContain('/matches/1490706');
  });
});
