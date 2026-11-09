'use client';

import { useEffect } from 'react';
import { PHONE_QUERY } from './usePhone';

/**
 * A scroll bar shows only when the area really has more than fits (Ari, 2026-10-22), everywhere in the app. Two things made one show that was not needed: rows that play their entrance sit 14 px low, so a
 * full area looked too tall for a moment, and a few pixels of padding or a border at the bottom made content that fits scroll by a few pixels.
 *
 * Every area that can scroll vertically (the list below) starts with its bar off, before it is first painted, and then reads whether its content, not counting the padding under it, is taller than the area.
 * It does this after the stretch of useFitRows has run, again when its content or its size changes, and with the offset of anything that is rising in taken out, so it can decide at the first frame. An area that needs the bar gets it,
 * an area that does not keeps `overflow-y: hidden`. One observer does it for the whole page, so a new tile needs nothing.
 */
const AREAS = [
  '.tsc', '.tw.sc', '.kos', '.ugrid', '.bbl', '.minfo', '.fwrow', '.mil', '.trg', '.bpc', '.cbl2', '.dis2', '.log', '.mfill', '.awsl', '.spfs', '.res', '.pop', '.drows', '.obody', '.mu', '.ptw .ptr', '.phpair .phc', '.rview .rp-score > .pan',
  "[data-tile='key'] > .kgrid", "[data-tile='highs'] > .kgrid", "[data-tile='pitch'] > .art",
].join(', ');
const MARK = 'data-sg';

/** Splits a selector list at the commas that are not inside brackets, so `:is(a, b)` stays whole. */
function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0, from = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) { out.push(list.slice(from, i).trim()); from = i + 1; }
  }
  out.push(list.slice(from).trim());
  return out.filter(Boolean);
}

let found = '';
let foundFor = -1;
/**
 * Every selector in the stylesheets that makes an area scroll vertically (`overflow-y` or `overflow` set to auto or scroll), so a new page or tile is guarded without being added to a list (Ari,
 * 2026-10-24: a bar shows only where it is needed, and never for a few pixels of padding). It is read again when a stylesheet is added, because each page brings its own.
 */
function discovered(): string {
  if (foundFor === document.styleSheets.length) return found;
  foundFor = document.styleSheets.length;
  const picked = new Set<string>();
  const walk = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const y = rule.style.overflowY, x = rule.style.overflowX;
        // An area that scrolls sideways and says nothing about up and down scrolls up and down too (the browser makes it so), so a few pixels of height there show a bar as well.
        if (!((y === 'auto' || y === 'scroll') || ((x === 'auto' || x === 'scroll') && y === ''))) continue;
        for (const sel of splitSelectors(rule.selectorText)) {
          // Not a pseudo element or a state, and not the page itself.
          if (/::|:hover|:focus|:active|:disabled/.test(sel) || /^(html|body)\b/.test(sel)) continue;
          picked.add(sel);
        }
      } else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) { try { walk(sheet.cssRules); } catch { /* a sheet from another origin cannot be read */ } }
  found = [...picked].join(', ');
  return found;
}

const allAreas = (): string => [AREAS, discovered()].filter(Boolean).join(', ');

/** How many pixels of content past the end of an area do not earn a bar (Ari, 2026-10-24: never a bar for a few pixels). The last row's border or a few pixels of padding are cut instead. */
export const TINY = 6;

/** True when the content of the area is taller than the area by more than a few pixels. The padding under the content and rounding do not count. */
export function overflows(contentBottom: number, areaHeight: number): boolean {
  return contentBottom > areaHeight + TINY;
}

/** How far the content of an area reaches down and to the right, counted from the area's own top left. A block that is rising in or sliding in sits a few pixels away from its place while it moves: its own
 * offset does not count, so the answer is the same at the first frame and after the entrance. A positioned decoration (the Compare watermark, pulled up by 270 px) is not moving in, and its transform must
 * not count as 270 px of content below the area. A wrapper with `display: contents` has no box of its own: what it holds is what takes the room. */
function contentExtent(el: HTMLElement): { bottom: number; right: number } {
  const box = el.getBoundingClientRect();
  const top = box.top - el.scrollTop, left = box.left - el.scrollLeft;
  let bottom = 0, right = 0;
  const visit = (parent: Element): void => {
    for (const child of Array.from(parent.children)) {
      const r = child.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) { if (getComputedStyle(child).display === 'contents') visit(child); continue; }
      const cs = getComputedStyle(child), t = cs.transform;
      const m = t && t !== 'none' ? new DOMMatrix(t) : null;
      const moving = m !== null && cs.position !== 'absolute';
      bottom = Math.max(bottom, r.bottom - (moving ? m.m42 : 0) - top);
      right = Math.max(right, r.right - (moving ? m.m41 : 0) - left);
    }
  };
  visit(el);
  return { bottom, right };
}

/** When each area was first seen, and how long a small overshoot of a young area waits before it can show a bar. */
const born = new WeakMap<Element, number>();
/** Areas that also scroll sideways in their style sheet: their sideways bar is guarded the same way as the one up and down. */
const sideways = new WeakSet<Element>();
const SETTLE_MS = 600;
const SETTLE_PX = 40;

/** Writes an overflow only when it changes, so a measure that finds nothing new makes no style change at all. */
function put(el: HTMLElement, axis: 'overflowX' | 'overflowY', value: string): void { if (el.style[axis] !== value) el.style[axis] = value; }

