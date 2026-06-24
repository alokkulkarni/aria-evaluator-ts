import figma from '@figma/code-connect'

import { Navbar } from './Navbar'

/**
 * Code Connect: Navbar
 * Figma node — 🧩 Components › Navbar (23:4). Self-contained; no props.
 */
figma.connect(
  Navbar,
  'https://www.figma.com/design/Hoz3eKZP5EQSxPeriDnImZ/ARIA-Evaluator-Brand-Design-System?node-id=23-4',
  {
    example: () => <Navbar />,
  },
)
