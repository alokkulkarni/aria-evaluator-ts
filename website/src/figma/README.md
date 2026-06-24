# Figma Code Connect

Maps the Figma design-system components in **[ARIA Evaluator — Brand & Design System](https://www.figma.com/design/Hoz3eKZP5EQSxPeriDnImZ)** to their React source, so Figma Dev Mode shows the real component + code snippet instead of generic CSS.

## Mappings

| Figma node | React source | Type |
| --- | --- | --- |
| FeatureCard `22:5` | `@/components/marketing/FeatureCard` | component |
| StatCard `22:14` | `@/components/marketing/ui` → `StatCard` | component |
| PricingCard `24:68` | `@/components/marketing/PricingTable` | component |
| Navbar `23:4` | `@/components/marketing/Navbar` | component |
| Footer `25:14` | `@/components/marketing/Footer` | component |
| Logo `17:18` | `@/components/shared/AriaLogo` | component |
| Button `18:28` | `.btn` / `.btn-primary` … (globals.css) | className snippet |
| Badge `20:19` | `.badge` / `.badge-*` (globals.css) | className snippet |
| Pill `20:22` | trust-chip markup | className snippet |
| Input `21:17` | native `<input>` + globals.css base | className snippet |

Mapping files are co-located next to each component as `*.figma.tsx`; the
className-based primitives live in `src/figma/Primitives.figma.tsx`.

## Prerequisites

> ⚠️ **Publishing requires a Figma Organization or Enterprise plan with a Dev/Full
> seat, and the library must be published.** This team is currently on **Pro**, so the
> mappings below are authored and committed but **not yet published**. Once the plan is
> upgraded and the library is published (Figma → Assets → Publish), run the publish step.

## Setup & publish

```bash
cd website
npm install                       # installs @figma/code-connect (already in devDependencies)
export FIGMA_ACCESS_TOKEN=<token> # a Figma token with Code Connect write scope
npm run figma:publish             # figma connect publish
```

`figma.config.json` (in `website/`) defines the React parser, the `src/**/*.figma.tsx`
include glob, and `importPaths` so published snippets use the `@/` alias.

These files are excluded from `next build` / `next lint` (see `tsconfig.json` `exclude`
and `.eslintignore`) so they never affect the app build.
