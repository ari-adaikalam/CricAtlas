import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TipBody } from '../TipBody';

const html = (props: Parameters<typeof TipBody>[0]): string => renderToStaticMarkup(createElement(TipBody, props));

describe('TipBody', () => {
  it('writes a title, then each label with its value', () => {
    const out = html({ title: '2019', rows: [{ label: 'Runs', value: '1,234' }, { label: 'Average', value: '54.2' }] });
    expect(out).toContain('<b>2019</b>');
    expect(out).toContain('<dt>Runs</dt><dd>1,234</dd>');
    expect(out).toContain('<dt>Average</dt><dd>54.2</dd>');
  });
  it('leaves out the parts it was not given', () => {
    const out = html({ title: 'Over 12' });
    expect(out).not.toContain('ct-sub');
    expect(out).not.toContain('ct-rows');
    expect(out).not.toContain('ct-note');
  });
  it('writes each line under the title when given several', () => {
    const out = html({ title: 'Four', sub: ['Bumrah to Kohli', 'Over 12.3, score 98/2'] });
    expect(out.match(/ct-sub/g)?.length).toBe(2);
  });
  it('shows a line under the title, a swatch for a series and a note at the end', () => {
    const out = html({ title: 'Innings 14', sub: 'v Pakistan, 23 Oct 2022', rows: [{ label: 'India', value: '82', colour: '#56b4e9' }], note: 'Click to open the match' });
    expect(out).toContain('v Pakistan, 23 Oct 2022');
    expect(out).toContain('background:#56b4e9');
    expect(out.indexOf('Click to open the match')).toBeGreaterThan(out.indexOf('India'));
  });
});
