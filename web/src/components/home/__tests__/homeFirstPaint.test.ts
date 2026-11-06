import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeFirstPaint } from '../HomeFirstPaint';
import { HeroReplay } from '../HeroReplay';
import type { TileDef } from '../../TileCarousel';

const tiles: TileDef[] = [
  { id: 'replay', label: 'Innings', group: 'Innings', title: 'Great innings', tag: 'Tracking', wide: true, tip: 'tip', body: null },
  { id: 'explore', label: 'Explore', group: 'Explore', title: 'Where to begin', wide: true, tip: 'tip', body: null },
  { id: 'data', label: 'The data', group: 'Today', title: 'The data behind it', tip: 'tip', body: null },
];

// The Home page's first paint is sent by the server before any script runs, so the middle of the page is never empty.
describe('Home first paint', () => {
  const html = renderToStaticMarkup(createElement(HomeFirstPaint, { name: 'Home', note: 'Click a stop to jump to it.', tiles }));

  it('draws the first tile with its title and the grey shapes in the hero', () => {
    expect(html).toContain('Great innings');
    expect(html).toContain('data-wait=""');
    for (const box of ['hm-hl', 'hm-pc', 'hm-pw', 'hm-cta', 'hm-ic wait']) expect(html).toContain(box);
  });
  it('carries the timeline for a laptop and for a phone, and hides it from assistive technology', () => {
    expect(html).toContain('rail-d');
    expect(html).toContain('rail-p');
    expect(html).toContain('1 of 3');
    expect(html).toContain('aria-hidden="true"');
  });
  it('draws only the first tile, with no data in it', () => {
    expect(html).not.toContain('Where to begin');
    expect(html).not.toMatch(/off \d+/);
  });
  it('keeps the waiting innings cards as tall as the loaded ones, so nothing moves when they fill in', () => {
    const waiting = renderToStaticMarkup(createElement(HeroReplay, { frozen: true }));
    expect((waiting.match(/hm-ic wait/g) ?? []).length).toBe(6);
    expect(waiting).toContain('<b> </b>');
  });
});
