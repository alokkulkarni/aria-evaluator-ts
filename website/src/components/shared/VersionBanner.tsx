'use client'

import Link from 'next/link'
import { Rocket, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { GITHUB_REPO } from '@/lib/site'

// Dynamic version banner: reads the aria-evaluator repo's latest GitHub Release
// at runtime (client-side), so the site never needs a rebuild/redeploy to show
// a new release — publishing a GitHub Release is enough (see CLAUDE.md
// "Releases" section in the aria-evaluator-ts repo for the release step).
const RELEASES_LATEST_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

const CACHE_KEY = 'aria_version_banner_cache_v1'
const DISMISSED_KEY = 'aria_version_banner_dismissed_v1'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1h — keeps well under GitHub's unauthenticated rate limit

interface ReleaseInfo {
  tag: string
  url: string
  name: string | null
}

interface Cache {
  fetchedAt: number
  release: ReleaseInfo | null
}

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cache
    if (typeof parsed.fetchedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(release: ReleaseInfo | null) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), release } satisfies Cache))
  } catch {
    // localStorage unavailable (private browsing, quota) — degrade to fetch-every-load
  }
}

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const res = await fetch(RELEASES_LATEST_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) return null // 404 = no releases published yet; other errors = fail quiet
  const data = (await res.json()) as { tag_name?: string; html_url?: string; name?: string | null }
  if (!data.tag_name || !data.html_url) return null
  return { tag: data.tag_name, url: data.html_url, name: data.name ?? null }
}

/** Slim, dismissible bar announcing the latest aria-evaluator release. Renders nothing until data is ready, and nothing at all on fetch failure or once dismissed for that version. */
export function VersionBanner() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)

  useEffect(() => {
    setDismissed(readDismissed())

    const cached = readCache()
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setRelease(cached.release)
      return
    }

    let cancelled = false
    fetchLatestRelease()
      .then((info) => {
        if (cancelled) return
        setRelease(info)
        writeCache(info)
      })
      .catch(() => {
        // Network error / offline — leave the banner absent, never break the page.
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!release || dismissed === release.tag) return null

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, release.tag)
    } catch {
      // ignore — worst case the banner reappears next load
    }
    setDismissed(release.tag)
  }

  return (
    <div className="relative z-40 border-b border-white/10 bg-gradient-to-r from-cyan-500/10 via-white/5 to-cyan-500/10">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm text-slate-200 sm:px-6">
        <Rocket className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate">
          <span className="font-medium text-white">aria-evaluator {release.tag}</span> is now available.{' '}
          <Link
            href={release.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
          >
            See what&apos;s new
          </Link>
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss version announcement"
          className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
