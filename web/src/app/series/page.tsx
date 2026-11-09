import type { Metadata } from 'next';
import { shareMeta } from '@/domain/shareMeta';
import { SeriesRootView } from '@/components/SeriesRootView';

export const metadata: Metadata = shareMeta('Series', 'series');

export default function SeriesPage() {
  return <SeriesRootView />;
}
