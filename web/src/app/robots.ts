import type { MetadataRoute } from 'next';
import { SITE } from '@/domain/sitemap';

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/' }, sitemap: `${SITE}/sitemap.xml` };
}
