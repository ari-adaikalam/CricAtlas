'use client';

import { PrefetchLink as Link } from '@/components/PrefetchLink';
import { Watermark } from './BrandArt';
import { useEffect, useLayoutEffect, useState } from 'react';
import { fetchProfile } from '@/data/profileData';
import type { Player } from '@/data/player';
import { PLAYER_PAIRS, randomPair, TEAM_PAIRS } from '@/domain/compareExamples';
import { NavBar } from './Nav';
import { CompareFace } from './CompareFace';
import { TeamEmblem } from './TeamEmblem';
import '@/styles/player.css';
import '@/styles/comparefaces.css';
import '@/styles/compareroot.css';
import { SiteCredit } from '@/components/SiteCredit';

/**
 * The page the Compare button opens (Ari, 2026-10-25): two options, Players and Teams, each with a "versus" example, a different famous pair on each visit. A click opens that comparison with both
 * slots empty to fill in. The pair is picked in the browser after the page is drawn, so the example appears with a short fade and the server draws the same page for everyone.
 */
export function CompareRootView() {
  const [pick, setPick] = useState<{ players: (typeof PLAYER_PAIRS)[number]; teams: (typeof TEAM_PAIRS)[number] } | null>(null);
  const [faces, setFaces] = useState<[Player, Player] | null>(null);

  useLayoutEffect(() => { document.body.classList.add('has-app'); return () => document.body.classList.remove('has-app'); }, []);
  useEffect(() => { document.title = 'Compare | CricAtlas'; setPick({ players: randomPair(PLAYER_PAIRS), teams: randomPair(TEAM_PAIRS) }); }, []);
  useEffect(() => {
    if (!pick) return;
    let live = true;
    Promise.all([fetchProfile(pick.players.a), fetchProfile(pick.players.b)]).then(([a, b]) => { if (live && a && b) setFaces([a.player, b.player]); }).catch(() => undefined);
    return () => { live = false; };
  }, [pick]);

  const t = pick?.teams;
  return (
    <div className="pgx cpr">
      <div className="app state-sum" data-up="2">
        <NavBar />
        <section className="sum">
          <Watermark />
          <div className="sumin">
            <h1 className="cro-h">Compare</h1>
            <p className="cro-p">Put two players or two teams side by side. Pick what to compare.</p>
            <div className="cro">
              <Link href="/compare/players" className="cro-card">
                <div className="cro-t"><b>Players</b><span>Batting, bowling, how they got out, and head to head, in any format.</span></div>
                <div className={`cro-vs${faces ? ' on' : ''}`} aria-hidden={!faces}>
                  {faces && <>
                    <div className="cro-side"><CompareFace player={faces[0]} size={132} ring="#EBC862" /><b>{faces[0].name}</b><span>{faces[0].country}</span></div>
                    <span className="cro-v">vs</span>
                    <div className="cro-side"><CompareFace player={faces[1]} size={132} ring="#56B4E9" /><b>{faces[1].name}</b><span>{faces[1].country}</span></div>
                  </>}
                </div>
                <span className="cro-go">Compare players</span>
              </Link>
              <Link href="/compare/teams" className="cro-card">
                <div className="cro-t"><b>Teams</b><span>Results, batting, bowling and head to head, for sides of the same kind.</span></div>
                <div className={`cro-vs${t ? ' on' : ''}`} aria-hidden={!t}>
                  {t && <>
                    <div className="cro-side"><span className="cro-em" style={{ boxShadow: '0 0 0 3px #EBC862' }}><TeamEmblem team={t.an} size={132} /></span><b>{t.an}</b><span>{t.a.endsWith('female') ? "Women's" : "Men's"}</span></div>
                    <span className="cro-v">vs</span>
                    <div className="cro-side"><span className="cro-em" style={{ boxShadow: '0 0 0 3px #56B4E9' }}><TeamEmblem team={t.bn} size={132} /></span><b>{t.bn}</b><span>{t.b.endsWith('female') ? "Women's" : "Men's"}</span></div>
                  </>}
                </div>
                <span className="cro-go">Compare teams</span>
              </Link>
            </div>
          </div>
          <p className="credit"><SiteCredit /></p>
        </section>
      </div>
    </div>
  );
}
