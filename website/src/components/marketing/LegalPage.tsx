import Link from 'next/link'

import { PageHeader, Section } from '@/components/marketing/ui'

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
    <div>
      <PageHeader
        eyebrow={label}
        title={title}
        description={description}
        pills={[`Effective: ${effectiveDate}`, `Last updated: ${lastUpdated}`]}
      />

      <Section className="pt-10">
        <div className="grid gap-10 lg:grid-cols-[280px_1fr]">
          {/* Sidebar TOC */}
          <nav className="hidden lg:block">
            <div className="sticky top-24 space-y-1">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">On this page</p>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
                >
                  {s.title}
                </a>
              ))}
              <div className="mt-6 border-t border-white/10 pt-4">
                <p className="text-xs text-slate-500">Questions?</p>
                <a href={`mailto:${contactEmail}`} className="text-sm font-medium text-cyan-300 hover:text-cyan-200">
                  {contactEmail}
                </a>
              </div>
            </div>
          </nav>

          {/* Content body */}
          <article className="max-w-none">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="mb-10 scroll-mt-24">
                <h2 className="mb-4 font-display text-xl font-semibold text-white">{section.title}</h2>
                {renderContent(section.content)}
                {section.subsections?.map((sub, i) => (
                  <div key={i} className="ml-1 mt-4 border-l-2 border-white/10 pl-4">
                    <h3 className="mb-2 text-base font-semibold text-slate-100">{sub.title}</h3>
                    {renderContent(sub.content)}
                  </div>
                ))}
              </section>
            ))}

            {/* Contact */}
            <section className="glass mt-12 rounded-2xl p-6">
              <h2 className="font-display text-lg font-semibold text-white">Contact us</h2>
              <p className="mt-2 text-sm text-slate-400">
                If you have questions about this policy, please contact us at{' '}
                <a href={`mailto:${contactEmail}`} className="font-medium text-cyan-300 hover:text-cyan-200">
                  {contactEmail}
                </a>
                .
              </p>
              <div className="mt-4 flex gap-3">
                <Link href="/contact" className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110">
                  Contact us
                </Link>
                <Link href="/privacy" className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10">
                  Privacy policy
                </Link>
              </div>
            </section>
          </article>
        </div>
      </Section>
    </div>
  )
}

function renderContent(content: string | string[]) {
  if (typeof content === 'string') {
    return <p className="text-sm leading-7 text-slate-400">{content}</p>
  }
  return (
    <div className="space-y-3">
      {content.map((paragraph, i) => (
        <p key={i} className="text-sm leading-7 text-slate-400">
          {paragraph}
        </p>
      ))}
    </div>
  )
}
