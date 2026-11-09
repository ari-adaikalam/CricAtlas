'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { NavBar } from '../Nav';
import { TileCarousel, type TileDef } from '../TileCarousel';
import '@/styles/player.css';
import '@/styles/home.css';
import { HeroReplay } from './HeroReplay';
import { HomeFirstPaint } from './HomeFirstPaint';
import { BuiltByBody, DataBody, DayBody, ExploreBody, LeadersBody } from './HomeSections';
import { SiteCredit } from '@/components/SiteCredit';

const TILES: readonly TileDef[] = [
  { id: 'replay', label: 'Innings', group: 'Innings', title: 'Great innings', tag: 'Tracking', wide: true, tip: 'Real innings played back ball by ball.', body: <HeroReplay /> },
  { id: 'explore', label: 'Explore', group: 'Explore', title: 'Where to begin', tag: 'Cricsheet', wide: true, tip: 'The main pages of CricAtlas.', body: <ExploreBody /> },
  { id: 'leaders', label: 'Leaders', group: 'Explore', title: 'Career leaders', tag: 'Cricsheet', wide: true, tip: 'Most runs, wickets and sixes across all formats and competitions.', body: <LeadersBody /> },
  { id: 'day', label: 'On this day', group: 'Today', title: 'On this day', tag: 'Cricsheet', tip: 'Matches played on today\'s date in past years.', body: <DayBody /> },
  { id: 'data', label: 'The data', group: 'Today', title: 'The data behind it', tag: 'Cricsheet', tip: 'Ball-by-ball data from Cricsheet, with tracked line, length and shot placement.', body: <DataBody /> },
  { id: 'built', label: 'Built by', group: 'About', title: 'Built by', tip: 'Who made CricAtlas, and where to find them.', body: <BuiltByBody /> },
];

/**
 * The Home page in the app's tile frame: the replayed innings with the row of innings to pick from, then where to begin, the leaders, and the matches of the day beside
 * the size of the data and who built the app. The last half tile has no partner by Ari's decision (2026-10-24), so it pairs with the half tile before it.
 */
export function HomeView() {
  // The tile row measures the window, so it is drawn once the page is in the browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useLayoutEffect(() => { document.body.classList.add('has-app'); return () => document.body.classList.remove('has-app'); }, []);
  useEffect(() => { document.title = 'CricAtlas'; }, []);
  // The Home link and the brand lead to this same address, so the router does nothing. Here they bring the row back to the innings.
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const link = (e.target as Element | null)?.closest<HTMLAnchorElement>('.nav a[href="/"]');
      if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      document.querySelector<HTMLButtonElement>('.rtr .nd')?.click();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return (
    <div className="pgx hmx">
      <div className="app" data-up="2">
        <NavBar />
        <section className="pane on" id="p-home">
          {/* The server sends the frame and grey shapes, so the middle is never empty; the row replaces it once the page is in the browser. The row opens at once (instant): only the contents fade in. */}
          {mounted ? <TileCarousel name="Home" note="Click a stop to jump to it." tiles={TILES} resetKey="home" instant /> : <HomeFirstPaint name="Home" note="Click a stop to jump to it." tiles={TILES} />}
        </section>
        <footer className="foot"><SiteCredit /></footer>
      </div>
    </div>
  );
}
