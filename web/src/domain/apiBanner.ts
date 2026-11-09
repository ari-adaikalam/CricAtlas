import { parseMeta } from '@/domain/apiPage';

export interface BannerCount { value: string; label: string }

/** The three counts the API page shows, from the API's /v1/meta answer. Empty when the answer is not the shape expected, so the banner is drawn without numbers instead of failing. */
export function bannerCounts(json: unknown): BannerCount[] {
  const meta = parseMeta(json);
  if (!meta) return [];
  return [
    { value: meta.matches.toLocaleString('en-US'), label: 'matches' },
    { value: meta.balls.toLocaleString('en-US'), label: 'balls' },
    { value: meta.players.toLocaleString('en-US'), label: 'players' },
  ];
}
