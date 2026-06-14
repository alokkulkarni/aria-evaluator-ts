'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * An interactive "neural constellation" — a drifting 3D point cloud with
 * dynamic connection lines that parallaxes toward the cursor. Rendered with
 * raw three.js (no react-three-fiber) to keep the bundle lean.
 *
 * Performance & resilience:
 *  - DPR capped, render loop paused when offscreen or tab hidden
 *  - respects prefers-reduced-motion (renders a single static frame)
 *  - fully disposes GPU resources on unmount
 *  - degrades silently to the CSS fallback if WebGL is unavailable
 */
export default function NeuralField() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const COUNT = 120
    const RANGE = 105
    const LINK_DIST = 34

    let width = container.clientWidth || 1
    let height = container.clientHeight || 1

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    } catch {
      return // No WebGL — CSS fallback remains visible.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
    renderer.setSize(width, height)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(62, width / height, 1, 1000)
    camera.position.z = 185

    const group = new THREE.Group()
    scene.add(group)

    // ── Soft circular sprite for the points ──────────────────────────────────
    const sprite = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 64
      const ctx = c.getContext('2d')!
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.25, 'rgba(186,243,255,0.95)')
      g.addColorStop(1, 'rgba(34,211,238,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(32, 32, 32, 0, Math.PI * 2)
      ctx.fill()
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      return tex
    })()

    // ── Particles ────────────────────────────────────────────────────────────
    const positions = new Float32Array(COUNT * 3)
    const velocities = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * RANGE * 2
      positions[i * 3 + 1] = (Math.random() - 0.5) * RANGE * 2
      positions[i * 3 + 2] = (Math.random() - 0.5) * RANGE * 2
      velocities[i * 3] = (Math.random() - 0.5) * 0.12
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.12
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.12
    }

    const pointsGeo = new THREE.BufferGeometry()
    pointsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const pointsMat = new THREE.PointsMaterial({
      size: 4.2,
      map: sprite,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(0x67e8f9),
    })
    const points = new THREE.Points(pointsGeo, pointsMat)
    group.add(points)

    // ── Connection lines (rebuilt each frame within a preallocated buffer) ────
    const maxVerts = COUNT * COUNT
    const linePositions = new Float32Array(maxVerts * 3)
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(0x38bdf8),
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const lines = new THREE.LineSegments(lineGeo, lineMat)
    group.add(lines)

    function rebuildLines() {
      let v = 0
      for (let i = 0; i < COUNT; i++) {
        const ix = positions[i * 3]
        const iy = positions[i * 3 + 1]
        const iz = positions[i * 3 + 2]
        for (let j = i + 1; j < COUNT; j++) {
          const dx = ix - positions[j * 3]
          const dy = iy - positions[j * 3 + 1]
          const dz = iz - positions[j * 3 + 2]
          if (dx * dx + dy * dy + dz * dz < LINK_DIST * LINK_DIST) {
            linePositions[v++] = ix
            linePositions[v++] = iy
            linePositions[v++] = iz
            linePositions[v++] = positions[j * 3]
            linePositions[v++] = positions[j * 3 + 1]
            linePositions[v++] = positions[j * 3 + 2]
          }
        }
      }
      lineGeo.setDrawRange(0, v / 3)
      lineGeo.attributes.position.needsUpdate = true
    }

    // ── Pointer parallax ─────────────────────────────────────────────────────
    const target = { x: 0, y: 0 }
    const current = { x: 0, y: 0 }
    function onPointerMove(e: PointerEvent) {
      const rect = container!.getBoundingClientRect()
      target.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      target.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })

    function step(drift: boolean) {
      if (drift) {
        for (let i = 0; i < COUNT; i++) {
          for (let a = 0; a < 3; a++) {
            const idx = i * 3 + a
            positions[idx] += velocities[idx]
            if (positions[idx] > RANGE || positions[idx] < -RANGE) velocities[idx] *= -1
          }
        }
        pointsGeo.attributes.position.needsUpdate = true
      }
      rebuildLines()

      current.x += (target.x - current.x) * 0.05
      current.y += (target.y - current.y) * 0.05
      group.rotation.y += 0.0009 + current.x * 0.01
      group.rotation.x = current.y * 0.18
      renderer.render(scene, camera)
    }

    // ── Run loop (paused when offscreen / hidden) ─────────────────────────────
    let raf = 0
    let visible = true
    function loop() {
      if (visible && !document.hidden) step(true)
      raf = requestAnimationFrame(loop)
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
      },
      { threshold: 0 },
    )
    io.observe(container)

    function onResize() {
      width = container!.clientWidth || 1
      height = container!.clientHeight || 1
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', onResize)

    if (reduceMotion) {
      step(false) // single static frame
    } else {
      raf = requestAnimationFrame(loop)
    }

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      pointsGeo.dispose()
      pointsMat.dispose()
      lineGeo.dispose()
      lineMat.dispose()
      sprite.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />
}
