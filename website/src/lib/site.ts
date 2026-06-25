// Central site/open-source constants. Single source of truth for the GitHub repo
// and community links so CTAs, the navbar, and the footer never hardcode the URL.

export const GITHUB_REPO = 'alokkulkarni/aria-evaluator-ts'
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`
export const GITHUB_DISCUSSIONS_URL = `${GITHUB_URL}/discussions`
export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`
export const GITHUB_CONTRIBUTING_URL = `${GITHUB_URL}/blob/main/CONTRIBUTING.md`

export const SLACK_URL = 'https://ariaeval.slack.com'

export const DOCS_URL = '/docs'

export const LICENSE_NAME = 'Apache-2.0'
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`

// Default primary/secondary CTAs for the open-source site. Used as the defaults
// across CtaBand / PageHeader so individual pages don't repeat the repo URL.
export const PRIMARY_CTA = { href: GITHUB_URL, label: 'View on GitHub' }
export const SECONDARY_CTA = { href: DOCS_URL, label: 'Read the docs' }
