import type { BallFile } from '@/domain/ballByBall';
import { dataBaseUrl } from './sources';

// The ball file of one innings (tools/ball_files.py), fetched when Ball by ball is near the screen. A few recent files stay, so changing the innings back and forth is instant.
const files = new Map<string, Promise<BallFile | null>>();

export function fetchBalls(matchId: number, innings: number): Promise<BallFile | null> {
  const key = `${matchId}_${innings}`;
  const have = files.get(key);
  if (have) return have;
  const promise = (async () => {
    const response = await fetch(`${dataBaseUrl()}/m/balls/${key}.json`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`The balls of ${key} answered ${response.status}`);
    return (await response.json()) as BallFile;
  })().catch((error: unknown) => { files.delete(key); throw error; });
  files.set(key, promise);
  while (files.size > 12) { const oldest = files.keys().next().value; if (oldest === undefined) break; files.delete(oldest); }
  return promise;
}

export function prefetchBalls(matchId: number, innings: number): void { fetchBalls(matchId, innings).catch(() => undefined); }
