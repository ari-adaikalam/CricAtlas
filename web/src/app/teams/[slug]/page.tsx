import type { Metadata } from 'next';
import { shareMeta } from '@/domain/shareMeta';
import { notFound } from 'next/navigation';
import { TeamShell } from '@/components/TeamShell';

export const metadata: Metadata = shareMeta('Team', 'teams');

// One prebuilt page for every address of this section: src/proxy.ts rewrites a real address to `_shell` and a missing one to `_` (the not-found page, with a 404). The browser reads which address it is
// (components/useAddressShell.tsx), so no address is rendered on demand.
export const dynamicParams = true;
export function generateStaticParams() { return [{ slug: '_shell' }]; }

export default async function TeamPage(props: PageProps<'/teams/[slug]'>) {
  const { slug } = await props.params;
  if (slug !== '_shell') notFound();
  return <TeamShell />;
}
