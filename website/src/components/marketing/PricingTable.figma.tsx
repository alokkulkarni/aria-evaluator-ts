import figma from '@figma/code-connect'

import { PricingTable } from './PricingTable'

/**
 * Code Connect: PricingTable
 * Figma node — 🧩 Components › PricingCard set (24:68), variants Featured=Default|Popular.
 *
 * In code the full pricing grid is one self-contained <PricingTable/> driven by
 * the PLANS source of truth, so the Figma card maps to the table.
 */
figma.connect(
  PricingTable,
  'https://www.figma.com/design/Hoz3eKZP5EQSxPeriDnImZ/ARIA-Evaluator-Brand-Design-System?node-id=24-68',
  {
    example: () => <PricingTable />,
  },
)
