import type { Metadata } from 'next';
import { shareMeta } from '@/domain/shareMeta';
import { MatchesRootView } from '@/components/MatchesRootView';

export const metadata: Metadata = shareMeta('Matches', 'matches');

export default function MatchesPage() {
  return <MatchesRootView />;
}
