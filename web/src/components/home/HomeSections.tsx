'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { fetchHome } from '@/data/homeData';
import { BUILDER } from '@/domain/builder';
import { ballLine, bigCount, dayMatches, dayText, LEADER_TITLES, type HomeFile } from '@/domain/homePage';
import { CountedText } from '../charts/CountedText';
import { usePlayOnView } from '../charts/usePlayOnView';
import { EntityLink } from '../EntityLink';
import { PrefetchLink } from '../PrefetchLink';
import { TeamEmblem } from '../TeamEmblem';
import { useMatchRowLink } from '../useMatchRowLink';

/** The body of a tile: its parts rise in one after another when the tile is on screen (once). */
function Play({ k, className, children }: { k: string; className: string; children: (played: boolean) => ReactNode }) {
  const { ref, played } = usePlayOnView<HTMLDivElement>(k);
  return <div ref={ref} className={`${className} hm-play${played ? ' play' : ''}`}>{children(played)}</div>;
}
const at = (i: number): React.CSSProperties => ({ ['--i' as string]: i });

/** The one small file the tiles read, fetched once the page is up. */
function useHome(): HomeFile | null {
  const [home, setHome] = useState<HomeFile | null>(null);
  useEffect(() => {
    let live = true;
    fetchHome().then((h) => { if (live) setHome(h); }).catch((error: unknown) => console.error('The home data failed to load', error));
    return () => { live = false; };
  }, []);
  return home;
}

/** The calendar day of the visitor, set after the page has loaded so the server and the browser never disagree about it. */
function useToday(): { month: number; day: number } | null {
  const [today, setToday] = useState<{ month: number; day: number } | null>(null);
  useEffect(() => { const d = new Date(); setToday({ month: d.getMonth() + 1, day: d.getDate() }); }, []);
  return today;
}

const EXPLORE: ReadonlyArray<readonly [string, string, string, string]> = [
  ['A player', '/players', 'Innings, spells, shot maps, records and trophies.', 'Browse players'],
  ['A team', '/teams', 'Results, trophies, squads and how the team plays.', 'Browse teams'],
  ['A tournament', '/tournaments', 'Every edition: champions, tables and leading players.', 'Browse tournaments'],
  ['Records', '/records', 'Record lists by format, competition, year and ground.', 'Open Records'],
  ['Series', '/series', 'Every tour and series, with its results.', 'Browse series'],
  ['Compare', '/compare', 'Two players or two teams, side by side.', 'Open Compare'],
];

export function ExploreBody() {
  return (
    <Play k="explore" className="hm-ex">
      {() => EXPLORE.map(([title, href, text, go], i) => (
        <PrefetchLink key={title} className="hm-ec hm-arise" href={href} style={at(i)}><h3>{title}</h3><p>{text}</p><span className="eg">{go}</span></PrefetchLink>
      ))}
    </Play>
  );
}

export function LeadersBody() {
  const home = useHome();
  return (
    <Play k="leaders" className="hm-lds">
      {() => LEADER_TITLES.map(([key, title], i) => (
        <div className="hm-ld hm-arise" style={at(i)} key={key}>
          <h3>{title}</h3>
          {(home?.leaders[key] ?? []).map(([id, name, n], k) => (
            <div className="hm-lr" key={id}><span className="n">{k + 1}</span><b><EntityLink entity={{ kind: 'player', id, name }}>{name}</EntityLink></b><em>{n.toLocaleString('en')}</em></div>
          ))}
          <PrefetchLink className="hm-lk" href="/records">Full records</PrefetchLink>
        </div>
      ))}
    </Play>
  );
}

/** A team's name as a label: its emblem, then the name as a link to the team's page. */
function TeamName({ id, name }: { id: string; name: string }) {
  return <span className="hm-rt"><TeamEmblem team={name} size={20} /><EntityLink entity={{ kind: 'team', id, name }}>{name}</EntityLink></span>;
}

