import type { BlogPost } from './blog-data'
import { GITHUB_URL } from './site'

/**
 * Schema.org structured data (JSON-LD) for the marketing site.
 *
 * Rendered server-side in the root layout via <JsonLd /> so it ships in the
 * initial HTML — required for Google rich results and AI search (AI Overviews,
 * ChatGPT, Perplexity) entity resolution.
 *
 * Validate after changes:
 *   https://search.google.com/test/rich-results
 *   https://validator.schema.org/
 */

export const SITE_URL = 'https://ariaeval.io'

const SITE_DESCRIPTION =
  'Open-source AI agent evaluation: score conversational AI across 15 quality and safety dimensions with a panel of independent AI judges. Self-hostable.'

// Owned profiles that strengthen the Organization entity for the Knowledge Graph
// and AI engines. `sameAs` is only emitted when non-empty.
const SOCIAL_PROFILES: string[] = [GITHUB_URL]

const organization = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: 'ARIA Evaluator',
  legalName: 'ARIA Evaluator, Inc.',
  url: `${SITE_URL}/`,
  description: SITE_DESCRIPTION,
  logo: {
    '@type': 'ImageObject',
    '@id': `${SITE_URL}/#logo`,
    url: `${SITE_URL}/icon.svg`,
    caption: 'ARIA Evaluator',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    url: `${SITE_URL}/contact`,
  },
  ...(SOCIAL_PROFILES.length > 0 && { sameAs: SOCIAL_PROFILES }),
}

const website = {
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: 'ARIA Evaluator',
  url: `${SITE_URL}/`,
  description: SITE_DESCRIPTION,
  publisher: { '@id': `${SITE_URL}/#organization` },
  inLanguage: 'en',
  // No `potentialAction`/SearchAction: the site has no public search endpoint.
  // Adding a Sitelinks Searchbox without a real ?q= handler is a Rich Results error.
}

const webApplication = {
  '@type': 'WebApplication',
  '@id': `${SITE_URL}/#webapp`,
  name: 'ARIA Evaluator',
  url: `${SITE_URL}/`,
  description:
    'ARIA Evaluator submits conversational-AI transcripts to a panel of independent AI judges, scores them across 15 quality and safety dimensions, runs adversarial security tests, and routes judge disagreements to human reviewers so teams can launch AI agents with verifiable quality and safety scores.',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'AI Safety & Quality Evaluation',
  operatingSystem: 'Web Browser',
  browserRequirements: 'Requires JavaScript. Requires a modern web browser.',
  publisher: { '@id': `${SITE_URL}/#organization` },
  featureList: [
    'Panel-based scoring with multiple independent AI judges',
    '15-dimension evaluation across response quality, task completion, safety, security and customer experience',
    'Adversarial security testing (prompt injection, jailbreak, social engineering)',
    'Real-time observability dashboard and live run monitoring',
    'Adapters for Amazon Connect, Lex, Azure Bot Service, Microsoft Copilot, OpenAPI/REST and WebSocket',
    'FCA Consumer Duty compliance validation and regulatory reporting',
    'Quality drift detection with baseline tracking',
    'Human review queue with audit-logged overrides',
    'Encrypted conversations stored in isolated infrastructure',
  ],
  // Free and open source.
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
  },
}

/** Site-wide structured-data graph: Organization + WebSite + WebApplication. */
export const siteSchemaGraph = {
  '@context': 'https://schema.org',
  '@graph': [organization, website, webApplication],
}

/**
 * Per-post BlogPosting schema with a credited author (Person) and publish date.
 * Author + date are the recency/authority signals AI search weights most, so
 * this is rendered on each /blog/[slug] page via <JsonLd />.
 */
export function buildBlogPostingSchema(post: BlogPost) {
  const url = `${SITE_URL}/blog/${post.slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#blogposting`,
    headline: post.title,
    description: post.excerpt,
    url,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    inLanguage: 'en',
    keywords: post.tags.join(', '),
    articleSection: post.category,
    author: {
      '@type': 'Person',
      name: post.author.name,
      jobTitle: post.author.role,
    },
    publisher: { '@id': `${SITE_URL}/#organization` },
    isPartOf: { '@id': `${SITE_URL}/#website` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

/**
 * Article schema for evergreen guide/pillar pages (org-authored, dated for freshness).
 */
export function buildArticleSchema(opts: {
  path: string
  headline: string
  description: string
  datePublished: string
  dateModified?: string
}) {
  const url = `${SITE_URL}${opts.path}`
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: opts.headline,
    description: opts.description,
    url,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    inLanguage: 'en',
    author: { '@type': 'Organization', '@id': `${SITE_URL}/#organization` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    isPartOf: { '@id': `${SITE_URL}/#website` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}
