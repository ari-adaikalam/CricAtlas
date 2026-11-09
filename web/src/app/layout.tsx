import { EllipsisTips } from '@/components/EllipsisTips';
import { RowMarker } from '@/components/RowMarker';
import { InViewGuard, IN_VIEW_SCRIPT } from '@/components/InViewGuard';
import { ScrollGuard } from '@/components/ScrollGuard';
import { PhoneScrollLock } from '@/components/PhoneScrollLock';
import { earlyFetchScript } from '@/components/earlyFetch';
import { TouchTips } from '@/components/TouchTips';
import { RouteCodeWarmer } from '@/components/RouteCodeWarmer';
import type { Metadata, Viewport } from 'next';
import { Nav } from '@/components/Nav';
import '@/styles/outfit.css';
import './globals.css';
import '@/styles/phone.css';
import { SiteCredit } from '@/components/SiteCredit';
import { shareMeta } from '@/domain/shareMeta';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

const FONT_WAIT_SCRIPT = "(function(){var d=document.documentElement;if(!document.fonts||!document.fonts.load)return;d.classList.add('fw');var done=function(){d.classList.remove('fw')};Promise.all([document.fonts.load('400 16px Outfit'),document.fonts.load('700 16px Outfit')]).then(done,done);setTimeout(done,1200)})()";

export const metadata: Metadata = {
  metadataBase: new URL('https://cricatlas.ariadaikalam.com'),
  title: { default: 'CricAtlas', template: '%s | CricAtlas' },
  ...shareMeta(null, 'home'),
  // Defined explicitly: the filled ball, as an SVG for modern browsers and PNG and ICO for the rest.
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon.ico', sizes: '48x48' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = { themeColor: '#141414' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* The page is not drawn until the font is ready (at most 1.2 s): with the text invisible for the first few frames the page and the top bar came up without their words and the words popped in. */}
        <script dangerouslySetInnerHTML={{ __html: FONT_WAIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: IN_VIEW_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: earlyFetchScript(process.env.NEXT_PUBLIC_DATA_BASE_URL) }} />
        <Nav />
        {children}
        <InViewGuard />
        <ScrollGuard />
        <PhoneScrollLock />
        <TouchTips />
        <RouteCodeWarmer />
        <EllipsisTips />
        <RowMarker />
        <Analytics />
        <SpeedInsights />
        <footer className="foot"><SiteCredit /></footer>
      </body>
    </html>
  );
}
