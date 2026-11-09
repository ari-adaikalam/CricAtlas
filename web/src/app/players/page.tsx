import type { Metadata } from 'next';
import { shareMeta } from '@/domain/shareMeta';
import { PlayersRootView } from '@/components/PlayersRootView';

export const metadata: Metadata = shareMeta('Players', 'players');

export default function PlayersPage() {
  return <PlayersRootView />;
}
