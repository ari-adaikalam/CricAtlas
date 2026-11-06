'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { listenAddress } from './addressEvents';
import { fetchMatch } from '@/data/matchData';
import { bannerLines, bowledText, dlsTip, followOn, inningsBatters, inningsBowlers, inningsLabel, mainInnings, potm, resultText, scoreText, sides, stripContext, stripLink, stripScores, subMarkOf, subMarks, superOverLines, tossOf, type InningsCard, type MatchBundle } from '@/domain/match';
import { pairPaint } from '@/domain/emblem';
import type { MatchHit } from '@/domain/matchSearch';
import { matchIdFromSlug, matchSlug } from '@/domain/slug';
import { MatchSearchBox } from './MatchSearchBox';
import { SubArrow, TossCoin } from './MatchMarks';
import { MorphText } from './MorphText';
import { NavBar, StripBrand } from './Nav';
import { DetailsView } from './DetailsView';
import { AnalysisView } from './analysis/AnalysisView';
import { ReplayView } from './replay/ReplayView';
import { EntityLink } from './EntityLink';
import { TeamIds } from './TeamLinks';
import { TeamEmblem } from './TeamEmblem';
import { usePhone } from './usePhone';
import { ErrorState, NotFoundState, PageLoader } from './states/PageStates';
import { TILE_PARAM } from './TileCarousel';
import { activePane, clearRemembered, leaveAsLayer, playKept } from './viewMorph';
import '@/styles/player.css';
import '@/styles/match.css';
import { SiteCredit } from '@/components/SiteCredit';

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; bundle: MatchBundle };
type Mode = 'sum' | 'ana' | 'rep' | 'det';
const VIEW_PARAM: Record<Mode, string | null> = { sum: null, ana: 'analysis', rep: 'replay', det: 'details' };
const FROM_PARAM: Record<string, Mode> = { analysis: 'ana', replay: 'rep', details: 'det' };

const VIEW_NAME: Record<Exclude<Mode, 'sum'>, string> = { ana: 'Analysis', rep: 'Replay', det: 'Details' };
type ViewMode = Exclude<Mode, 'sum'>;
/** The order of the strip's views, for the direction a row slides when going from one to another. */
// The order of the summary's buttons: Watch the replay, Match details, Match analysis. The strip's switch and the direction of the slides follow it.
const VIEW_ORDER: Record<Mode, number> = { sum: 0, rep: 1, det: 2, ana: 3 };

