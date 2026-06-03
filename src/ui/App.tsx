import React, { useCallback, useEffect, useState } from 'react';
import { Dashboard } from './pages/Dashboard.js';
import { ScenariosPage } from './pages/ScenariosPage.js';
import { RunsPage } from './pages/RunsPage.js';
import { ReviewQueuePage } from './pages/ReviewQueuePage.js';
import { TranscriptsPage } from './pages/TranscriptsPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { AuthPage } from './pages/AuthPage.js';
import { AnalysisPage } from './pages/AnalysisPage.js';
import { SchedulesPage } from './pages/SchedulesPage.js';
import { apiFetch } from './lib/api.js';

type Page = 'dashboard' | 'scenarios' | 'runs' | 'review-queue' | 'transcripts' | 'reports' | 'analysis' | 'schedules' | 'settings';

interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
}

type TourPlacement = 'top' | 'bottom';

interface TourStep {
  target: string;
  title: string;
  description: string;
  placement: TourPlacement;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'nav-dashboard',
    title: 'Dashboard',
    description: 'This brings you back to the executive overview with live health, recent activity, and quick actions.',
    placement: 'bottom',
  },
  {
    target: 'nav-scenarios',
    title: 'Scenarios',
    description: 'Open the scenario library to create, edit, and organize test journeys and adversarial prompts.',
    placement: 'bottom',
  },
  {
    target: 'nav-runs',
    title: 'Runs',
    description: 'Launch new evaluations and inspect the latest execution history in one place.',
    placement: 'bottom',
  },
  {
    target: 'nav-review-queue',
    title: 'Review queue',
    description: 'Track runs that need human review, calibration, or an override before they are finalized.',
    placement: 'bottom',
  },
  {
    target: 'nav-analysis',
    title: 'Analysis',
    description: 'Explore trends, failures, and comparative insights across the evaluation estate.',
    placement: 'bottom',
  },
  {
    target: 'nav-schedules',
    title: 'Schedules',
    description: 'Automate recurring runs so teams can keep a constant quality signal without manual effort.',
    placement: 'bottom',
  },
  {
    target: 'nav-transcripts',
    title: 'Transcripts',
    description: 'Read full conversation transcripts to understand exactly how a run unfolded.',
    placement: 'bottom',
  },
  {
    target: 'nav-reports',
    title: 'Reports',
    description: 'Open exported evaluation reports and share polished results with stakeholders.',
    placement: 'bottom',
  },
  {
    target: 'nav-settings',
    title: 'Settings',
    description: 'Configure providers, credentials, and defaults that power the evaluator.',
    placement: 'bottom',
  },
  {
    target: 'dashboard-summary',
    title: 'Executive snapshot',
    description: 'These top cards summarize score, run volume, and pass-fail health at a glance.',
    placement: 'top',
  },
  {
    target: 'dashboard-observability',
    title: 'Observability',
    description: 'Use this section to review latency, failure rate, provider breakdowns, and recent failure patterns.',
    placement: 'top',
  },
  {
    target: 'dashboard-recent-runs',
    title: 'Recent runs',
    description: 'This table highlights the latest evaluations, their status, and the scores they produced.',
    placement: 'top',
  },
  {
    target: 'dashboard-actions',
    title: 'Quick actions',
    description: 'These shortcuts jump straight into scenarios, runs, transcripts, or reports without extra navigation.',
    placement: 'top',
  },
];

const TOUR_STORAGE_PREFIX = 'aria-evaluator:dashboard-tour';

function LogoIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M19 2L35 11V27L19 36L3 27V11L19 2Z" fill="#1E40AF" stroke="#93C5FD" strokeWidth="1.5"/>
      <circle cx="19" cy="12.5" r="2.8" fill="white"/>
      <circle cx="12" cy="24.5" r="2.2" fill="#BFDBFE"/>
      <circle cx="26" cy="24.5" r="2.2" fill="#BFDBFE"/>
      <line x1="19" y1="12.5" x2="12" y2="24.5" stroke="#93C5FD" strokeWidth="1.4"/>
      <line x1="19" y1="12.5" x2="26" y2="24.5" stroke="#93C5FD" strokeWidth="1.4"/>
      <line x1="12" y1="24.5" x2="26" y2="24.5" stroke="#93C5FD" strokeWidth="1.4"/>
      <path d="M16.8 12.5L18.3 14.2L21.2 10.8" stroke="#1E3A8A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function getInitialPage(): Page {
  if (typeof window === 'undefined') return 'dashboard';
  const page = new URLSearchParams(window.location.search).get('page');
  if (page === 'dashboard' || page === 'scenarios' || page === 'runs' || page === 'review-queue' || page === 'transcripts' || page === 'reports' || page === 'analysis' || page === 'schedules' || page === 'settings') {
    return page;
  }
  return 'dashboard';
}

