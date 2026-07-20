import '@testing-library/jest-dom/vitest'

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VersionBanner } from '@/components/shared/VersionBanner'

const RELEASE_BODY = {
  tag_name: 'v1.1.0',
  html_url: 'https://github.com/alokkulkarni/aria-evaluator-ts/releases/tag/v1.1.0',
  name: 'v1.1.0 — Notifications, budgets, trends',
}

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  )
}

// Node's experimental built-in `localStorage` shadows jsdom's implementation
// in this environment (requires `--localstorage-file`, which vitest doesn't
// set) — stub a minimal in-memory Storage instead of depending on the global.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('VersionBanner', () => {
  it('renders nothing until the release fetch resolves', () => {
    mockFetchOnce(200, RELEASE_BODY)
    const { container } = render(<VersionBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the latest release tag and a link to it once fetched', async () => {
    mockFetchOnce(200, RELEASE_BODY)
    render(<VersionBanner />)
    expect(await screen.findByText(/aria-evaluator v1\.1\.0/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /see what's new/i })
    expect(link).toHaveAttribute('href', RELEASE_BODY.html_url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('renders nothing when no releases exist yet (404)', async () => {
    mockFetchOnce(404, { message: 'Not Found' })
    const { container } = render(<VersionBanner />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(container).toBeEmptyDOMElement()
  })

  it('fails silently on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { container } = render(<VersionBanner />)
    await new Promise((r) => setTimeout(r, 0))
    expect(container).toBeEmptyDOMElement()
  })

  it('serves from cache within the TTL instead of re-fetching', async () => {
    localStorage.setItem(
      'aria_version_banner_cache_v1',
      JSON.stringify({
        fetchedAt: Date.now(),
        release: { tag: 'v1.0.5', url: 'https://example.com/v1.0.5', name: null },
      }),
    )
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<VersionBanner />)
    expect(await screen.findByText(/aria-evaluator v1\.0\.5/)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('re-fetches once the cache TTL has expired', async () => {
    localStorage.setItem(
      'aria_version_banner_cache_v1',
      JSON.stringify({
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000, // 2h old, TTL is 1h
        release: { tag: 'v1.0.5', url: 'https://example.com/v1.0.5', name: null },
      }),
    )
    mockFetchOnce(200, RELEASE_BODY)
    render(<VersionBanner />)
    expect(await screen.findByText(/aria-evaluator v1\.1\.0/)).toBeInTheDocument()
  })

  it('dismissing hides the banner, scoped to that release tag', async () => {
    mockFetchOnce(200, RELEASE_BODY)
    render(<VersionBanner />)
    await screen.findByText(/aria-evaluator v1\.1\.0/)
    fireEvent.click(screen.getByRole('button', { name: /dismiss version announcement/i }))
    expect(screen.queryByText(/aria-evaluator v1\.1\.0/)).not.toBeInTheDocument()
    expect(localStorage.getItem('aria_version_banner_dismissed_v1')).toBe('v1.1.0')
  })

  it('shows the banner again on remount for a newer tag even if a prior tag was dismissed', async () => {
    localStorage.setItem('aria_version_banner_dismissed_v1', 'v1.0.9')
    mockFetchOnce(200, RELEASE_BODY)
    render(<VersionBanner />)
    expect(await screen.findByText(/aria-evaluator v1\.1\.0/)).toBeInTheDocument()
  })
})