export function DayBody() {
  const home = useHome();
  const today = useToday();
  const link = useMatchRowLink();
  const matches = home && today ? dayMatches(home, today.month, today.day) : [];
  return (
    <Play k="day" className="hm-dayb">
      {() => (
        <>
          <p className="hm-sub hm-arise" style={at(0)}>{today ? `Played on ${dayText(today.month, today.day)} in past years.` : 'Played on this date in past years.'}</p>
          {matches.map((m, i) => (
            <div className="hm-dy hm-arise" style={at(i + 1)} key={m.id} {...link(m.id, m.title)}>
              <b className="yr">{m.year}</b>
              <div><b className="hm-tm"><TeamName {...m.teams[0]} /> v <TeamName {...m.teams[1]} /></b><span>{m.competition}</span><span>{m.result}{m.potm ? '. Player of the match: ' : ''}{m.potm && <EntityLink entity={{ kind: 'player', id: m.potm.id, name: m.potm.name }}>{m.potm.name}</EntityLink>}</span></div>
            </div>
          ))}
          {home && today && matches.length === 0 && <p className="hm-sub">No match in the data was played on this date.</p>}
        </>
      )}
    </Play>
  );
}

export function DataBody() {
  const home = useHome();
  const balls = home ? bigCount(home.balls) : null;
  const stats: ReadonlyArray<readonly [string, string, boolean]> = [
    [home ? home.matches.toLocaleString('en') : '14,585', 'matches', true],
    [balls ? `${balls.value.toLocaleString('en', { minimumFractionDigits: balls.decimals })}${balls.suffix}` : '5.9 million', 'balls bowled', true],
    [String(home?.competitions ?? 15), 'competitions', true],
    [String(home?.since ?? 2001), 'coverage from', false],
  ];
  return (
    <Play k="data" className="hm-stats">
      {(played) => stats.map(([text, label, counted], i) => (
        <div className="hm-st hm-arise" style={at(i)} key={label}><b>{counted ? <CountedText text={text} play={played} /> : text}</b><span>{label}</span></div>
      ))}
    </Play>
  );
}

const BUILT_LINKS: ReadonlyArray<readonly [string, string, boolean]> = [
  ['Portfolio', BUILDER.portfolio, true],
  ['GitHub', BUILDER.github, true],
  ['Email', `mailto:${BUILDER.email}`, false],
];

export function BuiltByBody() {
  const home = useHome();
  // One notable ball is picked when the file arrives and kept, so the line does not change under the reader.
  const [pick, setPick] = useState<ReturnType<typeof ballLine> | null>(null);
  useEffect(() => {
    if (home && home.notable.length > 0 && pick === null) setPick(ballLine(home.notable[Math.floor(Math.random() * home.notable.length)]!));
  }, [home, pick]);
  return (
    <Play k="built" className="hm-by">
      {() => (
        <>
          <h3 className="hm-arise" style={at(0)}>{BUILDER.name}</h3>
          <div className="hm-bt hm-arise" style={at(1)}>
            <span>Who and why</span>
            <p>I love cricket and I build things that work. CricAtlas started with one question: what really happened on {pick ? <>ball {pick.ball} of <EntityLink entity={{ kind: 'match', id: pick.matchId, name: pick.title }}>{pick.title}</EntityLink></> : 'a particular ball'}? I wanted the answer to feel like a live broadcast, with an analyst&apos;s depth behind it.</p>
          </div>
          <div className="hm-bt hm-arise" style={at(2)}>
            <span>Credit</span>
            <p>Ball-by-ball data from <a href={BUILDER.cricsheet} target="_blank" rel="noopener noreferrer">Cricsheet</a>, under the <a href={BUILDER.licence} target="_blank" rel="noopener noreferrer">Open Data Commons Attribution License</a> (ODC-BY 1.0).</p>
          </div>
          <div className="hm-bls hm-arise" style={at(3)}>
            {BUILT_LINKS.map(([label, href, external]) => (
              <a key={label} className="hm-bl" href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{label}</a>
            ))}
          </div>
        </>
      )}
    </Play>
  );
}
