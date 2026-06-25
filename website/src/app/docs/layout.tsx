import { DocsSidebar } from '@/components/docs/DocsSidebar'
import { DocsPager } from '@/components/docs/DocsPager'

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-8xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
      {/* Mobile menu */}
      <details className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] lg:hidden">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-200">
          Documentation menu
        </summary>
        <div className="border-t border-white/10 px-4 py-4">
          <DocsSidebar />
        </div>
      </details>

      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-10 pr-2">
            <DocsSidebar />
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0">
          <article className="max-w-3xl">
            {children}
            <DocsPager />
          </article>
        </div>
      </div>
    </div>
  )
}
