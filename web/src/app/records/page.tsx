import type { Metadata } from 'next';
import { shareMeta } from '@/domain/shareMeta';
import { RecordListsView } from '@/components/RecordListsView';

export const metadata: Metadata = shareMeta('Records', 'records');

export default function RecordsPage() {
  return <RecordListsView />;
}
