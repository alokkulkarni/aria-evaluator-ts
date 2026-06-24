import figma from '@figma/code-connect'

/**
 * Code Connect for the className-based primitives. These have no dedicated React
 * component — they are Tailwind utility classes defined in `src/app/globals.css`
 * (.btn / .btn-primary, .badge / .badge-*, etc.). Each mapping emits the markup
 * pattern engineers actually write, so Dev Mode shows the right snippet.
 */
const FILE =
  'https://www.figma.com/design/Hoz3eKZP5EQSxPeriDnImZ/ARIA-Evaluator-Brand-Design-System'

/** Button — Figma set 18:28 (Style × Size). globals.css: .btn / .btn-primary … */
figma.connect(`${FILE}?node-id=18-28`, {
  props: {
    label: figma.string('Label'),
    style: figma.enum('Style', {
      Primary: 'btn-primary',
      Secondary: 'btn-secondary',
      Ghost: 'btn-ghost',
      Danger: 'btn-danger',
    }),
  },
  example: ({ label, style }) => (
    <button type="button" className={`btn ${style}`}>
      {label}
    </button>
  ),
})

/** Badge — Figma set 20:19 (Status). globals.css: .badge / .badge-pass … */
figma.connect(`${FILE}?node-id=20-19`, {
  props: {
    status: figma.enum('Status', {
      Pass: 'badge-pass',
      Fail: 'badge-fail',
      Running: 'badge-info',
      Info: 'badge-info',
      Neutral: 'badge',
    }),
  },
  example: ({ status }) => <span className={`badge ${status}`}>Passed</span>,
})

/** Pill / trust chip — Figma 20:22. */
figma.connect(`${FILE}?node-id=20-22`, {
  props: {
    label: figma.string('Label'),
  },
  example: ({ label }) => (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
      {label}
    </span>
  ),
})

/** Input — Figma set 21:17 (State). Native input styled by globals.css base layer. */
figma.connect(`${FILE}?node-id=21-17`, {
  props: {
    label: figma.string('Label'),
    value: figma.string('Value'),
  },
  example: ({ label, value }) => (
    <label className="block space-y-2">
      <span className="text-sm text-slate-300">{label}</span>
      <input
        type="email"
        defaultValue={value}
        placeholder="you@company.com"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400/60"
      />
    </label>
  ),
})