/** The area a finger is on: its overflow is not changed while it is dragged (iPhone Safari sends a frame back to its start when it is). */
let touched: Element | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('touchstart', (e) => { touched = e.target instanceof Element ? e.target : null; }, { passive: true, capture: true });
  document.addEventListener('touchend', () => { window.setTimeout(() => { touched = null; }, 600); }, { passive: true, capture: true });
}

function measure(el: HTMLElement): void {
  if (el.getAttribute(MARK) !== '1') return;
  if (touched && el.contains(touched)) { window.setTimeout(() => measure(el), 700); return; }
  // A table that is still loading will fill its area, so its bar is there from the first frame and the table arrives into it without anything moving.
  if (el.querySelector(':scope > .twait')) { put(el, 'overflowY', 'scroll'); return; }
  if (el.clientHeight === 0) return;
  const { bottom, right } = contentExtent(el);
  // A page that is still laying itself out (a table stretching to fit) can overshoot its area by a little for a moment. A small overshoot in a young area waits for the layout to settle before it
  // earns a bar; a big one (a long list) has its bar at once.
  const age = performance.now() - (born.get(el) ?? 0), young = age < SETTLE_MS;
  const down = overflows(bottom, el.clientHeight), across = sideways.has(el) && overflows(right, el.clientWidth);
  const waitDown = down && young && bottom - el.clientHeight <= SETTLE_PX, waitAcross = across && young && right - el.clientWidth <= SETTLE_PX;
  put(el, 'overflowY', down && !waitDown ? '' : 'hidden');
  if (sideways.has(el)) put(el, 'overflowX', across && !waitAcross ? '' : 'hidden');
  if (waitDown || waitAcross) window.setTimeout(() => measure(el), SETTLE_MS - age + 30);
}

export function ScrollGuard(): null {
  useEffect(() => {
    // Not on a phone (Ari, 2026-10-26): its bars are thin overlays that show only while a finger scrolls, so there is nothing to hide, and writing an area's overflow while it is being scrolled or is gliding (which this does
    // whenever its content or size changes) made tables on an iPhone jump and stutter.
    if (window.matchMedia(PHONE_QUERY).matches) return;
    const sized = new WeakSet<Element>();
    const resizer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => { for (const e of entries) later(e.target.closest<HTMLElement>(`[${MARK}='1']`) ?? (e.target as HTMLElement)); });
    const timers = new WeakMap<Element, number>();
    function later(el: HTMLElement): void {
      if (el.getAttribute(MARK) !== '1') return;
      window.clearTimeout(timers.get(el));
      // After the stretch of useFitRows (the next frame). Rows that are still playing their entrance are waited for in `measure`.
      const wait = 0;
      timers.set(el, window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => measure(el))), wait));
    }
    let retry = 0;
    function scan(): void {
      let waiting = false;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(allAreas()))) {
        // An element that came with the page's HTML is left alone until React has taken it over: an attribute or style added before that makes the hydration report a mismatch.
        // An area that marks itself `data-noguard` scrolls both ways by design (the Matchups grid on a phone) and is never touched: switching its overflow while a finger moves it sent it back to its start.
        if (el.hasAttribute('data-noguard')) continue;
        if (!el.hasAttribute(MARK) && !Object.keys(el).some((k) => k.startsWith('__reactFiber'))) { waiting = true; continue; }
        if (!el.hasAttribute(MARK)) {
          // Read the stylesheet's choice before this code changes it.
          const o = getComputedStyle(el).overflowY;
          if (o === 'auto' || o === 'scroll') {
            el.setAttribute(MARK, '1'); born.set(el, performance.now());
            const x = getComputedStyle(el).overflowX;
            if (x === 'auto' || x === 'scroll') { sideways.add(el); el.style.overflowX = 'hidden'; }
            el.style.overflowY = 'hidden';
          } else { el.setAttribute(MARK, '0'); continue; }
        }
        if (el.getAttribute(MARK) !== '1') continue;
        if (!sized.has(el)) { sized.add(el); resizer?.observe(el); for (const c of Array.from(el.children)) resizer?.observe(c); measure(el); later(el); }
      }
      // Hydration has no event of its own, so the areas still waiting are looked at again shortly.
      window.clearTimeout(retry);
      if (waiting) retry = window.setTimeout(scan, 40);
    }
    let pending = 0;
    // New areas are caught in a microtask, before the browser paints them, so a bar never shows for the first frame.
    const mutations = new MutationObserver((records) => {
      scan();
      for (const r of records) {
        const host = (r.target as Element).closest?.<HTMLElement>(`[${MARK}='1']`);
        if (host) {
          // New children are watched for size too: content that is rendered or grows after the area appeared (a table that arrives with its data) changes the answer without any further mutation.
          for (const c of Array.from(host.children)) resizer?.observe(c);
          window.clearTimeout(pending); pending = window.setTimeout(() => later(host), 0);
        }
      }
    });
    scan();
    mutations.observe(document.body, { childList: true, subtree: true });
    // A page brings its own stylesheet, which can arrive after its markup: the areas it makes scroll are found as soon as it is added and again when it has loaded.
    const sheets = new MutationObserver(() => scan());
    sheets.observe(document.head, { childList: true });
    const loaded = (e: Event): void => { if (e.target instanceof HTMLLinkElement) scan(); };
    document.addEventListener('load', loaded, true);
    return () => { mutations.disconnect(); sheets.disconnect(); document.removeEventListener('load', loaded, true); resizer?.disconnect(); window.clearTimeout(pending); window.clearTimeout(retry); };
  }, []);
  return null;
}
