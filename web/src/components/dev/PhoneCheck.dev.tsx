'use client';

// The phone check page, walk mode. Development only: this file and its page and route are `.dev` files that a production build does not contain.
// It loads a page of the app in a frame as large as the screen, so the page sees the phone's own viewport, then goes through every view and every tile stop the way a person would (clicking
// the view buttons and the timeline dots), measures what is on screen at each stop and sends the report to /api/dev/phone-check. The report is also shown here, so a screenshot of it will do.

import { useEffect, useRef, useState } from 'react';
import { MIN_FILL, passesEdge, reportLines, summarise, tapTooSmall, fillRatio, isEmptyTile, SLACK, type Issue, type Report, type Step } from '@/domain/phoneCheck';

interface ViewButton { text: string; exact: boolean; scope?: string }

/** The view switches of each kind of page, as the desktop lock reaches them. */
function viewsFor(url: string): ViewButton[] {
  if (url.startsWith('/players/')) return [{ text: 'Batting analysis', exact: false }, { text: 'Bowling', exact: true, scope: '#vsw' }, { text: 'Records', exact: true, scope: '#vsw' }, { text: 'Full stats', exact: true, scope: '#vsw' }];
  if (url.startsWith('/teams/')) return [{ text: 'Results', exact: false, scope: '.btns' }, { text: 'Players', exact: true, scope: '#vsw' }, { text: 'Bat, bowl, field', exact: true, scope: '#vsw' }];
  if (url.startsWith('/tournaments/')) return [{ text: 'Overview', exact: false, scope: '.btns' }, { text: 'Players', exact: true, scope: '#vsw' }, { text: 'Teams and matches', exact: true, scope: '#vsw' }];
  if (url.startsWith('/matches/')) return [{ text: 'Match analysis', exact: false }, { text: 'Replay', exact: true, scope: '#vsw' }, { text: 'Details', exact: true, scope: '#vsw' }];
  return [];
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const visibleRect = (win: Window, el: Element): DOMRect | null => {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const cs = win.getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return null;
  return r;
};

const describe = (el: Element): string => {
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
  return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${text ? ` "${text}"` : ''}`;
};

/** An ancestor between `el` and `stop` that clips or scrolls its content hides what pokes out of it. */
const clippedBetween = (win: Window, el: Element, stop: Element): boolean => {
  for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
    const cs = win.getComputedStyle(p);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return true;
  }
  return false;
};

/** The nearest ancestor (up to and including `stop`) that hides what runs past it, with no scroll bar to reach it: overflow hidden or clip. Null when there is none. */
const hiddenBy = (win: Window, el: Element, stop: Element): Element | null => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const cs = win.getComputedStyle(p);
    const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowY === 'auto' || cs.overflowY === 'scroll';
    if (scrolls) return null;
    if (cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.overflowY === 'hidden' || cs.overflowY === 'clip') return p;
    if (p === stop) break;
  }
  return null;
};

const ROW = 'table, [data-rows], [data-mrow], tbody tr';

/** The tiles that are on screen: at least 60% of their width inside the window. */
function visibleTiles(win: Window, doc: Document): Element[] {
  return [...doc.querySelectorAll('[data-tile]')].filter((t) => {
    const r = visibleRect(win, t);
    if (!r) return false;
    return (Math.min(r.right, win.innerWidth) - Math.max(r.left, 0)) / r.width >= 0.6 && r.bottom > 0 && r.top < win.innerHeight;
  });
}

export function measure(win: Window, doc: Document, name: string, replays: string[]): Step {
  const issues: Issue[] = [];
  const add = (kind: Issue['kind'], where: string, detail: string): void => { issues.push({ kind, where, detail }); };

  // The page is wider than the window.
  const sw = doc.documentElement.scrollWidth;
  if (sw > win.innerWidth + SLACK) add('sideways', 'page', `${sw}px wide in a ${win.innerWidth}px window`);

  const tiles = visibleTiles(win, doc);
  const car = doc.querySelector('.car');

  // Anything on screen that runs past the right edge, outside a scroll area and the carousel (whose next tile peeks on purpose).
  for (const el of doc.body.querySelectorAll('*')) {
    if (car && car.contains(el)) continue;
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const r = visibleRect(win, el);
    if (!r || r.left >= win.innerWidth || r.right <= win.innerWidth + SLACK) continue;
    let scroller = false;
    for (let p = el.parentElement; p; p = p.parentElement) { const cs = win.getComputedStyle(p); if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') { scroller = true; break; } }
    if (!scroller) { add('sideways', describe(el), `ends at ${Math.round(r.right)}px in a ${win.innerWidth}px window`); if (issues.length > 40) break; }
  }

  // Tap targets.
  for (const el of doc.querySelectorAll('button, [role="button"], input, select, textarea, a')) {
    const cs = win.getComputedStyle(el);
    if (el.tagName === 'A' && cs.display === 'inline') continue;
    const r = visibleRect(win, el);
    if (!r || r.right <= 0 || r.left >= win.innerWidth || r.bottom <= 0 || r.top >= win.innerHeight) continue;
    if (el.closest('[inert], [aria-hidden="true"]')) continue;
    if (tapTooSmall(r.width, r.height)) add('tap', describe(el), `${Math.round(r.width)}x${Math.round(r.height)}px`);
  }

  for (const tile of tiles) {
    const tr = tile.getBoundingClientRect();
    const id = tile.getAttribute('data-tile') ?? describe(tile);
    let lowest = tr.top;
    let shown = 0;
    for (const el of tile.querySelectorAll('*')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const r = visibleRect(win, el);
      if (!r) continue;
      const hasContent = el.tagName === 'svg' || el.tagName === 'CANVAS' || el.tagName === 'IMG' || [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      if (hasContent) lowest = Math.max(lowest, Math.min(r.bottom, tr.bottom + 400));
      // Past its panel: a box outside the tile that no clipping or scrolling ancestor hides.
      if (shown < 5 && passesEdge(r, tr) && !clippedBetween(win, el, tile)) { add('past-panel', `${id}: ${describe(el)}`, `box ${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} in tile ${Math.round(tr.left)},${Math.round(tr.top)} to ${Math.round(tr.right)},${Math.round(tr.bottom)}`); shown += 1; }
      // Cut off: text or a chart that runs past a container that hides it and has no scroll bar, so it can't be reached. Text with an ellipsis is cut on purpose.
      if (hasContent && shown < 5 && !/ellipsis/.test(win.getComputedStyle(el).textOverflow)) {
        const clip = hiddenBy(win, el, tile);
        if (clip && !/ellipsis/.test(win.getComputedStyle(clip).textOverflow)) {
          const cr = clip.getBoundingClientRect();
          if (passesEdge(r, cr)) { add('clipped', `${id}: ${describe(el)}`, `cut off by ${describe(clip).split(' ')[0]}`); shown += 1; }
        }
      }
      // Scrolls although it is not a table or a list.
      const cs = win.getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + SLACK && !el.matches(ROW) && !el.querySelector(ROW)) add('scrolls', `${id}: ${describe(el)}`, `${el.scrollHeight}px of content in ${el.clientHeight}px`);
    }
    const holdsRows = tile.matches(ROW) || tile.querySelector(ROW) !== null;
    const ratio = fillRatio(tr.top, tr.height, lowest);
    if (isEmptyTile(ratio, holdsRows)) add('empty', id, `content fills ${Math.round(ratio * 100)}% of the tile (under ${Math.round(MIN_FILL * 100)}%)`);
    const own = win.getComputedStyle(tile);
    if ((own.overflowY === 'auto' || own.overflowY === 'scroll') && tile.scrollHeight > tile.clientHeight + SLACK && !holdsRows) add('scrolls', id, `the tile holds ${tile.scrollHeight}px in ${tile.clientHeight}px`);
  }

  for (const r of replays.splice(0)) add('replay', r, 'started the same animation again');
  return { name, issues };
}

/** The first button with this text (inside the scope when there is one), or null. */
function findButton(doc: Document, v: ViewButton): HTMLElement | null {
  const root = v.scope ? doc.querySelector(v.scope) : doc;
  if (!root) return null;
  return ([...root.querySelectorAll('button')].find((b) => { const t = (b.textContent ?? '').trim(); return v.exact ? t === v.text : t.includes(v.text); }) as HTMLElement | undefined) ?? null;
}

/** The timeline dots of the carousel that is on screen. */
function dots(win: Window, doc: Document): HTMLElement[] {
  const rows = [...doc.querySelectorAll('.rtr')].filter((r) => { const b = r.getBoundingClientRect(); return b.width > 0 && b.left < win.innerWidth && b.right > 0; });
  const row = rows[rows.length - 1];
  return row ? ([...row.querySelectorAll('.nd')] as HTMLElement[]) : [];
}

async function walk(frame: HTMLIFrameElement, url: string, say: (s: string) => void): Promise<Step[]> {
  const win = frame.contentWindow as Window;
  const doc = frame.contentDocument as Document;
  const replays: string[] = [];
  const ids = new WeakMap<object, number>();
  let lastId = 0;
  const seen = new Map<string, number>();
  doc.addEventListener('animationstart', (e) => {
    const t = e.target as Element;
    if (t.nodeType !== 1 || /infinite/.test(win.getComputedStyle(t).animationIterationCount) || e.animationName === 'rowsUnstick') return;
    if (!ids.has(t)) { lastId += 1; ids.set(t, lastId); }
    const key = `${ids.get(t)}:${e.animationName}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n === 2) replays.push(`${describe(t)} ${e.animationName}`);
  }, true);

  const steps: Step[] = [];
  const stops = async (label: string): Promise<void> => {
    steps.push(measure(win, doc, label, replays));
    const nodes = dots(win, doc);
    for (let i = 1; i < nodes.length; i++) {
      const fresh = dots(win, doc);
      const node = fresh[i];
      if (!node) break;
      say(`${label}: tile ${i + 1} of ${fresh.length}`);
      node.click();
      await wait(900);
      steps.push(measure(win, doc, `${label}, ${node.getAttribute('aria-label') ?? `tile ${i + 1}`}`, replays));
    }
  };

  say('opening');
  await wait(3500);
  await stops('open');
  for (const v of viewsFor(url)) {
    const b = findButton(doc, v);
    if (!b) { steps.push({ name: v.text, issues: [{ kind: 'tap', where: v.text, detail: 'no button for this view was found on screen' }] }); continue; }
    say(v.text);
    b.click();
    await wait(2500);
    await stops(v.text);
  }
  return steps;
}

