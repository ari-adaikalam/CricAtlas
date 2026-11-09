import type { Metadata } from 'next';
import { shareMeta } from '@/domain/shareMeta';
import { notFound } from 'next/navigation';
import { CompareSwitch } from '@/components/CompareSwitch';

export const metadata: Metadata = shareMeta('Compare', 'compare');
export const dynamicParams = false;
export function generateStaticParams() { return [{ kind: 'players' }, { kind: 'teams' }]; }

// One page for both comparisons, so that moving between them keeps the page and morphs it in place (components/CompareSwitch.tsx).
export default async function ComparePage(props: { params: Promise<{ kind: string }> }) {
  const { kind } = await props.params;
  if (kind !== 'players' && kind !== 'teams') notFound();
  return <CompareSwitch initial={kind} />;
}