/** One innings on the summary, as a broadcast summary shows it: a bar in the batting side's colour with the team, the overs and the score, then the best batters and the bowlers who bowled in it. */
function InningsBlock({ bundle, inn, rows, fill, ink, fresh }: { bundle: MatchBundle; inn: InningsCard; rows: number; fill: string; ink: string; fresh: boolean }) {
  // Whether this block arrived after the page was shown is decided once, when it is mounted. Read on every render it would start the entrance on blocks that were already there (found 2026-10-20: every block replayed it 1.2 s after the page opened).
  const [enters] = useState(fresh);
  const bat = inningsBatters(inn, rows), bowl = inningsBowlers(inn, rows);
  const marks = subMarks(bundle), toss = tossOf(bundle);
  const arrow = (id: string | null, name: string) => { const m = subMarkOf(marks, id, name); return m ? <SubArrow mark={m} /> : null; };
  return (
    <div className={`blk${enters ? ' blk-in' : ''}`} style={{ ['--tb' as string]: fill, ['--ti' as string]: ink }}>
      <div className="bh">
        <h2><EntityLink entity={{ kind: 'team', id: inn.teamId, name: inn.team }}><MorphText text={inn.team} /></EntityLink>{toss?.team === inn.team && mainInnings(bundle).indexOf(inn) < 2 && <TossCoin decision={toss.decision} />}</h2>
        <span className="ovw" title={dlsTip(bundle, inn) ?? (followOn(bundle) === inn.team && mainInnings(bundle).indexOf(inn) === 2 ? `${inn.team} followed on` : undefined)}><MorphText className="ov" text={inningsLabel(bundle, inn)} /></span>
        <MorphText className="sc" text={scoreText(inn)} />
      </div>
      <div className="bb">
        <div className="cols">
          <div>
            <h5>Batting</h5>
            {bat.map((r, i) => <div className="r" key={i}><span className="nm"><EntityLink entity={{ kind: 'player', id: r.id, name: r.name }}><MorphText text={r.name} /></EntityLink>{arrow(r.id, r.name)}</span><b><MorphText text={`${r.runs}${r.notOut ? '*' : ''}`} /><i><MorphText text={String(r.balls)} /></i></b></div>)}
          </div>
          <div>
            <h5>Bowling</h5>
            {bowl.map((r, i) => <div className="r" key={i}><span className="nm"><EntityLink entity={{ kind: 'player', id: r.id, name: r.name }}><MorphText text={r.name} /></EntityLink>{arrow(r.id, r.name)}</span><b><MorphText text={`${r.wkts}-${r.runs}`} /><i><MorphText text={bowledText(bundle, r.balls)} /></i></b></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MatchView({ matchId: firstId }: { matchId: number }) {
  const [matchId, setMatchId] = useState(firstId);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [mode, setMode] = useState<Mode>('sum');
  const [attempt, setAttempt] = useState(0);
  const [changing, setChanging] = useState(false);
  const phone = usePhone();
  // The strip over the analysis views grows with a long team name or result, so the views below start where it ends.
  useEffect(() => {
    if (!phone || load.status !== 'ready') return;
    const top = document.querySelector<HTMLElement>('.mgx .app > .top');
    const root = top?.closest<HTMLElement>('.mgx');
    if (!top || !root) return;
    const set = () => root.style.setProperty('--strip-h', `${Math.ceil(top.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(top);
    return () => { ro.disconnect(); root.style.removeProperty('--strip-h'); };
  }, [phone, load.status]);
  const [changingTop, setChangingTop] = useState(false);
  const first = useRef(true);
  // The views opened since the summary stay in the page, hidden, and come back as they were left. The summary, or another match, ends it.
  const [kept, setKept] = useState<readonly ViewMode[]>([]);
  const frozen = useRef<Partial<Record<ViewMode, ReactNode>>>({});
  const enterKept = useRef<1 | -1 | null>(null);
  // Set when the match is changed from inside a view: the old view stays as a layer until the new match's view is ready.
  const switching = useRef(false);
  // Blocks that appear after the page has been shown (changing to a match with more innings) fade in, the first ones do not.
  const [settled, setSettled] = useState(false);
  useEffect(() => { if (load.status !== 'ready') return; const t = window.setTimeout(() => setSettled(true), 1200); return () => window.clearTimeout(t); }, [load.status]);

  useEffect(() => {
    let cancelled = false;
    fetchMatch(matchId)
      .then((bundle) => {
        if (cancelled) return;
        if (!bundle) { setLoad({ status: 'missing' }); return; }
        // Changing the match inside a view: the old view is copied as a layer that dissolves into the new one.
        if (switching.current && !first.current) { switching.current = false; if (mode !== 'sum') leaveAsLayer(activePane(), undefined, false, true); }
        setLoad({ status: 'ready', bundle });
        // The first load opens on the view the address names. A match changed from inside the page keeps the view it is in.
        if (first.current) {
          first.current = false;
          const start = FROM_PARAM[new URLSearchParams(window.location.search).get('view') ?? ''] ?? 'sum';
          setMode(start);
          setKept(start === 'sum' ? [] : [start]);
        }
      })
      .catch((error: unknown) => {
        console.error('Match data failed to load', matchId, error);
        if (!cancelled) setLoad({ status: 'error' });
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  }, [matchId, attempt]);

  // The browser's Back and Forward return to the match in the address, in place.
  useEffect(() => {
    const onPop = () => {
      const id = matchIdFromSlug(window.location.pathname.split('/').filter(Boolean).pop() ?? '');
      if (id && id !== matchId) setMatchId(id);
      setMode(FROM_PARAM[new URLSearchParams(window.location.search).get('view') ?? ''] ?? 'sum');
    };
    return listenAddress(onPop);
  }, [matchId]);

  // Coming back to a kept view: its row slides in as a fresh one does, and the address names the tile it is on.
  useLayoutEffect(() => {
    const dir = enterKept.current;
    enterKept.current = null;
    if (dir === null || mode === 'sum') return;
    const pane = activePane();
    playKept(pane, dir);
    const car = pane?.querySelector<HTMLElement>('.car');
    const tile = car?.getAttribute('data-first');
    const url = new URL(window.location.href);
    if (tile && car && car.scrollLeft > 8) url.searchParams.set(TILE_PARAM, tile); else url.searchParams.delete(TILE_PARAM);
    window.history.replaceState(null, '', url);
  }, [mode]);

  // The page draws its own bar inside its frame, so the site bar and footer step aside.
  useEffect(() => {
    if (load.status !== 'ready') return;
    document.body.classList.add('has-app');
    return () => document.body.classList.remove('has-app');
  }, [load.status]);

  useEffect(() => {
    if (load.status !== 'ready') return;
    const [a, b] = sides(load.bundle);
    document.title = `${a} v ${b}, ${load.bundle.match.date} | CricAtlas`;
  }, [load]);

  function show(next: Mode) {
    if (next === mode) return;
    // The view being left becomes a layer that fades out as the next one starts (viewMorph.ts).
    const dir = mode !== 'sum' && next !== 'sum' ? (VIEW_ORDER[next] > VIEW_ORDER[mode] ? 1 : -1) : undefined;
    leaveAsLayer(activePane(), dir, next === 'sum');
    if (dir !== undefined && next !== 'sum' && kept.includes(next)) enterKept.current = dir;
    if (next === 'sum') { setKept([]); clearRemembered(); } else setKept((was) => (mode === 'sum' ? [next] : was.includes(next) ? was : [...was, next]));
    setMode(next);
    const params = new URLSearchParams(window.location.search);
    const view = VIEW_PARAM[next];
    if (view) params.set('view', view); else params.delete('view');
    params.delete('tile');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }

  // Change match: the address changes without a navigation and the page stays. The old match stays on screen until the new one's file has arrived, then the words change in place.
  function switchMatch(hit: MatchHit) {
    if (hit.id === matchId) return;
    const view = VIEW_PARAM[mode];
    // The new match opens on the tile the view is on, as a new player does.
    const params = new URLSearchParams();
    if (view) params.set('view', view);
    const tile = new URLSearchParams(window.location.search).get(TILE_PARAM);
    if (tile && mode !== 'sum') params.set(TILE_PARAM, tile);
    const query = params.toString();
    window.history.pushState(null, '', `/matches/${matchSlug(hit.teams[0], hit.teams[1], hit.date, hit.id)}${query ? `?${query}` : ''}`);
    switching.current = true;
    setKept((was) => was.filter((m) => m === mode));
    clearRemembered();
    setMatchId(hit.id);
    setChangingTop(false);
  }

  if (load.status === 'loading') return <PageLoader />;
  if (load.status === 'missing') return <NotFoundState what="match" />;
  if (load.status === 'error') return <ErrorState onRetry={() => { setLoad({ status: 'loading' }); setAttempt((n) => n + 1); }} />;

  const { bundle } = load;
  const [teamA, teamB] = sides(bundle);
  const result = resultText(bundle);
  const star = potm(bundle);
  const scores = stripScores(bundle);
  const innings = mainInnings(bundle);
  const test = bundle.match.kind === 'test';
  // Four players per side in every format. Measured on a Super Over match (Namibia v Uganda), the buttons end 41 px above the footer line even in a 600 px window, so no format needs fewer rows.
  const rows = 4;
  // Each side keeps one colour through the page (the first side to bat is the first of the pair).
  const paint = pairPaint(teamA, teamB);
  const paintOf = (team: string) => (team === teamA ? paint[0] : paint[1]);
  const superLines = superOverLines(bundle);
  const toss = tossOf(bundle);
  const idOf = (team: string): string | null => bundle.match.teams.find((t) => t.name === team)?.id ?? null;
  const viewOf = (m: ViewMode): ReactNode => (m === 'det'
    ? <DetailsView key={bundle.match.id} bundle={bundle} instant={false} />
    : m === 'ana'
    ? <AnalysisView key={bundle.match.id} bundle={bundle} fills={[paint[0].fill, paint[1].fill]} instant={false} />
    : <ReplayView key={bundle.match.id} bundle={bundle} fills={[paint[0].fill, paint[1].fill]} />);

  return (
    <TeamIds value={new Map(bundle.match.teams.map((t) => [t.name, t.id]))}>
    <div className="pgx mgx">
      <div className={`app ${mode === 'sum' ? 'state-sum' : `state-ana view-${mode}`}`} data-up="2">
        <NavBar />
        <section className="sum">
          <img className="wm" src="/brand/icons/icon-C-leather-on-dark.svg" alt="" />
          <div className="sumin">
            <div className="mbanner">
              <TeamEmblem team={teamA} size={56} />
              <div className="mbt">
                <h1>Match summary</h1>
                <MorphText className="mbs" text={bannerLines(bundle)[0]} />
                <MorphText className="mbs" text={bannerLines(bundle)[1]} />
              </div>
              <div className="chg">
                {changing
                  ? <MatchSearchBox autoFocus onDone={() => setChanging(false)} onPick={switchMatch} />
                  : <button type="button" className="mini" onClick={() => setChanging(true)}>Change match</button>}
              </div>
              <TeamEmblem team={teamB} size={56} />
              {phone && <button type="button" className="mmore" onClick={() => setChanging(true)} aria-label="Change match" title="Change match"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4" /></svg></button>}
            </div>
            {innings.length === 0
              ? <div className="mso">No balls were bowled.</div>
              : <div className={`minns${test ? ' tests' : ''}`}>{innings.map((inn) => <InningsBlock key={inn.n} bundle={bundle} inn={inn} rows={rows} fill={paintOf(inn.team).fill} ink={paintOf(inn.team).ink} fresh={settled} />)}</div>}
            {innings.length > 0 && [teamA, teamB].filter((t) => !innings.some((i) => i.team === t)).map((t) => <div key={t} className="mso"><span>{t}{toss?.team === t && <TossCoin decision={toss.decision} />} did not bat.</span></div>)}
            {superLines.length > 0 && <div className="mso"><b>Super Over</b>{superLines.map((l, i) => <span key={i}>{superLines.length > 1 ? `Round ${i + 1}: ` : ''}{l}</span>)}</div>}
            <div className="mact">
              <div className="btns">
                <button type="button" className="btn w" onClick={() => show('rep')}>&#9654; Watch the replay</button>
                <button type="button" className="btn s" onClick={() => show('det')}>Match details</button>
                <button type="button" className="btn p" onClick={() => show('ana')}>Match analysis</button>
              </div>
              <div className="resbar">
                <MorphText className="rs1" text={result} />
                {star && <span className="potm" title={`Player of the match: ${star.names}${star.figures ? `, ${star.figures}` : ''}`}>Player of the match: <b className="nm"><EntityLink entity={{ kind: 'player', id: bundle.match.potm[0]?.id ?? null, name: bundle.match.potm[0]?.name ?? star.names }}><MorphText text={star.names} /></EntityLink>{(() => { const m = subMarkOf(subMarks(bundle), bundle.match.potm[0]?.id ?? null, bundle.match.potm[0]?.name ?? ''); return m ? <SubArrow mark={m} /> : null; })()}</b>{star.figures ? <>, <MorphText text={star.figures} /></> : null}</span>}
              </div>
            </div>
          </div>
          <p className="credit"><SiteCredit /></p>
        </section>
        <p className="vcredit"><SiteCredit /></p>
        <div className="top">
          <StripBrand />
          <div className="one">
            <span className="tem"><TeamEmblem team={scores[0]!.team} size={22} /></span><b><EntityLink entity={{ kind: 'team', id: idOf(scores[0]!.team), name: scores[0]!.team }}>{scores[0]!.team}</EntityLink></b>{toss?.team === scores[0]!.team && <TossCoin decision={toss.decision} />} <MorphText className="mtx" text={scores[0]!.score || '–'} /> <span>v</span> <span className="tem"><TeamEmblem team={scores[1]!.team} size={22} /></span><b><EntityLink entity={{ kind: 'team', id: idOf(scores[1]!.team), name: scores[1]!.team }}>{scores[1]!.team}</EntityLink></b>{toss?.team === scores[1]!.team && <TossCoin decision={toss.decision} />} <MorphText className="mtx" text={scores[1]!.score || '–'} /> <span>|</span> <em><MorphText className="mtx" text={result} /></em>
          </div>
          <div className={`chg tchg${changingTop ? ' open' : ''}`}>
            <button type="button" className="mini" onClick={() => setChangingTop(true)} aria-label="Change match" title="Change match">{phone ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4" /></svg> : 'Change match'}</button>
            {changingTop && <MatchSearchBox autoFocus onDone={() => setChangingTop(false)} onPick={switchMatch} />}
          </div>
          <span className="sw" id="vsw">
            {(['rep', 'det', 'ana'] as const).map((m) => <button key={m} type="button" className={mode === m ? 'on' : undefined} onClick={() => show(m)}>{VIEW_NAME[m]}</button>)}
          </span>
          <button type="button" className="mini" onClick={() => show('sum')} aria-label="Back to the summary">Summary</button>
          <div className="ctx">
            {(() => {
              // The competition's name leads to its page when it has one, and the rest of the line morphs beside it as before.
              const link = stripLink(bundle);
              // On a phone the line is two: the competition and format, then the place and date. Each is kept whole and wraps only inside itself.
              if (phone) {
                const parts = (link ? `${link.name}${link.rest}` : stripContext(bundle)).split(/\s*\|\s*/).filter(Boolean);
                const head = parts.slice(0, -1), tail = parts.length > 1 ? parts[parts.length - 1] : null;
                return <>
                  <span className="ctxl">{(head.length > 0 ? head : parts).map((t, i) => (
                    <span key={i} className="ctxp">{i > 0 && <i aria-hidden="true">| </i>}{i === 0 && link ? <EntityLink entity={{ kind: 'tournament', id: link.key, name: link.name }}>{t}</EntityLink> : t}</span>
                  ))}</span>
                  {tail && (() => { const cut = tail.lastIndexOf(', '); return cut > 0 ? <span className="ctxl ctxv"><span className="ctxn">{tail.slice(0, cut)}</span><span className="ctxd">, {tail.slice(cut + 2)}</span></span> : <span className="ctxl">{tail}</span>; })()}
                </>;
              }
              return link
                ? <><EntityLink entity={{ kind: 'tournament', id: link.key, name: link.name }}><MorphText className="ctxt" text={link.name} /></EntityLink><MorphText className="ctxt" text={link.rest} /></>
                : <MorphText className="ctxt" text={stripContext(bundle)} />;
            })()}
          </div>
        </div>
        {(['ana', 'rep', 'det'] as const).map((m) => {
          if (!kept.includes(m)) return null;
          // The view on screen is rendered from the current state. A kept view that is not shown keeps the element it last rendered.
          if (mode === m) frozen.current[m] = viewOf(m);
          return <section key={m} className={`pane${mode === m ? '' : ' held'}`} id={`p-${m}`}>{frozen.current[m] ?? viewOf(m)}</section>;
        })}
      </div>
    </div>
    </TeamIds>
  );
}
