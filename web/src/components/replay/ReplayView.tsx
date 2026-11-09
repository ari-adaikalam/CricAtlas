'use client';

import { TeamSwatch } from '../TeamSwatch';
import { TeamLabel } from '../TeamLinks';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChartColoursFor } from '../ChartColours';
import { PlayerName } from '../PlayerName';
import { TileLoader } from '../states/TileStates';
import { useMatchBalls } from '../useMatchBalls';
import { usePhone } from '../usePhone';
import { useShrinkToFit } from '../useShrinkToFit';
import { peekMove, peekStill } from '../viewMorph';
import { LivePitch } from './LivePitch';
import { LiveWagon } from './LiveWagon';
import { Playbar } from './Playbar';
import { cellsFrom } from '@/domain/pitch';
import { buildTimeline, marksOf, snapshot, type Snapshot } from '@/domain/replay';
import { sides, subMarks, tossOf, type MatchBundle } from '@/domain/match';
import { enoughTracking, hasPosition, pitchRowsOf, shotsOf, trackedBalls } from '@/domain/tracking';

// The Match Replay: the match played ball by ball from the first ball of the first innings, with play, pause, a scrubber and a speed that are there from the start. Everything on the
// screen is a function of one number, how many balls of the match have been bowled, so the scrubber, the play and a jump all show the same thing. Only structured fields are used, never commentary text.

// The 3D chunks start downloading as soon as this view's code arrives, alongside the match data. Left to the two scenes' own effects they wait for the data and the first render, about 0.7 s later.
if (typeof window !== 'undefined') { void import('../wagon/scene').catch(() => undefined); void import('../wagon/pitchScene').catch(() => undefined); }

const MS_PER_BALL = 700;
const SPEEDS = [1, 2, 4, 8] as const;
const TEST_SPEEDS = [1, 4, 16, 64] as const;

const rate = (n: number | null): string => (n === null ? '-' : n.toFixed(1));

function LeftPanel({ b, snap, marks }: { b: MatchBundle; snap: Snapshot; marks: ReturnType<typeof subMarks> }) {
  const hundred = b.match.kind === 'hundred', test = b.match.kind === 'test';
  const toss = snap.k === 0 ? tossOf(b) : null;
  const stat = (label: string, value: string): ReactNode => <div className="rst"><span>{label}</span><b>{value}</b></div>;
  const fitRef = useShrinkToFit<HTMLDivElement>();
  return (
    <div className="pan" ref={fitRef}>
      <h3 className="rhd"><TeamSwatch team={snap.team} size={22} /><TeamLabel team={snap.team} text={snap.heading} /></h3>
      {/* The toss line keeps its room after the first ball (hidden), so the panel's content is the same height all innings and nothing rescales when it goes. */}
      {toss && <p className="rtoss" style={snap.c === 0 ? undefined : { visibility: 'hidden' }} aria-hidden={snap.c === 0 ? undefined : true}>{toss.team} won the toss and chose to {toss.decision === 'field' ? 'field' : 'bat'}.</p>}
      <div className="rhead"><div className="big">{snap.score}/{snap.wickets}</div><div className="g">{snap.c === 0 ? 'Before the first ball' : snap.progress}</div></div>
      <div className="rstats">
        {stat(`Run rate${hundred ? ' (5 balls)' : ''}`, rate(snap.runRate))}
        {snap.requiredRate !== null ? stat('Required rate', rate(snap.requiredRate)) : snap.target !== null && test ? stat('Target', String(snap.target)) : stat('Partnership', snap.partnership ? `${snap.partnership.runs} off ${snap.partnership.balls}` : '-')}
        {snap.need !== null ? stat('Need', snap.ballsLeft !== null ? `${snap.need} off ${snap.ballsLeft}` : `${snap.need} more`) : null}
        {snap.need !== null && snap.partnership ? stat('Partnership', `${snap.partnership.runs} off ${snap.partnership.balls}`) : null}
        {snap.target !== null && test ? stat('Wickets in hand', String(snap.inHand)) : null}
      </div>
      {snap.batters.map((x) => <div className="kv" key={x.id ?? x.name}><span><PlayerName id={x.id} name={x.name} marks={marks} />{x.hand && <i className="hd">{x.hand}</i>}</span><b>{x.runs}{x.striker ? '*' : ''} ({x.balls})</b></div>)}
      {snap.bowler && <div className="kv"><span><PlayerName id={snap.bowler.id} name={snap.bowler.name} marks={marks} /><i className="hd">bowling</i></span><b>{snap.bowler.line}</b></div>}
      <div className="tover" aria-label={hundred ? 'This set of 5 balls' : 'This over'}>
        <div className="tohead"><span className="g">{hundred ? 'This set' : 'This over'}</span>{snap.over.toCome > 0 && <span className="g">{snap.over.toCome} to come</span>}</div>
        <div className="tochips">{snap.over.chips.map((c, i) => <span key={i} className={`rc c${c.kind}`}>{c.text}</span>)}</div>
      </div>
    </div>
  );
}

