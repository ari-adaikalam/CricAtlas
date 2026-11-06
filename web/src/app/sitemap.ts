import type { MetadataRoute } from 'next';
import { SITE, sitemapPaths } from '@/domain/sitemap';

/** Built from the data host at build time. A host that does not answer fails the build, so a thin sitemap is never shipped by accident. */
async function get<T>(base: string, file: string): Promise<T> {
  const res = await fetch(`${base}/${file}`);
  if (!res.ok) throw new Error(`sitemap: ${file} answered ${res.status}`);
  return (await res.json()) as T;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_DATA_BASE_URL?.replace(/\/$/, '');
  if (!base) throw new Error('sitemap: NEXT_PUBLIC_DATA_BASE_URL is not set');
  const [plist, mlist, teams, tournaments] = await Promise.all([
    get<unknown[][]>(base, 'plist.json'), get<{ rows: unknown[][] }>(base, 'mlist.json'), get<unknown[][]>(base, 't/index.json'), get<unknown[][]>(base, 'n/index.json'),
  ]);
  return sitemapPaths(plist, mlist, teams, tournaments).map((path) => ({ url: `${SITE}${path}` }));
}
