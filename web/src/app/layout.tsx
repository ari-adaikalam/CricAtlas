import { EllipsisTips } from '@/components/EllipsisTips';
import { RowMarker } from '@/components/RowMarker';
import { InViewGuard, IN_VIEW_SCRIPT } from '@/components/InViewGuard';
import { ScrollGuard } from '@/components/ScrollGuard';
import { PhoneScrollLock } from '@/components/PhoneScrollLock';
import { earlyFetchScript } from '@/components/earlyFetch';
import { TouchTips } from '@/components/TouchTips';
import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import { Nav } from '@/components/Nav';
import './globals.css';
import '@/styles/phone.css';
import { SiteCredit } from '@/components/SiteCredit';
import { shareMeta } from '@/domain/shareMeta';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['300', '400', '500', '600', '700'] });

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
    <html lang="en" className={outfit.variable} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: IN_VIEW_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: earlyFetchScript(process.env.NEXT_PUBLIC_DATA_BASE_URL) }} />
        <Nav />
        {children}
        <InViewGuard />
        <ScrollGuard />
        <PhoneScrollLock />
        <TouchTips />
        <EllipsisTips />
        <RowMarker />
        <Analytics />
        <SpeedInsights />
        <footer className="foot"><SiteCredit /></footer>
      </body>
    </html>
  );
}
