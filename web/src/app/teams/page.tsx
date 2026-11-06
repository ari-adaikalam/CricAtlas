import type { Metadata } from 'next';
import { shareMeta } from '@/domain/shareMeta';
import { TeamsRootView } from '@/components/TeamsRootView';

export const metadata: Metadata = shareMeta('Teams', 'teams');

export default function TeamsPage() {
  return <TeamsRootView />;
}
