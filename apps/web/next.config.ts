import type { NextConfig } from 'next';

// Server-side address of the API. The browser never calls the API directly: it calls /api/* on
// this site, and Next proxies it. Same origin means cookies work and no CORS is needed.
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_INTERNAL_URL}/:path*` },
      // Photos: served by the API from local storage in development; S3 + CDN in production (slice 7).
      { source: '/media/:path*', destination: `${API_INTERNAL_URL}/media/:path*` },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
