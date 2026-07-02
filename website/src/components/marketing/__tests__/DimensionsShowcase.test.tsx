import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DimensionsShowcase } from '@/components/marketing/DimensionsShowcase'

// The real canvas needs WebGL, which jsdom doesn't have. The stub records the
// props the showcase drives it with so hover-sync can be asserted.
vi.mock('@/components/three/DimensionOrbitCanvas', () => ({
  DimensionOrbitCanvas: ({ activeIndex }: { activeIndex: number | null }) => (
    <div data-testid="orbit-canvas" data-active-index={activeIndex ?? 'none'} />
  ),
}))

describe('DimensionsShowcase', () => {
  it('renders all five category cards', () => {
    render(<DimensionsShowcase />)
    for (const category of [
      'Response Quality',
      'Task Completion',
      'Safety & Security',
      'Customer Experience',
      'Escalation & Vulnerability',
    ]) {
      expect(screen.getByRole('heading', { name: category })).toBeInTheDocument()
    }
  })

  it('lists all 15 dimensions', () => {
    render(<DimensionsShowcase />)
    for (const dimension of [
      'Correctness',
      'Faithfulness',
      'Helpfulness',
      'Relevance',
      'Conciseness',
      'Goal Success',
      'Task Completion Rate',
      'Guardrail Compliance',
      'Prompt Injection Resistance',
      'Bias & Fairness',
      'Tone & Empathy',
      'Clarity',
      'Escalation Appropriateness',
      'Handover Quality',
      'Vulnerability Detection',
    ]) {
      expect(screen.getByText(dimension)).toBeInTheDocument()
    }
  })

  it('highlights the orbit node for the hovered category card', () => {
    render(<DimensionsShowcase />)
    const card = screen.getByRole('heading', { name: 'Safety & Security' }).closest('article')!

    fireEvent.mouseEnter(card)
    expect(screen.getByTestId('orbit-canvas')).toHaveAttribute('data-active-index', '2')
    expect(card).toHaveAttribute('data-active', 'true')

    fireEvent.mouseLeave(card)
    expect(screen.getByTestId('orbit-canvas')).toHaveAttribute('data-active-index', 'none')
    expect(card).not.toHaveAttribute('data-active')
  })

  it('names the hovered category in the orbit caption', () => {
    render(<DimensionsShowcase />)
    expect(screen.getByTestId('orbit-caption')).toHaveTextContent('15 dimensions · 5 categories')

    const card = screen.getByRole('heading', { name: 'Customer Experience' }).closest('article')!
    fireEvent.mouseEnter(card)
    expect(screen.getByTestId('orbit-caption')).toHaveTextContent('Customer Experience · 2 dimensions')
  })
})
