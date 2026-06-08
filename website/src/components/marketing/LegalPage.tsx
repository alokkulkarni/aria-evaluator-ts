import Link from 'next/link'

interface LegalSection {
  id: string
  title: string
  content: string | string[]
  subsections?: Array<{ title: string; content: string | string[] }>
}

interface LegalPageProps {
  label: string
  title: string
  effectiveDate: string
  lastUpdated: string
  description: string
  sections: LegalSection[]
  contactEmail?: string
}

export function LegalPage({
  label,
  title,
  effectiveDate,
  lastUpdated,
  description,
  sections,
  contactEmail = 'legal@ariaeval.io',
}: LegalPageProps) {
  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">{label}</p>
          <div className="max-w-3xl space-y-3">
            <h1 className="page-hero-title">{title}</h1>
            <p className="page-hero-sub max-w-2xl">{description}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="page-hero-pill">Effective: {effectiveDate}</span>
            <span className="page-hero-pill">Last updated: {lastUpdated}</span>
          </div>
        </div>
      </section>

      {/* Table of contents + body */}
      <div className="mt-10 grid gap-10 lg:grid-cols-[280px_1fr]">
        {/* Sidebar TOC */}
        <nav className="hidden lg:block">
          <div className="sticky top-24 space-y-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">On this page</p>
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block rounded-lg px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                {s.title}
              </a>
            ))}
            <div className="mt-6 border-t border-slate-200 pt-4">
              <p className="text-xs text-slate-500">Questions?</p>
              <a href={`mailto:${contactEmail}`} className="text-sm font-medium text-cyan-600 hover:text-cyan-700">
                {contactEmail}
              </a>
            </div>
          </div>
        </nav>

        {/* Content body */}
        <article className="prose prose-slate max-w-none">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="mb-10 scroll-mt-24">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">{section.title}</h2>
              {renderContent(section.content)}
              {section.subsections?.map((sub, i) => (
                <div key={i} className="ml-1 mt-4 border-l-2 border-slate-200 pl-4">
                  <h3 className="mb-2 text-base font-semibold text-slate-800">{sub.title}</h3>
                  {renderContent(sub.content)}
                </div>
              ))}
            </section>
          ))}

          {/* Contact */}
          <section className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <h2 className="text-lg font-semibold text-slate-900">Contact us</h2>
            <p className="mt-2 text-sm text-slate-600">
              If you have questions about this policy, please contact us at{' '}
              <a href={`mailto:${contactEmail}`} className="font-medium text-cyan-600 hover:text-cyan-700">
                {contactEmail}
              </a>
              .
            </p>
            <div className="mt-4 flex gap-3">
              <Link href="/contact" className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
                Contact us
              </Link>
              <Link href="/privacy" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Privacy policy
              </Link>
            </div>
          </section>
        </article>
      </div>
    </div>
  )
}

function renderContent(content: string | string[]) {
  if (typeof content === 'string') {
    return <p className="text-sm leading-7 text-slate-600">{content}</p>
  }
  return (
    <div className="space-y-3">
      {content.map((paragraph, i) => (
        <p key={i} className="text-sm leading-7 text-slate-600">
          {paragraph}
        </p>
      ))}
    </div>
  )
}
