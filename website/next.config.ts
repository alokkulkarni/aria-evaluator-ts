import type { NextConfig } from 'next'

// Use NEXT_BUILD_MODE=export to produce a fully static site (S3 + CloudFront).
// Default is 'standalone' for backward compatibility and local dev.
const buildMode = process.env.NEXT_BUILD_MODE === 'export' ? 'export' : 'standalone'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://accounts.google.com https://github.com",
      "frame-src https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com https://github.com",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  output: buildMode,
  images: buildMode === 'export'
    ? { unoptimized: true }
    : {
        remotePatterns: [
          { hostname: 'avatars.githubusercontent.com' },
          { hostname: 'lh3.googleusercontent.com' },
          { hostname: '*.googleusercontent.com' },
        ],
      },
  // Security headers are applied via next.config in standalone mode.
  // In static export mode, CloudFront response headers policy handles this.
  ...(buildMode === 'standalone' && {
    headers: async () => [{ source: '/(.*)', headers: securityHeaders }],
  }),
}

export default nextConfig
