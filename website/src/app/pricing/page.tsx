import { PricingTable } from '@/components/marketing/PricingTable'

export default function PricingPage() {
  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">Pricing</p>
          <div className="max-w-3xl space-y-3">
            <h1 className="page-hero-title">Transparent pricing for every stage of AI evaluation</h1>
            <p className="page-hero-sub">
              Start with a lightweight sandbox, expand into regional team workspaces, or move to dedicated enterprise infrastructure with tailored controls.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="page-hero-pill">Free tier available</span>
            <span className="page-hero-pill">Annual savings</span>
            <span className="page-hero-pill">Dedicated enterprise options</span>
          </div>
        </div>
      </section>

      <div className="mt-10">
        <PricingTable />
      </div>
    </div>
  )
}