function tourStorageKey(userId: string): string {
  return `${TOUR_STORAGE_PREFIX}:${userId}`;
}

function isTourDismissed(userId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(tourStorageKey(userId)) === 'done';
  } catch {
    return false;
  }
}

function dismissTour(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(tourStorageKey(userId), 'done');
  } catch {
    // Ignore storage failures; the tour can still be dismissed for this session.
  }
}

function getTourBubbleStyle(rect: DOMRect, placement: TourPlacement): React.CSSProperties {
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
  const width = Math.max(280, Math.min(392, viewportWidth - 32));
  const height = 220;
  const topCandidate = placement === 'top' ? rect.top - height - 18 : rect.bottom + 18;
  const top = Math.max(16, Math.min(topCandidate, viewportHeight - height - 16));
  const leftCandidate = rect.left + (rect.width / 2) - (width / 2);
  const left = Math.max(16, Math.min(leftCandidate, viewportWidth - width - 16));
  return { top, left, width };
}

function getSpotlightMask(rect: DOMRect): React.CSSProperties {
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
  const centerX = Math.max(0, Math.min(rect.left + rect.width / 2, viewportWidth));
  const centerY = Math.max(0, Math.min(rect.top + rect.height / 2, viewportHeight));
  const radiusX = Math.max(110, rect.width / 2 + 24);
  const radiusY = Math.max(76, rect.height / 2 + 20);
  const maskImage = `radial-gradient(ellipse ${radiusX}px ${radiusY}px at ${centerX}px ${centerY}px, transparent 0%, transparent 62%, black 74%)`;
  return {
    WebkitMaskImage: maskImage,
    maskImage,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
  };
}

