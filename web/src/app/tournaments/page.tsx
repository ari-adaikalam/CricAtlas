import type { Metadata } from 'next';
import { shareMeta } from '@/domain/shareMeta';
import { TournamentsRootView } from '@/components/TournamentsRootView';

export const metadata: Metadata = shareMeta('Tournaments', 'tournaments');

export default function TournamentsPage() {
  return <TournamentsRootView />;
}
