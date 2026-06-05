import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Videos — ARIA Evaluator',
  description: 'Curated video resources on AI safety, LLM red-teaming, evaluation methodology, and production observability.',
}

export default function VideosLayout({ children }: { children: React.ReactNode }) {
  return children
}
