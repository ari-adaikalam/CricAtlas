import { describe, expect, it } from 'vitest';
import { bannerCounts } from '../apiBanner';

const meta = { data: { tables: { matches: { rows: 14705 }, balls: { rows: 5894759 }, players: { rows: 9700 } } } };

describe('bannerCounts', () => {
  it('gives matches, balls and players with thousands separators', () => {
    expect(bannerCounts(meta)).toEqual([
      { value: '14,705', label: 'matches' },
      { value: '5,894,759', label: 'balls' },
      { value: '9,700', label: 'players' },
    ]);
  });

  it('gives nothing when the answer is not the expected shape', () => {
    expect(bannerCounts(null)).toEqual([]);
    expect(bannerCounts({ data: { tables: { matches: { rows: 1 } } } })).toEqual([]);
  });
});
