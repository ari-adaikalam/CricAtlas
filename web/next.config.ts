import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
import { pageExtensions } from './src/domain/pageExtensions';

// The engine files live under /duckdb/<version> (scripts/copy-duckdb.mjs), so they can be cached for a year.
const duckdbVersion = (JSON.parse(readFileSync('node_modules/@duckdb/duckdb-wasm/package.json', 'utf8')) as { version: string }).version;

const origin = (url: string | undefined, fallback: string): string => { try { return new URL(url ?? fallback).origin; } catch { return new URL(fallback).origin; } };
const dataHost = origin(process.env.NEXT_PUBLIC_DATA_BASE_URL, 'http://localhost:8788');
// The API is served under this site's own /api, which 'self' covers. Another host is allowed only when NEXT_PUBLIC_API_BASE_URL names one (a local API, say). The API's old public hostname is retired and is not listed.
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
const apiHost = /^https?:\/\//.test(apiBase) ? origin(apiBase, 'http://localhost:8000') : '';

// Production only: the dev server needs eval and frames (the phone check page). Scripts keep 'unsafe-inline' because Next writes its start-up scripts inline and a nonce would make every page render per request, which gives up the static speed. The engine needs wasm-unsafe-eval and a blob worker.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img1.hscicdn.com",
  "font-src 'self' data:",
  ['connect-src', "'self'", 'blob:', 'data:', dataHost, apiHost].filter(Boolean).join(' '),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  // A second build can sit beside the dev server's (NEXT_DIST_DIR=.next-prod), which is how a production build is measured while the dev server runs.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  reactStrictMode: true,
  // The share banner for the API draws itself from a font and an image beside its route, which the file tracer cannot see.
  outputFileTracingIncludes: { '/og/api': ['./src/app/og/api/*.ttf', './src/app/og/api/*.svg'] },
  poweredByHeader: false,
  // Hosts that may load the dev server's own files when it is reached over the tailnet for a phone check. Empty unless DEV_ALLOWED_ORIGINS is set; production ignores it.
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
  // `page.dev.tsx` files are routes in development only.
  pageExtensions: pageExtensions(process.env.NODE_ENV),
  env: { NEXT_PUBLIC_DUCKDB_VERSION: duckdbVersion },
  async headers() {
    return [
      { source: '/duckdb/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The phone check page (development only) shows the app in a frame of its own origin.
          { key: 'X-Frame-Options', value: process.env.NODE_ENV === 'production' ? 'DENY' : 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: csp }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
