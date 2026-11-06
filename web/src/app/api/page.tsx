import type { Metadata } from 'next';
import { shareMeta } from '@/domain/shareMeta';
import { Suspense } from 'react';
import { ApiView } from '@/components/ApiView';

export const metadata: Metadata = shareMeta('API', 'api');

export default function ApiPage() {
  return <Suspense><ApiView /></Suspense>;
}
