'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'

/** Cookie categories that users can toggle. 'necessary' is always on. */
export interface CookiePreferences {
  necessary: true
  functional: boolean
  analytics: boolean
  marketing: boolean
}

const STORAGE_KEY = 'aria_cookie_consent'
const CONSENT_VERSION = 1

interface StoredConsent {
  version: number
  preferences: CookiePreferences
  timestamp: string
}

const DEFAULT_PREFERENCES: CookiePreferences = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
}

function loadConsent(): StoredConsent | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredConsent
    if (parsed.version !== CONSENT_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

function saveConsent(preferences: CookiePreferences) {
  const consent: StoredConsent = {
    version: CONSENT_VERSION,
    preferences,
    timestamp: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent))
  // Also set a cookie so server-side can read consent state
  document.cookie = `cookie_consent=${encodeURIComponent(JSON.stringify(preferences))};path=/;max-age=${365 * 24 * 60 * 60};SameSite=Lax`
}

/** Hook to read cookie preferences anywhere in the app. */
export function useCookieConsent() {
  const [preferences, setPreferences] = useState<CookiePreferences | null>(null)

  useEffect(() => {
    const consent = loadConsent()
    setPreferences(consent?.preferences ?? null)
  }, [])

  return preferences
}

const CATEGORIES = [
  {
    key: 'necessary' as const,
    label: 'Strictly Necessary',
    description: 'Required for authentication, security, and core platform functionality. These cannot be disabled.',
    locked: true,
  },
  {
    key: 'functional' as const,
    label: 'Functional',
    description: 'Remember your preferences such as theme, region, and layout settings.',
    locked: false,
  },
  {
    key: 'analytics' as const,
    label: 'Analytics',
    description: 'Help us understand how visitors use our website so we can improve the experience.',
    locked: false,
  },
  {
    key: 'marketing' as const,
    label: 'Marketing',
    description: 'Used to measure advertising effectiveness. We do not sell your data.',
    locked: false,
  },
]

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [preferences, setPreferences] = useState<CookiePreferences>({ ...DEFAULT_PREFERENCES })

  useEffect(() => {
    // Show banner if no consent stored or consent version outdated
    const consent = loadConsent()
    if (!consent) {
      // Small delay so the page renders before the banner slides in
      const timer = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleAcceptAll = useCallback(() => {
    const all: CookiePreferences = { necessary: true, functional: true, analytics: true, marketing: true }
    saveConsent(all)
    setVisible(false)
  }, [])

  const handleRejectOptional = useCallback(() => {
    const minimal: CookiePreferences = { necessary: true, functional: false, analytics: false, marketing: false }
    saveConsent(minimal)
    setVisible(false)
  }, [])

  const handleSavePreferences = useCallback(() => {
    saveConsent(preferences)
    setVisible(false)
  }, [preferences])

  const toggleCategory = useCallback((key: keyof CookiePreferences) => {
    if (key === 'necessary') return
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  if (!visible) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998] bg-black/30 backdrop-blur-sm" />

      {/* Banner */}
      <div className="fixed inset-x-0 bottom-0 z-[9999] animate-slide-up">
        <div className="mx-auto max-w-3xl px-4 pb-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Header */}
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Cookie preferences</h2>
                  <p className="text-xs text-slate-500">Manage how we use cookies on this site</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-4">
              <p className="text-sm leading-6 text-slate-600">
                We use cookies to ensure the website functions correctly and to improve your experience. 
                You can choose which optional cookies to allow below. See our{' '}
                <Link href="/cookies" className="font-medium text-cyan-600 hover:text-cyan-700 underline">
                  Cookie Policy
                </Link>{' '}
                for full details.
              </p>

              {/* Expandable category details */}
              {showDetails && (
                <div className="mt-4 space-y-2">
                  {CATEGORIES.map((cat) => (
                    <div
                      key={cat.key}
                      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3"
                    >
                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat.key)}
                        disabled={cat.locked}
                        className={`relative mt-0.5 h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                          cat.locked || preferences[cat.key]
                            ? 'bg-cyan-500'
                            : 'bg-slate-300'
                        } ${cat.locked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                        aria-label={`Toggle ${cat.label} cookies`}
                      >
                        <span
                          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                            cat.locked || preferences[cat.key] ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{cat.label}</span>
                          {cat.locked && (
                            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              Always active
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs leading-5 text-slate-500">{cat.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-3">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition"
              >
                {showDetails ? 'Hide details' : 'Customise cookies'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRejectOptional}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Reject optional
                </button>

                {showDetails ? (
                  <button
                    type="button"
                    onClick={handleSavePreferences}
                    className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                  >
                    Save preferences
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAcceptAll}
                    className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                  >
                    Accept all
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
