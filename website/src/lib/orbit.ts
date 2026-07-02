export interface OrbitPoint {
  x: number
  y: number
  z: number
  /** Position around the ring, in radians. */
  angle: number
}

/**
 * Evenly spaces `count` points around a circle of `radius` on the XZ plane,
 * starting at `phase` radians. Kept as pure math so the 3D scene layout is
 * unit-testable without WebGL.
 */
export function orbitPositions(count: number, radius: number, phase = 0): OrbitPoint[] {
  if (count <= 0 || radius < 0) return []
  return Array.from({ length: count }, (_, i) => {
    const angle = phase + (i * Math.PI * 2) / count
    return {
      x: Math.cos(angle) * radius,
      y: 0,
      z: Math.sin(angle) * radius,
      angle,
    }
  })
}
