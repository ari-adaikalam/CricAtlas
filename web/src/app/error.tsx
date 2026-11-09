'use client';

import { ErrorState } from '@/components/states/PageStates';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