export function PhoneCheck() {
  const [url, setUrl] = useState<string | null>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  const [status, setStatus] = useState('choose a page');
  const [started, setStarted] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const u = q.get('url');
    if (u && u.startsWith('/') && !u.startsWith('//')) { setUrl(u); if (q.get('auto') === '1') setStarted(true); }
  }, []);

  useEffect(() => {
    if (!started || !url || !frame.current) return;
    const f = frame.current;
    let cancelled = false;
    // A probe instead of a walk: `?scrollx=<selector>|<pixels>` scrolls that element sideways from script once the page has settled, so how a real browser draws a scrolled table can be looked at without a finger.
    const probe = new URLSearchParams(window.location.search).get('scrollx');
    if (probe) {
      const go = async (): Promise<void> => {
        await wait(6000);
        // `?css=<rules>` adds style rules to the page first, to see which rule a real browser draws wrongly.
        const extra = new URLSearchParams(window.location.search).get('css');
        if (extra && f.contentDocument) { const st = f.contentDocument.createElement('style'); st.textContent = extra; f.contentDocument.head.appendChild(st); await wait(500); }
        const [selector, px] = probe.split('|');
        const el = f.contentDocument?.querySelector<HTMLElement>(selector ?? '');
        if (!el) { setStatus(`probe: nothing matches ${selector}`); return; }
        el.scrollLeft = Number(px);
        setStatus(`probe: ${selector} scrollLeft is ${el.scrollLeft} of ${el.scrollWidth - el.clientWidth}`);
      };
      f.addEventListener('load', () => { void go(); }, { once: true });
      return;
    }
    const run = async (): Promise<void> => {
      try {
        const steps = await walk(f, url, setStatus);
        if (cancelled) return;
        const fw = f.contentWindow as Window;
        const report: Report = summarise(url, [fw.innerWidth, fw.innerHeight], window.devicePixelRatio, navigator.userAgent, steps);
        setLines(reportLines(report));
        const res = await fetch('/api/dev/phone-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
        setStatus(res.ok ? `report saved: ${((await res.json()) as { file: string }).file}` : `report not saved (${res.status})`);
      } catch (e) {
        setStatus(`the walk stopped: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    f.addEventListener('load', run, { once: true });
    return () => { cancelled = true; };
  }, [started, url]);

  if (!url) {
    return <main style={{ padding: 24, color: '#fff', font: '16px system-ui' }}><h1>Phone check</h1><p>Open this page with ?url=/players/ba607b88&amp;auto=1</p></main>;
  }
  return (
    <>
      {/* The check page is only a frame and a report: the app's own bar and footer would widen it on a phone. */}
      <style>{'html, body { overflow: hidden !important; height: 100%; } body > .site-nav, body > footer, .foot { display: none !important; }'}</style>
      {/* Larger than the screen of the check page itself, so the page in the frame sees the phone's own window. */}
      <iframe ref={frame} src={started ? url : 'about:blank'} title="page under check" style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', border: 0, background: '#000' }} />
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: lines ? '70vh' : 'auto', overflow: 'auto', background: 'rgba(0,0,0,.92)', color: '#fff', font: '12px/1.4 ui-monospace, Menlo, monospace', padding: 10, zIndex: 9999 }}>
        {!started && <button type="button" onClick={() => setStarted(true)} style={{ font: '16px system-ui', padding: '12px 20px', minHeight: 44 }}>Run the walk on {url}</button>}
        <div>{status}</div>
        {lines && <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{lines.join('\n')}</pre>}
      </div>
    </>
  );
}