/**
 * The last six balls as a live feed (Ari, 2026-10-22): the newest ball at the top, sliding in with its line revealed as if typed while the match plays, the earlier balls pushed down. Each line is made from
 * the structured fields only (who bowled to whom, the shot, line and length, control, event tags), never commentary text.
 */
function Ticker({ snap, tracked, playing, prompt, marks, count = 6 }: { snap: Snapshot; tracked: boolean; playing: boolean; prompt?: ReactNode; marks: ReturnType<typeof subMarks>; count?: number }) {
  const rows = [...snap.last].reverse().slice(0, count);
  const word = count === 2 ? 'two' : 'six';
  return (
    <div className="pan rtick">
      <h3>Last {count} balls</h3>
      {snap.c === 0 && <p className={`rhint${prompt ? ' under' : ''}`}>The last {word} balls appear here as the match is played.</p>}
      {prompt}
      {/* When none of the six balls has a line and length, that column is collapsed so the others use its room. */}
      {(() => {
        const anyLine = rows.some((r) => tracked && r.tracked && (r.line || (r.chip.kind === 'wicket' && r.shot)));
        return (
          <div className={`rfeed${playing ? ' live' : ''}${anyLine ? '' : ' noline'}`} role="list">
            {Array.from({ length: count }, (_, k) => {
              const row = rows[k];
              if (!row) return <div className="rfl empty" key={`e${k}`} />;
              const known = tracked && row.tracked;
              const wicket = row.chip.kind === 'wicket';
              // The columns are the same in every row, and what a row has no value for is given to the text beside it. A wicket shows how the batter was out and also the shot, which is in the line column with the line and
              // length (or after the dismissal when that column is collapsed). A ball with no line and length lets its shot use that column's room. An untracked ball uses the room of all three columns.
              const how = wicket ? row.wicketText || 'Out' : known ? row.shot || 'No shot recorded' : 'No tracking for this ball';
              const shotWithWicket = wicket && known ? row.shot : '';
              const what = !anyLine && shotWithWicket ? `${how} \u00B7 ${shotWithWicket}` : how;
              const secondary = known ? (wicket ? [shotWithWicket, row.line].filter(Boolean).join(' \u00B7 ') : row.line) : '';
              const span = !known ? 3 : anyLine && secondary === '' ? 2 : 1;
              // An event tag (a review, a dropped catch) has no column of its own: it sits at the end of the line column, or of the shot text when that has the room, and only that row's text is shortened to make room.
              const tags = row.tags.length > 0 ? <span className="rftags">{row.tags.map((tag) => <em key={tag} className="evtag" title={tag}>{tag}</em>)}</span> : null;
              const inLine = known && anyLine && span === 1;
              return (
                <div className="rfl" key={`b${row.index}`} role="listitem">
                  <span className="g rfn">{row.label}</span>
                  <span className={`rc c${row.chip.kind}`}>{row.chip.text}</span>
                  <span className="g rnames">{row.bowler && row.batter ? <><PlayerName id={row.bowler.id} name={row.bowler.name} marks={marks} /> to <PlayerName id={row.batter.id} name={row.batter.name} marks={marks} /></> : ''}</span>
                  <b className="rfw rfx" title={what} style={{ gridColumn: span > 1 ? `span ${span}` : undefined }}><span className="rft">{what}</span>{!inLine && tags}</b>
                  {known && span === 1 && <span className="g rfline rfx" title={secondary}><span className="rft">{secondary}</span>{inLine && tags}</span>}
                  {known && span <= 2 && <span className="g rfctl">{row.control ?? ''}</span>}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

export function ReplayView({ bundle, fills }: { bundle: MatchBundle; fills: readonly [string, string] }) {
  const load = useMatchBalls(bundle, true);
  const phone = usePhone();
  // The page of the phone's swipe row in view (0 the wagon wheel with the last balls, 1 the pitch map).
  const [page, setPage] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  // Moving between views the whole Replay slides as a carousel row does, and changing the match inside the view only changes what is in it.
  const [move] = useState(() => peekMove());
  const [still] = useState(() => peekStill());
  // The view is marked open from its first render and fades in through a CSS animation with a short delay (globals.css): the 3D scenes start underneath, and a reveal timed in script was held back by them
  // until the summary's fade-out had half gone, so the two showed through each other.
  const enter = { 'data-enter': still ? 'instant' : 'play', 'data-move': move ? 'slide' : undefined, 'data-dir': move ? String(move.dir) : undefined } as const;
  const [first] = sides(bundle);
  const colourOf = (team: string): string => (team === first ? fills[0] : fills[1]);
  const marksMap = useMemo(() => subMarks(bundle), [bundle]);
  const test = bundle.match.kind === 'test';

  const t = useMemo(() => (load.status === 'ready' ? buildTimeline(bundle, bundle.innings, load.files) : null), [load, bundle]);
  const marks = useMemo(() => (t ? marksOf(t) : []), [t]);
  // Each innings' tracked balls once: the shots for the wagon wheel and where in them each ball falls.
  const tracking = useMemo(() => (t ? t.innings.map((ri) => {
    const balls = trackedBalls(ri.inn, ri.file);
    const prefix = [0];
    for (const x of balls) prefix.push(prefix[prefix.length - 1]! + (hasPosition(x) ? 1 : 0));
    return { balls, shots: shotsOf(balls), prefix, pitched: balls.some((x) => x.length !== null && x.line !== null) };
  }) : []), [t]);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const speeds = test ? TEST_SPEEDS : SPEEDS;
  const total = t?.total ?? 0;
  const msPerBall = MS_PER_BALL / speed;
  useEffect(() => {
    if (!playing) return;
    // A Replay kept in the page while another view is shown does not go on playing behind it.
    if (root.current?.closest('.held')) { setPlaying(false); return; }
    if (pos >= total) { setPlaying(false); return; }
    const id = window.setTimeout(() => setPos((p) => Math.min(total, p + 1)), msPerBall);
    return () => window.clearTimeout(id);
  }, [playing, pos, msPerBall, total]);
  useEffect(() => { setPos(0); setPlaying(false); }, [bundle.match.id]);

  if (load.status === 'loading') return <div className="rwrap"><div className="rview" ref={root} {...enter}><TileLoader label="Replay" /></div></div>;
  if (load.status === 'error' || !t || t.innings.length === 0) return <div className="pending"><h3>Replay</h3><p>{load.status === 'error' ? 'The ball by ball file of this match could not be read.' : 'No balls were bowled in this match.'}</p></div>;

  const snap = snapshot(bundle, t, pos)!;
  const ri = t.innings[snap.k]!, tk = tracking[snap.k]!;
  const positioned = enoughTracking(bundle, 'positioned'), tracked = enoughTracking(bundle, 'tracked');
  const colour = colourOf(ri.inn.team);
  const travel = Math.min(900, msPerBall * 0.9);

  // Before the first ball there is a play button over the first panel, so the opening screen has a clear thing to do.
  const prompt = snap.c === 0 && !playing ? (
    <button type="button" className="rpstart" onClick={() => { setPos(0); setPlaying(true); }} aria-label="Play the match from the first ball">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
      <span>Play the match ball by ball</span>
    </button>
  ) : null;
  const cells = tracked ? cellsFrom(pitchRowsOf(tk.balls.slice(0, snap.c)).rows) : [];
  const wagon = positioned ? (
    <div className="pan"><h3>Wagon wheel</h3><div className="rfill"><ChartColoursFor colour={colour}><LiveWagon shots={tk.shots} count={tk.prefix[snap.c]!} travelMs={travel} label={`Wagon wheel of ${ri.inn.team}, ${tk.prefix[snap.c]} shots so far`} /></ChartColoursFor>{prompt}</div></div>
  ) : null;
  // The pitch panel is there when some innings of the match has a line and length, or when the wagon wheel is (then it says so for an innings without). A match with neither has no tracking panel at all.
  const anyPitched = enoughTracking(bundle, 'pitched');
  const pitch = tracked && (anyPitched || positioned) ? (
    <div className="pan"><h3>Pitch map</h3><div className="rfill"><ChartColoursFor colour={colour}>{tk.pitched ? <LivePitch cells={cells} label={`Pitch map, ${snap.c} balls so far`} /> : <p className="rnodata">No line and length were recorded for this innings.</p>}</ChartColoursFor>{positioned ? null : prompt}</div></div>
  ) : null;
  const top = [wagon, pitch].filter((x): x is NonNullable<typeof x> => x !== null);

  const where = snap.c === 0 ? 'Before the first ball' : `${snap.progress}, ${snap.score}/${snap.wickets}`;
  const onToggle = (): void => {
    if (playing) { setPlaying(false); return; }
    if (pos >= total) setPos(0);
    setPlaying(true);
  };

  // The score and the wagon wheel share the top row, so they are the same height, and the last six balls take the whole width under them (Ari, 2026-10-22). With both tracking panels the pitch map keeps
  // the right column to itself. With one, it takes the place of the wagon wheel. With none, the last six balls stand beside the score as a tall tile.
  const layout = positioned && pitch ? 'both' : top.length === 1 ? 'one' : 'none';
  const score = <div className="rp-score"><LeftPanel b={bundle} snap={snap} marks={marksMap} /></div>;
  const last = <div className="rp-last"><Ticker snap={snap} tracked={tracked} playing={playing} prompt={layout === 'none' ? prompt : null} marks={marksMap} count={phone && layout !== 'none' ? 2 : 6} /></div>;
  const bar = <Playbar t={t} pos={pos} onPos={(p) => { setPos(p); }} playing={playing} onToggle={onToggle} speed={speed} speeds={speeds} onSpeed={setSpeed} marks={marks} where={where} />;

  // On a phone the score box, the last two balls and the play bar stay in place, and between them the wagon wheel is one page and the pitch map another, swiped as the tiles of other views are (Ari, 2026-10-26).
  if (phone) {
    const pages = layout === 'both' ? 2 : 1;
    return (
      <div className="rwrap rph">
        <div className="rview" ref={root} {...enter}>
          <div className={`obody rp rpa-${layout}`}>
            {score}
            {last}
            <div className="rph-pager" onScroll={(e) => { const el = e.currentTarget; setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}>
              {top[0] && <div className="rph-page"><div className="rp-main">{top[0]}</div></div>}
              {layout === 'both' && <div className="rph-page"><div className="rp-side">{top[1]}</div></div>}
            </div>
            {pages > 1 && <div className="rph-dots" aria-hidden="true">{Array.from({ length: pages }, (_, i) => <i key={i} className={i === page ? 'on' : undefined} />)}</div>}
          </div>
        </div>
        {bar}
      </div>
    );
  }

  return (
    <div className="rwrap">
      <div className="rview" ref={root} {...enter}>
        <div className={`obody rp rpa-${layout}`}>
          {score}
          {top[0] && <div className="rp-main">{top[0]}</div>}
          {layout === 'both' && <div className="rp-side">{top[1]}</div>}
          {last}
        </div>
      </div>
      {bar}
    </div>
  );
}
