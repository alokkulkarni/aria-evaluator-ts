// Docs navigation tree — the single source of truth for the /docs left sidebar
// and the prev/next pager. Internal links are real routes; external links open
// off-site (GitHub / Slack).
import {
  GITHUB_URL,
  GITHUB_DISCUSSIONS_URL,
  GITHUB_CONTRIBUTING_URL,
  SLACK_URL,
} from '@/lib/site'

export type DocNavItem = { label: string; href: string; external?: boolean }
export type DocNavGroup = { title: string; items: DocNavItem[] }

export const docsNav: DocNavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'What is ARIA Evaluator', href: '/docs' },
      { label: 'Architecture', href: '/docs/architecture' },
    ],
  },
  {
    title: 'Get Started',
    items: [
      { label: 'Quick Start', href: '/docs/quick-start' },
      { label: 'Run Locally', href: '/docs/run-locally' },
      { label: 'Deploy with Terraform', href: '/docs/deploy-terraform' },
      { label: 'Configuration', href: '/docs/configuration' },
      { label: 'CLI Usage', href: '/docs/cli' },
    ],
  },
  {
    title: 'Concepts',
    items: [
      { label: 'Scenarios', href: '/docs/concepts/scenarios' },
      { label: 'Adapters', href: '/docs/concepts/adapters' },
      { label: 'The Judge', href: '/docs/concepts/the-judge' },
      { label: 'Dimensions', href: '/docs/concepts/dimensions' },
      { label: 'Transcripts & Reports', href: '/docs/concepts/reports' },
    ],
  },
  {
    title: 'Community',
    items: [
      { label: 'Contributing', href: GITHUB_CONTRIBUTING_URL, external: true },
      { label: 'Discussions', href: GITHUB_DISCUSSIONS_URL, external: true },
      { label: 'Slack', href: SLACK_URL, external: true },
      { label: 'GitHub', href: GITHUB_URL, external: true },
    ],
  },
]

// Flat, in-order list of internal pages for prev/next navigation.
export const docsOrder: DocNavItem[] = docsNav
  .flatMap((g) => g.items)
  .filter((i) => !i.external)
