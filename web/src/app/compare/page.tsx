import type { Metadata } from 'next';
import { shareMeta } from '@/domain/shareMeta';
import { CompareRootView } from '@/components/CompareRootView';

export const metadata: Metadata = shareMeta('Compare', 'compare');

export default function ComparePage() {
  return <CompareRootView />;
}