function GuidedTourOverlay({
  open,
  stepIndex,
  onPrev,
  onNext,
  onClose,
}: {
  open: boolean;
  stepIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const step = TOUR_STEPS[stepIndex];
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open || !step) return;

    const update = () => {
      const target = document.querySelector(`[data-tour-target="${step.target}"]`) as HTMLElement | null;
      setTargetRect(target?.getBoundingClientRect() ?? null);
    };

    update();
    const raf = window.requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onNext();
      if (event.key === 'ArrowLeft') onPrev();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, onNext, onPrev]);

  if (!open || !step) return null;

  const bubbleStyle = targetRect ? getTourBubbleStyle(targetRect, step.placement) : {
    top: 96,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 360,
  };
  const spotlightStyle = targetRect ? {
    top: Math.max(0, targetRect.top - 12),
    left: Math.max(0, targetRect.left - 12),
    width: targetRect.width + 24,
    height: targetRect.height + 24,
  } : null;

  const canGoPrev = stepIndex > 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const arrowClass = step.placement === 'top'
    ? 'bottom-[-8px] border-t-slate-950/95 border-x-transparent border-x-[10px] border-t-[10px]'
    : 'top-[-8px] border-b-slate-950/95 border-x-transparent border-x-[10px] border-b-[10px]';

  return (
    <div className="fixed inset-0 z-[80] pointer-events-auto">
      <div
        className="absolute inset-0 bg-slate-950/72"
        style={targetRect ? getSpotlightMask(targetRect) : undefined}
      />
      {spotlightStyle && (
        <div
          className="absolute rounded-[1.15rem] border border-cyan-300/95 shadow-[0_0_0_6px_rgba(34,211,238,0.18),0_0_0_1px_rgba(255,255,255,0.12)_inset]"
          style={spotlightStyle}
        />
      )}

      <div className="absolute inset-0">
        <div
          className="absolute rounded-3xl border border-white/10 bg-slate-950/95 p-5 text-white shadow-[0_28px_80px_rgba(15,23,42,0.45)]"
          style={bubbleStyle}
          role="dialog"
          aria-modal="true"
          aria-label="Dashboard guidance"
        >
          <div className={`absolute left-9 h-0 w-0 border-solid ${arrowClass}`} />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300">Guided help</p>
              <h3 className="mt-2 text-lg font-semibold text-white">{step.title}</h3>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
              {stepIndex + 1}/{TOUR_STEPS.length}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{step.description}</p>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onPrev}
              disabled={!canGoPrev}
              className="rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onNext}
                className="rounded-full bg-cyan-400 px-3.5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                {isLast ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'scenarios', label: 'Scenarios', icon: '📋' },
  { id: 'runs', label: 'Runs', icon: '▶️' },
  { id: 'review-queue', label: 'Review Queue', icon: '🔍' },
  { id: 'analysis', label: 'Analysis', icon: '🔬' },
  { id: 'schedules', label: 'Schedules', icon: '⏱' },
  { id: 'transcripts', label: 'Transcripts', icon: '💬' },
  { id: 'reports', label: 'Reports', icon: '📊' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function App() {
  const [page, setPage] = useState<Page>(getInitialPage);
  const [openRunModal, setOpenRunModal] = useState(false);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const initialTranscriptFile = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('file') ?? undefined)
    : undefined;

  function handleNewRun(): void {
    setPage('runs');
    setOpenRunModal(true);
  }

  const handleAuthenticated = useCallback((nextUser: AuthenticatedUser) => {
    setUser(nextUser);
  }, []);

  async function handleLogout(): Promise<void> {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout errors and reset local auth state
    }
    setTourOpen(false);
    setTourStepIndex(0);
    setUser(null);
    setPage('dashboard');
  }

  useEffect(() => {
    if (!user) {
      setTourOpen(false);
      setTourStepIndex(0);
      return;
    }

    if (page !== 'dashboard') {
      setTourOpen(false);
      return;
    }

    if (isTourDismissed(user.id)) {
      setTourOpen(false);
      return;
    }

    setTourStepIndex(0);
    setTourOpen(true);
  }, [page, user]);

  const closeTour = useCallback(() => {
    if (user) dismissTour(user.id);
    setTourOpen(false);
    setTourStepIndex(0);
  }, [user]);

  const nextTourStep = useCallback(() => {
    if (tourStepIndex >= TOUR_STEPS.length - 1) {
      closeTour();
      return;
    }
    setTourStepIndex((value) => Math.min(value + 1, TOUR_STEPS.length - 1));
  }, [closeTour, tourStepIndex]);

  const prevTourStep = useCallback(() => {
    setTourStepIndex((value) => Math.max(value - 1, 0));
  }, []);

  if (!user) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-8xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-shrink-0 items-center gap-3">
            <span className="flex-shrink-0"><LogoIcon /></span>
            <span className="text-sm font-semibold tracking-wide whitespace-nowrap text-white">ARIA Evaluator</span>
          </div>

          <nav
            className="flex flex-1 items-center justify-center gap-1 overflow-x-auto px-2 scrollbar-none"
            aria-label="Primary"
          >
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setPage(n.id)}
                data-tour-target={`nav-${n.id}`}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  page === n.id
                    ? 'bg-white/12 text-white ring-1 ring-white/15'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="text-sm leading-none">{n.icon}</span>
                {n.label}
              </button>
            ))}
          </nav>

          <div className="flex flex-shrink-0 items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/25 text-xs font-semibold uppercase text-white ring-1 ring-white/10 select-none"
                title={`${user.username} (${user.role})`}
              >
                {user.username.charAt(0)}
              </span>
              <span className="hidden max-w-[112px] truncate text-xs text-slate-300 lg:block" title={user.username}>
                {user.username}
              </span>
            </div>
            <button
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
              onClick={() => { void handleLogout(); }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-8xl mx-auto w-full px-4 py-8 sm:px-6 lg:px-8">
        {page === 'dashboard' && <Dashboard onNavigate={setPage} onNewRun={handleNewRun} />}
        {page === 'scenarios' && <ScenariosPage />}
        {page === 'runs' && <RunsPage autoOpenModal={openRunModal} onModalAutoOpened={() => setOpenRunModal(false)} />}
        {page === 'review-queue' && <ReviewQueuePage />}
        {page === 'analysis' && <AnalysisPage />}
        {page === 'schedules' && <SchedulesPage />}
        {page === 'transcripts' && <TranscriptsPage initialFilename={initialTranscriptFile} />}
        {page === 'reports' && <ReportsPage />}
        {page === 'settings' && <SettingsPage />}
      </main>

      <GuidedTourOverlay
        open={tourOpen && page === 'dashboard'}
        stepIndex={tourStepIndex}
        onPrev={prevTourStep}
        onNext={nextTourStep}
        onClose={closeTour}
      />
    </div>
  );
}
