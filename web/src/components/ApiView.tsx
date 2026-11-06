'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { API_BASE, COSTS, apiAddress, LANGS, PRESETS, ROUTE_CARDS, firstLines, jsonTokens, parseChecked, parseMeta, pathProblem, prettyAnswer, snapshotText, snippet, type ApiMeta, type Lang } from '@/domain/apiPage';
import { usePlayOnView } from './charts/usePlayOnView';
import { NavBar } from './Nav';
import { Fragment } from 'react';
import { pickSide, useSides } from './analysis/useSides';
import { TileCarousel, type TileDef } from './TileCarousel';
import '@/styles/player.css';
import '@/styles/api.css';
import { SiteCredit } from '@/components/SiteCredit';

const int = (n: number): string => n.toLocaleString('en');

interface Answer {
  phase: 'idle' | 'sending' | 'done' | 'failed' | 'refused';
  status?: number;
  statusText?: string;
  ms?: number;
  kb?: number;
  type?: string;
  limits?: ReadonlyArray<readonly [string, string]>;
  text?: string;
  note?: string;
}

/** The body of a tile: its parts rise in one after another when the tile is on screen (once). */
function Play({ k, className, children }: { k: string; className: string; children: React.ReactNode }) {
  const { ref, played } = usePlayOnView<HTMLDivElement>(k);
  return <div ref={ref} className={`${className} aplay${played ? ' play' : ''}`}>{children}</div>;
}
const at = (i: number): React.CSSProperties => ({ ['--i' as string]: i });

/** The route cards: all of them side by side off a phone, one at a time under a chip for each on a phone. */
const CARD_CHIP: Record<string, string> = { 'Matches and scorecards': 'Matches', Players: 'Players', 'Teams and head to head': 'Teams', 'Ball by ball': 'Ball by ball', Matchups: 'Matchups', 'Competitions, venues, meta': 'Meta' };
function RoutesBody({ pick }: { pick: (p: string) => void }) {
  const { bar, side } = useSides(ROUTE_CARDS.map((c) => CARD_CHIP[c.title] ?? c.title));
  const cards = ROUTE_CARDS.map((c, i) => (
    <div className="acd arise" style={at(i)} key={c.title}>
      <h5>{c.title}</h5>
      <p>{c.text}</p>
      {c.paths.map(([label, p]) => <button type="button" className="acode" key={label} title={p} onClick={() => pick(p)}>{label}</button>)}
    </div>
  ));
  return <>{bar}<Play k={`routes|${side ?? 'all'}`} className="acards">{pickSide(cards, side)}</Play></>;
}

/** Rate limits, costs and licence: side by side off a phone, one at a time under a chip for each on a phone. */
function LimitsBody() {
  const { bar, side } = useSides(['Rate limit', 'Costs', 'Licence']);
  const blocks = [
    <Fragment key="0">
      <div className="alb arise" style={at(0)}>
        <h5>Rate limit</h5>
        <ul>
          <li>60 requests a minute for every client, with a burst of 20. There are no keys.</li>
          <li>A 429 or 503 carries Retry-After. Wait that long, or start at 1 second and double each time with a little random pause.</li>
          <li>Answers carry an ETag. Send it back as If-None-Match to get a cheap 304.</li>
          <li>Read-only, open to any website (CORS), GET only.</li>
        </ul>
      </div>
    </Fragment>,
    <Fragment key="1">
      <div className="alb arise" style={at(1)}>
        <h5>What a request costs</h5>
        <table><thead><tr><th>Route</th><th>Tokens</th></tr></thead><tbody>{COSTS.map(([route, n]) => <tr key={route}><td>{route}</td><td>{n}</td></tr>)}</tbody></table>
        <p className="anote">The exact cost of every route is in the reference.</p>
      </div>
    </Fragment>,
    <Fragment key="2">
      <div className="alb arise" style={at(2)}>
        <h5>Data and licence</h5>
        <p className="alic"><span>The ball-by-ball file, the match table and a player list, from Cricsheet, under the Open Data Commons Attribution License 1.0.</span> <span>Every answer carries a Link header to the licence, an X-Attribution header and a source block.</span> <span>Please credit Cricsheet when you use it.</span></p>
        <div className="arefresh"><h6><span className="adot ok" />Refreshes daily</h6><p>Cricsheet is checked once a day. New matches and corrections appear after they are verified.</p></div>
      </div>
    </Fragment>,
  ];
  return <>{bar}<Play k={`limits|${side ?? 'all'}`} className="alm">{pickSide(blocks, side)}</Play></>;
}

