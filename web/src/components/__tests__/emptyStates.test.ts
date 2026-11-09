import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PartnershipsBody } from '../PartnershipsTile';
import { StreaksBody } from '../StreaksTile';
import { TrophiesBody } from '../TrophiesTile';
import { trophies } from '@/domain/trophies';

// The empty states of the Records tiles, which real players rarely reach (every bowler checked has some bowling partnership, for instance).
describe('Records empty states', () => {
  it('Partnerships says there are none, for batting and for bowling', () => {
    const bat = renderToStaticMarkup(createElement(PartnershipsBody, { side: 'bat', name: 'A B', bat: [], bowl: [] }));
    const bowl = renderToStaticMarkup(createElement(PartnershipsBody, { side: 'bowl', name: 'A B', bat: [], bowl: [] }));
    expect(bat).toContain('No batting partnerships in this format or competition.');
    expect(bowl).toContain('No bowling partnerships in this format or competition.');
  });
  it('Trophies says there are no editions, and bilateral series are not counted', () => {
    expect(renderToStaticMarkup(createElement(TrophiesBody, { data: trophies([]) }))).toContain('No tournament editions in these filters. Bilateral series are not counted.');
  });
  it('Streaks keeps a card that never held, dimmed, with its reason', () => {
    const html = renderToStaticMarkup(createElement(StreaksBody, { cards: [{ label: 'Hundreds', best: null, top: [], why: 'No hundred in these filters' }] }));
    expect(html).toContain('skz');
    expect(html).toContain('No hundred in these filters');
    expect(html).not.toContain('Running now');
  });
});
