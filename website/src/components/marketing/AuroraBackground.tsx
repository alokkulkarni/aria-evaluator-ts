/**
 * Ambient animated background for the marketing surface: soft drifting colour
 * pools behind all content. Pure CSS animation (GPU transforms), and it sits
 * above the static ::before/::after canvas painted by .marketing-root.
 */
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-[1] overflow-hidden">
      <div className="aurora-blob animate-aurora-1 left-[-12%] top-[-14%] h-[42rem] w-[42rem] bg-cyan-500/25" />
      <div className="aurora-blob animate-aurora-2 right-[-16%] top-[6%] h-[46rem] w-[46rem] bg-blue-600/20" />
      <div className="aurora-blob animate-float-y bottom-[-24%] left-[18%] h-[40rem] w-[40rem] bg-indigo-600/[0.18]" />
      <div className="aurora-blob animate-aurora-1 bottom-[2%] right-[6%] h-[26rem] w-[26rem] bg-cyan-400/[0.14]" />
    </div>
  )
}
