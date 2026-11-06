import type { Metadata } from 'next';

export type ShareSection = 'home' | 'players' | 'teams' | 'matches' | 'tournaments' | 'compare' | 'records' | 'series' | 'api';

const DESCRIPTION: Record<ShareSection, string> = {
  home: 'A closer look at cricket, beyond the scorecard: wagon wheels, pitch maps and ball-by-ball detail.',
  players: 'Career numbers, shots and form for the players in the data.',
  teams: 'Results, players and records for national and club sides.',
  matches: 'Scorecards, ball-by-ball detail and a full replay.',
  tournaments: 'Tables, finals and top performers.',
  compare: 'Two players or teams, side by side.',
  records: 'Record lists by format or competition, men or women.',
  series: 'Bilateral series between national sides, grouped by pair.',
  api: 'Read the ball-by-ball data behind CricAtlas.',
};

/** The API's banner is drawn when asked for, so it carries the API's live counts (src/app/og/api/route.tsx). The others are fixed images. */
const bannerUrl = (section: ShareSection): string => (section === 'api' ? '/og/api' : `/og/${section}.png`);

/** The title, description and share banner of a section. A page that is shared shows the banner of its section (public/og, 1200 x 630). */
export function shareMeta(title: string | null, section: ShareSection): Metadata {
  const image = { url: bannerUrl(section), width: 1200, height: 630, alt: 'CricAtlas' };
  const name = title ? `${title} | CricAtlas` : 'CricAtlas';
  return {
    ...(title ? { title } : {}),
    description: DESCRIPTION[section],
    openGraph: { type: 'website', siteName: 'CricAtlas', title: name, description: DESCRIPTION[section], images: [image] },
    twitter: { card: 'summary_large_image', title: name, description: DESCRIPTION[section], images: [image.url] },
  };
}
