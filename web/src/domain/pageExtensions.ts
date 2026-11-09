// Development tools (the /dev pages, the phone check page and its report route) are written as `page.dev.tsx` or `route.dev.ts`. Next only treats those as routes outside a production build, so a
// production build has no such route and no such code. `next.config.ts` uses this list.
const BASE = ['tsx', 'ts', 'jsx', 'js'];

export function pageExtensions(nodeEnv: string | undefined): string[] {
  return nodeEnv === 'production' ? BASE : [...BASE, 'dev.tsx', 'dev.ts'];
}
