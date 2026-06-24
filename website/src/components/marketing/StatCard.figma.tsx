import figma from '@figma/code-connect'

import { StatCard } from './ui'

/**
 * Code Connect: StatCard
 * Figma node — 🧩 Components › StatCard (22:14)
 *
 * Figma `Value` is text ("15", "10+"); the code prop is numeric (animated via
 * CountUp), so the example coerces with parseInt.
 */
figma.connect(
  StatCard,
  'https://www.figma.com/design/Hoz3eKZP5EQSxPeriDnImZ/ARIA-Evaluator-Brand-Design-System?node-id=22-14',
  {
    props: {
      value: figma.string('Value'),
      label: figma.string('Label'),
    },
    example: ({ value, label }) => <StatCard value={parseInt(value, 10)} label={label} />,
  },
)
