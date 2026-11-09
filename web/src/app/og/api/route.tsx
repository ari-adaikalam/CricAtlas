import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { bannerCounts, type BannerCount } from '@/domain/apiBanner';
import { mapApiPath, upstreamHeaders } from '@/domain/apiProxy';

/**
 * The API page's share banner (1200 x 630), drawn when a link preview asks for it so the three counts are the API's own. The other banners are fixed images in public/og.
 * The counts come from the same /v1/meta answer the page shows, read here on the server with the proxy's credential, which never reaches the image. If the API does not answer in time the banner is
 * drawn without the numbers. The edge keeps an answer for five minutes so a burst of previews makes one call to the API.
 */
export const dynamic = 'force-dynamic';

const RED = '#c4313a';
// The files sit beside this route and are bundled with it (outputFileTracingIncludes in next.config.ts).
const asset = (file: string) => readFile(join(process.cwd(), 'src', 'app', 'og', 'api', file));

async function counts(): Promise<BannerCount[]> {
  const origin = process.env.API_PROXY_ORIGIN ?? '';
  const token = process.env.API_PROXY_TOKEN ?? '';
  const path = mapApiPath('/api/v1/meta');
  if (!origin || !token || path === null) return [];
  try {
    const r = await fetch(origin + path, { headers: upstreamHeaders(() => null, token), cache: 'no-store', signal: AbortSignal.timeout(4000) });
    return r.ok ? bannerCounts(await r.json()) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const [regular, bold, ball, stats] = await Promise.all([asset('Outfit-Regular.ttf'), asset('Outfit-Bold.ttf'), asset('ball.svg'), counts()]);
  const ballUrl = `data:image/svg+xml;base64,${ball.toString('base64')}`;
  const rings = [150, 250, 350, 450].map((r) => `<circle cx="540" cy="345" r="${r}"/>`).join('');
  const ringsUrl = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 690" fill="none" stroke="#ffffff" stroke-opacity=".07" stroke-width="2">${rings}</svg>`)}`;
  const glow = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><radialGradient id="a" gradientUnits="userSpaceOnUse" cx="984" cy="328" r="1" gradientTransform="translate(984 328) scale(760 600) translate(-984 -328)"><stop offset="0" stop-color="#c4313a" stop-opacity=".34"/><stop offset=".68" stop-color="#c4313a" stop-opacity="0"/></radialGradient><radialGradient id="b" gradientUnits="userSpaceOnUse" cx="0" cy="630" r="1" gradientTransform="translate(0 630) scale(620 380) translate(0 -630)"><stop offset="0" stop-color="#c4313a" stop-opacity=".18"/><stop offset=".7" stop-color="#c4313a" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="630" fill="url(#a)"/><rect width="1200" height="630" fill="url(#b)"/></svg>';
  const glowUrl = `data:image/svg+xml;utf8,${encodeURIComponent(glow)}`;
  const line = (text: string) => <div style={{ display: 'flex' }}>{text}</div>;

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: 'flex', position: 'relative', background: '#141414', color: '#fff', fontFamily: 'Outfit', overflow: 'hidden' }}>
        <img src={glowUrl} alt="" width={1200} height={630} style={{ position: 'absolute', left: 0, top: 0 }} />
        <img src={ringsUrl} alt="" width={900} height={690} style={{ position: 'absolute', right: -250, top: -30, opacity: 0.9 }} />
        <div style={{ position: 'absolute', left: 80, top: 62, display: 'flex', alignItems: 'center', fontSize: 46, fontWeight: 700, lineHeight: 1 }}>
          <img src={ballUrl} alt="" width={58} height={58} style={{ marginRight: 2 }} />
          Cric<span style={{ color: RED }}>Atlas</span>
        </div>
        <div style={{ position: 'absolute', right: 80, top: 82, display: 'flex', fontSize: 20, fontWeight: 700, letterSpacing: '0.16em', color: '#a8a8a8' }}>API</div>
        <div style={{ position: 'absolute', left: 80, top: 150, height: 360, width: 620, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 70, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.012em' }}>
            {line('The data behind')}
            {line('CricAtlas,')}
            {line('over an API.')}
          </div>
          <div style={{ display: 'flex', marginTop: 22, fontSize: 28, lineHeight: 1.3, color: '#d0d0d0', fontWeight: 400 }}>Read the ball-by-ball data.</div>
          {stats.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 40, fontSize: 26, fontWeight: 700 }}>
              {stats.map((s) => (
                <div key={s.label} style={{ display: 'flex', marginRight: 22 }}>
                  <span style={{ color: RED, marginRight: 8 }}>{s.value}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <img src={ballUrl} alt="" width={400} height={400} style={{ position: 'absolute', right: 48, top: 118 }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, display: 'flex', background: RED }} />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Outfit', data: regular.buffer.slice(regular.byteOffset, regular.byteOffset + regular.byteLength) as ArrayBuffer, weight: 400, style: 'normal' },
        { name: 'Outfit', data: bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength) as ArrayBuffer, weight: 700, style: 'normal' },
      ],
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=300' },
    },
  );
}
