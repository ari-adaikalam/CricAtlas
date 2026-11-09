/**
 * Keeps the top bar still while a link opens another page (Ari, 2026-11-08: the whole bar, the ball and all, seemed to reload or blink on a click).
 * Each page draws its own copy of the bar, and the layout has one more, so opening a page swaps one copy for another, twice, in a few frames. The copies look the same, but a browser may draw the new
 * one a frame late and the bar flickers. From the click until the new page is drawn, a copy of the bar as it is at the click lies over the page and takes no clicks; whatever changes under it cannot be seen.
 * It is dropped a moment after the new page is drawn, when the new bar has been painted below it. Wide windows only: on a phone the bar is a strip with a panel and is left alone.
 */
const ID = 'bar-hold';

/** Puts a copy of the visible bar over the page, and returns the function that takes it away. */
export function holdBar(): () => void {
  if (typeof document === 'undefined' || window.matchMedia('(max-width: 900px)').matches) return () => undefined;
  document.getElementById(ID)?.remove();
  const bar = [...document.querySelectorAll<HTMLElement>('.nav')].find((n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; });
  if (!bar) return () => undefined;
  const clone = bar.cloneNode(true) as HTMLElement;
  // The item that has the pointer or the focus keeps its highlight (class `held`, as NavMenuItem uses it).
  const live = [...bar.querySelectorAll('.nmi')], copies = [...clone.querySelectorAll('.nmi')];
  live.forEach((n, i) => { if (n.matches(':hover, :focus-within')) copies[i]?.classList.add('held'); });
  // The ball's gradient and clip path are found by id. Dropping those ids leaves the copy's ball with no fill, only its seam, so they are renamed with their references instead.
  const renamed = new Map<string, string>();
  clone.querySelectorAll('svg [id]').forEach((e) => { const old = e.id; renamed.set(old, `${old}h`); e.id = `${old}h`; });
  if (renamed.size) {
    clone.querySelectorAll('svg *').forEach((e) => {
      for (const a of ['fill', 'stroke', 'clip-path', 'mask', 'filter', 'href', 'xlink:href']) {
        const v = e.getAttribute(a);
        if (v && v.includes('#')) e.setAttribute(a, v.replace(/#([^)\s"']+)/g, (m, id: string) => (renamed.has(id) ? `#${renamed.get(id)}` : m)));
      }
    });
  }
  clone.querySelectorAll('[id]:not(svg [id])').forEach((e) => e.removeAttribute('id'));
  clone.querySelectorAll('a, button, input').forEach((e) => { e.setAttribute('tabindex', '-1'); });
  Object.assign(clone.style, { position: 'absolute', left: '0', right: '0', top: '0', transition: 'none' });
  // The same chain of containers as the bar has (`.pgx` > `.app` > `.nav`, or `.site-nav` > `.nav`), so the page's own rules for the bar apply, but with no frame, background or size of their own.
  const chain: HTMLElement[] = [];
  for (let e: HTMLElement | null = bar.parentElement; e && e !== document.body; e = e.parentElement) chain.unshift(e);
  let inner: HTMLElement = clone;
  for (let i = chain.length - 1; i >= 0; i--) {
    const c = document.createElement('div'); c.className = chain[i]!.className;
    Object.assign(c.style, { position: 'static', height: '0', width: 'auto', minHeight: '0', overflow: 'visible', background: 'none', border: '0', padding: '0', margin: '0', transform: 'none', animation: 'none', opacity: '1', display: 'block' });
    c.appendChild(inner); inner = c;
  }
  const holder = document.createElement('div');
  holder.id = ID; holder.setAttribute('aria-hidden', 'true');
  Object.assign(holder.style, { position: 'fixed', left: '0', right: '0', top: '0', height: '0', zIndex: '2000', pointerEvents: 'none', overflow: 'visible' });
  // An opaque backdrop the size of the bar, painted like the page (the background is the same on every page and fixed to the window), so the bars changing underneath are never seen through the text
  // of the copy: drawn twice, the text looks a little heavier, and that is seen when the copy is dropped.
  const backdrop = document.createElement('div');
  const body = getComputedStyle(document.body);
  Object.assign(backdrop.style, { position: 'absolute', left: '0', right: '0', top: '0', height: `${Math.round(bar.getBoundingClientRect().height)}px`, backgroundImage: body.backgroundImage, backgroundColor: body.backgroundColor, backgroundAttachment: 'fixed', backgroundSize: body.backgroundSize, backgroundRepeat: 'no-repeat' });
  holder.appendChild(backdrop);
  holder.appendChild(inner);
  document.body.appendChild(holder);
  // An open menu in the copy fades out with the old page, as the live one does (`data-leaving` in globals.css), or when the copy is released if the page had no fade, and stays out: the live rule stops applying when the new page is drawn, which would fade the copy's menu back in until the copy is dropped.
  const root = document.documentElement;
  const follow = new MutationObserver(() => { if (root.hasAttribute('data-leaving')) holder.classList.add('gone'); });
  follow.observe(root, { attributes: true, attributeFilter: ['data-leaving'] });
  // A page of the same kind opens with no fade (one player for another, one team or match for another) and the address changes at once, while the copy stays for the rest of the opening: its menu goes when the address does, as the live one does.
  const from = location.pathname + location.search;
  let frame = requestAnimationFrame(function watch() { if (location.pathname + location.search !== from) holder.classList.add('gone'); else frame = requestAnimationFrame(watch); });
  return () => { cancelAnimationFrame(frame); holder.classList.add('gone'); window.setTimeout(() => { follow.disconnect(); holder.remove(); }, 160); };
}
