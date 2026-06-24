import figma from '@figma/code-connect'

import { AriaLogo } from './AriaLogo'

/**
 * Code Connect: AriaLogo
 * Figma node — 🧩 Components › Logo set (17:18), variants Type=Mark|Lockup.
 *
 * <AriaLogo/> renders the Mark; the Lockup = <AriaLogo/> + the "ARIA Evaluator"
 * wordmark (see Navbar/Footer for the lockup composition).
 */
figma.connect(
  AriaLogo,
  'https://www.figma.com/design/Hoz3eKZP5EQSxPeriDnImZ/ARIA-Evaluator-Brand-Design-System?node-id=17-18',
  {
    example: () => <AriaLogo className="h-8 w-8" />,
  },
)
