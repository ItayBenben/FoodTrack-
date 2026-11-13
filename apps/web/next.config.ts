import type { NextConfig } from 'next';
const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@foodtrack/shared', '@foodtrack/tracker-schema', '@foodtrack/tokens'],
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  // Same-origin API in dev; in production Caddy routes /api to the api service.
  async rewrites() { return [{ source: '/api/:path*', destination: `${API}/api/:path*` }]; },
};
export default config;
