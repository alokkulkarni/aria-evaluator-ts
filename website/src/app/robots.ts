import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/schema'

// Required for `output: 'export'` — render this route handler at build time.
export const dynamic = 'force-static'

// Keep authenticated / app surfaces out of search and AI crawls.
const disallow = ['/api/', '/dashboard/', '/sign-out', '/sign-up/provisioning']

// AI search + assistant crawlers we explicitly welcome for GEO visibility.
// (Listed separately so intent is documented even if the wildcard rule changes.)
const aiCrawlers = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      { userAgent: aiCrawlers, allow: '/', disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
