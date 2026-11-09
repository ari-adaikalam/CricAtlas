import { describe, expect, it } from 'vitest';
import { COSTS, DATASET_LABELS, PRESETS, ROUTE_CARDS, apiAddress, dataName, datasetLabel, firstLines, jsonTokens, parseChecked, parseMeta, pathProblem, prettyAnswer, snapshotText, snippet } from '../apiPage';

describe('the API page', () => {
  it('names a data version by its friendly name, never by the hash', () => {
    expect(datasetLabel('5fc42bc763cd')).toBe('Dataset v3');
    expect(datasetLabel('3cb4dded36cd')).toBe('Dataset v1');
    expect(datasetLabel('ffffffffffff')).toBeNull();
    expect(datasetLabel(null)).toBeNull();
    expect(Object.values(DATASET_LABELS)).toEqual(['Dataset v1', 'Dataset v2', 'Dataset v3']);
  });

  it('sends only paths of the API', () => {
    expect(pathProblem('/v1/players?q=kohli')).toBeNull();
    expect(pathProblem('/health')).toBeNull();
    expect(pathProblem('  /v1/meta ')).toBeNull();
    expect(pathProblem('/docs')).not.toBeNull();
    expect(pathProblem('https://example.com/v1/meta')).not.toBeNull();
    expect(pathProblem('')).not.toBeNull();
  });

  it('writes the same request in three languages', () => {
    const base = 'https://api.test';
    expect(snippet('curl', '/v1/meta', base)).toBe('curl "https://api.test/v1/meta"');
    expect(snippet('js', '/v1/meta', base)).toContain('fetch("https://api.test/v1/meta")');
    expect(snippet('py', '/v1/meta', base)).toContain('requests.get("https://api.test/v1/meta")');
    expect(snippet('curl', '   ', base)).toBe('curl "https://api.test/v1/meta"');
  });

  it('splits a JSON text for colouring and joins back to the same text', () => {
    const text = JSON.stringify({ a: 'x', n: -1.5e3, ok: true, none: null, list: [1, 2] }, null, 2);
    const tokens = jsonTokens(text);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    expect(tokens.find((t) => t.text === '"a":')?.kind).toBe('k');
    expect(tokens.find((t) => t.text === '"x"')?.kind).toBe('s');
    expect(tokens.find((t) => t.text === 'true')?.kind).toBe('b');
    expect(tokens.find((t) => t.text === 'null')?.kind).toBe('z');
    expect(tokens.find((t) => t.text === '-1.5e3' || t.text === '-1500')?.kind).toBe('n');
  });

  it('never turns text from the API into markup: a tag stays plain text', () => {
    const tokens = jsonTokens('{"x": "<img src=x onerror=alert(1)>"}');
    expect(tokens.some((t) => t.text.includes('<img') && t.kind === 's')).toBe(true);
    expect(tokens.map((t) => t.text).join('')).toBe('{"x": "<img src=x onerror=alert(1)>"}');
  });

  it('cuts a long answer after the given lines and says how many there were', () => {
    const long = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const cut = firstLines(long, 160);
    expect(cut.cut).toBe(true);
    expect(cut.total).toBe(200);
    expect(cut.shown.split('\n')).toHaveLength(160);
    expect(firstLines('a\nb', 160)).toEqual({ shown: 'a\nb', cut: false, total: 2 });
  });

  it('prints JSON with two spaces and leaves other text as it came', () => {
    expect(prettyAnswer('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyAnswer('not json')).toBe('not json');
  });

  it('reads the status line from /v1/meta and refuses another shape', () => {
    const meta = { data: { data_version: '5fc42bc763cd', snapshot_date: '2026-10-10', tables: { matches: { rows: 14585 }, balls: { rows: 5852078 }, players: { rows: 9643 } } } };
    expect(parseMeta(meta)).toEqual({ label: 'Dataset v3', matches: 14585, balls: 5852078, players: 9643, snapshot: '2026-10-10' });
    expect(parseMeta({ data: { tables: {} } })).toBeNull();
    expect(parseMeta(null)).toBeNull();
    expect(parseMeta('x')).toBeNull();
  });

  it('shows the name the API gives the data, so the page, the documentation and the emails agree', () => {
    const tables = { matches: { rows: 1 }, balls: { rows: 2 }, players: { rows: 3 } };
    const named = (coverage: unknown, version = '2a3579eb5b8f') => parseMeta({ data: { data_version: version, snapshot_date: '2026-10-28', coverage, tables } })?.label;
    expect(named({ dataset_label: null, dataset_display_name: 'Data of 2026-10-28' })).toBeNull();                                  // the date has its own pill
    expect(named({ dataset_label: 'Dataset v3', dataset_display_name: 'Dataset v3' }, '5fc42bc763cd')).toBe('Dataset v3');
    expect(named({ dataset_display_name: '2a3579eb5b8f' })).toBeNull();                       // a name equal to the hash is no name: the hash is never shown
    expect(named({ dataset_display_name: 'x'.repeat(61) })).toBeNull();
    expect(named({ dataset_display_name: 42 })).toBeNull();
    expect(named(undefined)).toBeNull();
    expect(named(undefined, '5fc42bc763cd')).toBe('Dataset v3');                              // an older server that names nothing: the known labels
    expect(dataName({}, null)).toBeNull();
  });

  it('builds the address a person pastes: this site in front of /api, or a full address as it is', () => {
    expect(apiAddress('/api', 'https://site.test')).toBe('https://site.test/api');
    expect(apiAddress('https://api.test', 'https://site.test')).toBe('https://api.test');
    expect(snippet('curl', '/v1/meta', apiAddress('/api', 'https://site.test'))).toBe('curl "https://site.test/api/v1/meta"');
  });

  it('reads the day of the last successful source check', () => {
    expect(parseChecked({ refresh: { last_successful_check_utc: '2026-10-31T00:06:54Z' } })).toBe('2026-10-31');
    expect(parseChecked({ data: { refresh: { last_successful_check_utc: '2026-10-30T15:09:08Z' } } })).toBe('2026-10-30');
    expect(parseChecked({ refresh: {} })).toBe('');
    expect(parseChecked(null)).toBe('');
  });

  it('writes the snapshot date in words', () => {
    expect(snapshotText('2026-10-10')).toBe('10 Oct 2026');
    expect(snapshotText('soon')).toBe('soon');
  });

  it('keeps every example inside /v1/ and the costs as the API README gives them', () => {
    for (const [, p] of PRESETS) expect(pathProblem(p)).toBeNull();
    for (const c of ROUTE_CARDS) for (const [, p] of c.paths) expect(p.startsWith('/v1/')).toBe(true);
    expect(COSTS.map(([, n]) => n)).toEqual([5, 3, 2, 1]);
  });
});
