import figma from '@figma/code-connect'
import { ShieldCheck } from 'lucide-react'

import { FeatureCard } from './FeatureCard'

/**
 * Code Connect: FeatureCard
 * Figma node — 🧩 Components › FeatureCard (22:5)
 *
 * The Figma component exposes an `Icon` INSTANCE_SWAP backed by the Icon set
 * (shield-check, scale, plug, activity, users, gauge, …). In code the icon is a
 * `LucideIcon` the caller passes in, so the example shows a representative icon.
 */
figma.connect(
  FeatureCard,
  'https://www.figma.com/design/Hoz3eKZP5EQSxPeriDnImZ/ARIA-Evaluator-Brand-Design-System?node-id=22-5',
  {
    props: {
      title: figma.string('Title'),
      description: figma.string('Description'),
    },
    example: ({ title, description }) => (
      <FeatureCard icon={ShieldCheck} title={title} description={description} />
    ),
  },
)