/** The status line: live or not, the data version by its friendly name, and what is loaded. */
function Status({ state, meta, checked }: { state: 'loading' | 'live' | 'down'; meta: ApiMeta | null; checked: string }) {
  if (state === 'loading') return <div className="astat"><span className="apill"><span className="adot" />Checking the API</span></div>;
  if (state === 'down' || !meta) return <div className="astat"><span className="apill"><span className="adot bad" />The API did not answer. The examples will not run until it is back.</span></div>;
  return (
    <div className="astat">
      <span className="apill on"><span className="adot ok" />Live</span>
      <span className="apill" title="The data refreshes automatically. Cricsheet is checked once a day, and new matches and corrections appear after they are verified.">Updated daily</span>
      {meta.label && <span className="apill"><b>{meta.label}</b></span>}
      <span className="apill"><b>{int(meta.matches)}</b> matches</span>
      <span className="apill"><b>{int(meta.balls)}</b> balls</span>
      <span className="apill"><b>{int(meta.players)}</b> players</span>
      {checked ? <span className="apill">Data updated on <b>{snapshotText(checked)}</b></span> : meta.snapshot && <span className="apill">Data as of <b>{snapshotText(meta.snapshot)}</b></span>}
    </div>
  );
}

/** The API page: a front door to the live API in the app's tile style. Requests go from the browser to the API, and the answer is drawn as text. */
export function ApiView() {
  const [state, setState] = useState<'loading' | 'live' | 'down'>('loading');
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [checked, setChecked] = useState('');
  const [path, setPath] = useState(PRESETS[0]![1]);
  const [lang, setLang] = useState<Lang>('curl');
  const [answer, setAnswer] = useState<Answer>({ phase: 'idle' });
  const [copied, setCopied] = useState(false);
  // A link in the top bar menu names a tile (`?tile=`). On this page the row moves to it at once and writes the address itself. The address is not watched: the row writes it while it scrolls, and
  // a watcher took those writes for requests and pulled the row back to a tile it was passing.
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const link = (e.target as Element | null)?.closest<HTMLAnchorElement>('.nav a[href^="/api"]');
      if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const tile = new URL(link.href).searchParams.get('tile') ?? 'try';
      const label = ({ try: 'Try it', routes: 'Routes', quick: 'Quick start', limits: 'Limits' } as Record<string, string>)[tile];
      if (!label) return;
      e.preventDefault();
      app.current?.querySelector<HTMLButtonElement>(`.rtr .nd[aria-label="${label}"]`)?.click();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  const busy = useRef(false);
  const app = useRef<HTMLDivElement>(null);
  // The tile row measures the window, so it is drawn once the page is in the browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // The address in the examples: this site's own origin in front of /api, set from the browser's own address once it is there so a preview shows its own.
  const [address, setAddress] = useState(() => apiAddress());
  useEffect(() => setAddress(apiAddress(API_BASE, window.location.origin)), []);
  const host = address.replace(/^https?:\/\//, '');
  useLayoutEffect(() => { document.body.classList.add('has-app'); return () => document.body.classList.remove('has-app'); }, []);
  useEffect(() => { document.title = 'API | CricAtlas'; }, []);
  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    fetch(`${API_BASE}/v1/meta`, { signal: ctl.signal })
      .then(async (r) => parseMeta(await r.json()))
      .then((m) => { setMeta(m); setState(m ? 'live' : 'down'); })
      .catch(() => setState('down'))
      .finally(() => clearTimeout(timer));
    // The date pill is the last successful source check; without it the pill keeps the snapshot date.
    fetch(`${API_BASE}/freshness`, { signal: ctl.signal })
      .then(async (r) => setChecked(parseChecked(await r.json())))
      .catch(() => undefined);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, []);

  async function send(to: string = path): Promise<void> {
    if (busy.current) return;
    const problem = pathProblem(to);
    if (problem) { setAnswer({ phase: 'refused', note: problem }); return; }
    busy.current = true;
    setAnswer({ phase: 'sending' });
    const started = performance.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(API_BASE + to.trim(), { signal: ctl.signal });
      const raw = await r.text();
      const lines = firstLines(prettyAnswer(raw));
      const limits: Array<readonly [string, string]> = [];
      for (const h of ['RateLimit-Remaining', 'RateLimit-Limit']) { const v = r.headers.get(h); if (v !== null) limits.push([h, v]); }
      setAnswer({
        phase: 'done', status: r.status, statusText: r.statusText, ms: Math.round(performance.now() - started), kb: raw.length / 1024, type: r.headers.get('content-type')?.split(';')[0] ?? undefined, limits, text: lines.shown,
        note: lines.cut ? `Showing the first 160 of ${int(lines.total)} lines. The full answer is ${Math.round(raw.length / 1024)} KB.` : r.ok ? undefined : 'An error answer is JSON with a request_id. Nothing about the server is ever shown.',
      });
    } catch {
      setAnswer({ phase: 'failed' });
    } finally {
      clearTimeout(timer);
      busy.current = false;
    }
  }

  /** An example path goes into the box, the Try it tile comes into view and the request is sent. */
  function pick(p: string): void {
    setPath(p);
    app.current?.querySelector<HTMLButtonElement>('.rtr .nd[aria-label="Try it"]')?.click();
    void send(p);
  }

  const code = snippet(lang, path, address);
  async function copy(): Promise<void> {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* the page still shows the code to copy by hand */ }
  }

  const tokens = useMemo(() => (answer.text ? jsonTokens(answer.text) : []), [answer.text]);

  const tryBody = (
    <Play k="try" className="atry">
      <div className="apre arise" style={at(0)}>
        {PRESETS.map(([label, p]) => <button key={p} type="button" className={`achip${p === path ? ' on' : ''}`} onClick={() => { setPath(p); void send(p); }}>{label}</button>)}
      </div>
      <div className="areq arise" style={at(1)}>
        <span className="am">GET</span>
        <div className="ah"><span>{host}</span><input value={path} spellCheck={false} aria-label="Request path" onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} /></div>
        <button type="button" className="ago" disabled={answer.phase === 'sending'} onClick={() => void send()}>{answer.phase === 'sending' ? 'Sending' : 'Send'}</button>
      </div>
      <div className="ameta arise" style={at(2)}>
        {answer.phase === 'sending' && <span>Sending the request</span>}
        {answer.phase === 'refused' && <><span className="ast bad">Not sent</span><span>{answer.note}</span></>}
        {answer.phase === 'failed' && <><span className="ast bad">No answer</span><span>The API did not answer. It may be down, or your network blocked the request. Try again in a moment.</span></>}
        {answer.phase === 'done' && (
          <>
            <span className={`ast ${answer.status! < 400 ? 'ok' : 'bad'}`}>{answer.status} {answer.statusText}</span>
            <span><b>{answer.ms}</b> ms</span>
            <span><b>{answer.kb!.toFixed(1)}</b> KB</span>
            {answer.type && <span>{answer.type}</span>}
            {answer.limits?.map(([h, v]) => <span key={h}>{h} <b>{v}</b></span>)}
          </>
        )}
      </div>
      <pre className="aout arise" style={at(3)} aria-live="polite">{answer.phase === 'idle' ? 'Press Send to see the answer.' : tokens.map((t, i) => (t.kind === 'p' ? t.text : <span key={i} className={`aj-${t.kind}`}>{t.text}</span>))}</pre>
      {answer.phase === 'done' && answer.note && <div className="anote">{answer.note}</div>}
    </Play>
  );

  const routesBody = <RoutesBody pick={pick} />;

  const quickBody = (
    <Play k="quick" className="aqs">
      <div className="aqh arise" style={at(0)}>
        <span className="asw" role="group" aria-label="Language">
          {LANGS.map(([k, label]) => <button key={k} type="button" className={lang === k ? 'on' : undefined} aria-pressed={lang === k} onClick={() => setLang(k)}>{label}</button>)}
        </span>
        <button type="button" className="acp" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre className="aout arise" style={at(1)}>{code}</pre>
      <div className="anote arise" style={at(2)}>The same request as the Try it tile. Change the path there and it changes here.</div>
    </Play>
  );

  const limitsBody = <LimitsBody />;

  const tiles: TileDef[] = [
    { id: 'try', label: 'Try it', group: 'Try it', title: 'Try it', tag: 'Live', wide: true, tip: 'Sends a real request from your browser to the live API.', body: tryBody },
    { id: 'routes', label: 'Routes', group: 'Learn', title: 'What you can get', tag: 'Live', wide: true, tip: 'Every route lives under /v1/.', body: routesBody },
    { id: 'quick', label: 'Quick start', group: 'Learn', title: 'Quick start', tag: 'Live', wide: true, tip: 'The request in the Try it tile, in three languages.', body: quickBody },
    { id: 'limits', label: 'Limits', group: 'Rules', title: 'Limits and good manners', tag: 'Live', wide: true, tip: 'There are no keys, so the limits protect the service for everyone.', body: limitsBody },
  ];

  return (
    <div className="pgx apx">
      <div className="app" ref={app} data-up="2">
        <NavBar />
        <section className="ahd">
          <div className="ahdin">
            <h1>API</h1>
            <p>Free, read-only JSON. No key, no sign-up.</p>
          </div>
          <div className="ahdr">
            <Status state={state} meta={meta} checked={checked} />
            <a className="abtn" href={`${API_BASE}/docs`} target="_blank" rel="noopener noreferrer">Open the reference</a>
          </div>
        </section>
        <section className="pane on" id="p-api">
          {mounted && <TileCarousel name="API" note="Click a stop to jump to it." tiles={tiles} resetKey="api" />}
        </section>
        <footer className="foot"><SiteCredit /></footer>
      </div>
    </div>
  );
}
