import type { BlogPost } from './blog-data'
import { PLANS } from './plans'

/**
 * Schema.org structured data (JSON-LD) for the marketing site.
 *
 * Rendered server-side in the root layout via <JsonLd /> so it ships in the
 * initial HTML — required for Google rich results and AI search (AI Overviews,
 * ChatGPT, Perplexity) entity resolution. Offers are derived from PLANS so the
 * pricing markup stays in sync with the real pricing source of truth.
 *
 * Validate after changes:
 *   https://search.google.com/test/rich-results
 *   https://validator.schema.org/
 */

export const SITE_URL = 'https://ariaeval.io'

const SITE_DESCRIPTION =
  'Enterprise AI safety evaluation, observability, and global deployment workflows for modern teams.'

// TODO: add real, owned social/profile URLs (LinkedIn, X, GitHub) to strengthen
// the Organization entity for the Knowledge Graph and AI engines. Leave empty
// rather than shipping guessed URLs — `sameAs` is only emitted when non-empty.
const SOCIAL_PROFILES: string[] = []

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

// Build one Offer per priced plan straight from PLANS (skips the -1 "Contact sales" tier).
const offers = PLANS.filter((plan) => plan.price.monthly >= 0).map((plan) => ({
  '@type': 'Offer',
  name: plan.name,
  price: String(plan.price.monthly),
  priceCurrency: 'USD',
  url: `${SITE_URL}/pricing`,
  availability: 'https://schema.org/InStock',
  ...(plan.price.monthly > 0 && {
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: String(plan.price.monthly),
      priceCurrency: 'USD',
      unitText: 'MONTH',
    },
  }),
}))

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
  offers,
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
