import { describe, expect, it } from 'vitest'

import { orbitPositions } from '@/lib/orbit'

describe('orbitPositions', () => {
  it('returns one point per requested node', () => {
    expect(orbitPositions(5, 2.5)).toHaveLength(5)
  })

  it('places every point on the ring radius in the XZ plane', () => {
    for (const point of orbitPositions(5, 2.5)) {
      expect(Math.hypot(point.x, point.z)).toBeCloseTo(2.5, 10)
      expect(point.y).toBe(0)
    }
  })

  it('spaces points evenly around the circle', () => {
    const points = orbitPositions(4, 1)
    for (let i = 1; i < points.length; i++) {
      expect(points[i].angle - points[i - 1].angle).toBeCloseTo(Math.PI / 2, 10)
    }
  })

  it('starts the first point at the phase offset', () => {
    const [first] = orbitPositions(3, 1, Math.PI / 6)
    expect(first.angle).toBeCloseTo(Math.PI / 6, 10)
    expect(first.x).toBeCloseTo(Math.cos(Math.PI / 6), 10)
    expect(first.z).toBeCloseTo(Math.sin(Math.PI / 6), 10)
  })

  it('returns no points for empty or degenerate rings', () => {
    expect(orbitPositions(0, 2)).toEqual([])
    expect(orbitPositions(-1, 2)).toEqual([])
    expect(orbitPositions(3, -1)).toEqual([])
  })
})
