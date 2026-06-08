import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Only serve API routes and dashboard — no static marketing pages
  images: {
    remotePatterns: [
      { hostname: 'avatars.githubusercontent.com' },
      { hostname: 'lh3.googleusercontent.com' },
      { hostname: '*.googleusercontent.com' },
    ],
  },
}

export default nextConfig
