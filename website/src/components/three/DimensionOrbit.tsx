'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { orbitPositions } from '@/lib/orbit'

export interface OrbitNode {
  label: string
  /** Hex color for the node core and halo, e.g. '#22d3ee'. */
  color: string
}

export interface DimensionOrbitProps {
  nodes: OrbitNode[]
  activeIndex: number | null
  onActiveChange?: (index: number | null) => void
}

const ORBIT_RADIUS = 2.55
const ORBIT_PHASE = -Math.PI / 2

/** Soft radial-gradient sprite texture, used for node halos and the core glow. */
function makeGlowTexture(color: string) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  const c = new THREE.Color(color)
  const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`
  gradient.addColorStop(0, `rgba(${rgb},0.85)`)
  gradient.addColorStop(0.4, `rgba(${rgb},0.25)`)
  gradient.addColorStop(1, `rgba(${rgb},0)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** The LLM judge at the centre: a wireframe shell around a glowing core. */
function JudgeCore() {
  const shellRef = useRef<THREE.Mesh>(null)
  const glowTexture = useMemo(() => makeGlowTexture('#22d3ee'), [])
  useEffect(() => () => glowTexture.dispose(), [glowTexture])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (shellRef.current) {
      shellRef.current.rotation.y = t * 0.18
      shellRef.current.rotation.x = Math.sin(t * 0.3) * 0.25
    }
  })

  return (
    <group>
      <mesh ref={shellRef}>
        <icosahedronGeometry args={[1.02, 1]} />
        <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.32} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.9} roughness={0.35} />
      </mesh>
      <sprite scale={[2.9, 2.9, 1]}>
        <spriteMaterial map={glowTexture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <pointLight intensity={14} distance={9} color="#67e8f9" />
    </group>
  )
}

/** One orbiting category node: colored sphere + halo, bobbing gently. */
function CategoryNode({
  node,
  position,
  index,
  active,
  onActiveChange,
}: {
  node: OrbitNode
  position: { x: number; y: number; z: number }
  index: number
  active: boolean
  onActiveChange?: (index: number | null) => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const haloRef = useRef<THREE.SpriteMaterial>(null)
  const haloTexture = useMemo(() => makeGlowTexture(node.color), [node.color])
  useEffect(() => () => haloTexture.dispose(), [haloTexture])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const group = groupRef.current
    if (!group) return
    group.position.y = Math.sin(t * 1.3 + index * 2.4) * 0.12
    const targetScale = active ? 1.5 : 1
    group.scale.setScalar(THREE.MathUtils.damp(group.scale.x, targetScale, 8, delta))
    if (haloRef.current) {
      haloRef.current.opacity = THREE.MathUtils.damp(haloRef.current.opacity, active ? 1 : 0.55, 8, delta)
    }
  })

  return (
    <group position={[position.x, position.y, position.z]}>
      <group ref={groupRef}>
        <mesh
          onPointerOver={(e) => {
            e.stopPropagation()
            onActiveChange?.(index)
          }}
          onPointerOut={() => onActiveChange?.(null)}
        >
          {/* Slightly oversized invisible hit area so hovering is forgiving. */}
          <sphereGeometry args={[0.4, 12, 12]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.17, 24, 24]} />
          <meshStandardMaterial
            color={node.color}
            emissive={node.color}
            emissiveIntensity={active ? 1.6 : 0.8}
            roughness={0.3}
          />
        </mesh>
        <sprite scale={[1.05, 1.05, 1]}>
          <spriteMaterial
            ref={haloRef}
            map={haloTexture}
            transparent
            opacity={0.55}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      </group>
    </group>
  )
}

/** Ambient particle dust so the scene reads as a volume, not a flat ring. */
function Dust() {
  const geometry = useMemo(() => {
    const count = 110
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      // Random points in a spherical shell around the orbit.
      const radius = 3 + Math.random() * 2.4
      const theta = Math.random() * Math.PI * 2
      const y = (Math.random() - 0.5) * 2
      positions[i * 3] = Math.cos(theta) * radius
      positions[i * 3 + 1] = y * 1.6
      positions[i * 3 + 2] = Math.sin(theta) * radius
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const pointsRef = useRef<THREE.Points>(null)
  useFrame((state) => {
    if (pointsRef.current) pointsRef.current.rotation.y = -state.clock.elapsedTime * 0.03
  })

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.035}
        color="#38bdf8"
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function OrbitScene({ nodes, activeIndex, onActiveChange }: DimensionOrbitProps) {
  const parallaxRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Group>(null)
  const positions = useMemo(() => orbitPositions(nodes.length, ORBIT_RADIUS, ORBIT_PHASE), [nodes.length])

  // Spokes from the judge core out to each category node. They live inside the
  // rotating ring group, so the geometry itself never changes.
  const spokesGeometry = useMemo(() => {
    const linePositions = new Float32Array(positions.length * 6)
    positions.forEach((p, i) => {
      linePositions.set([0, 0, 0, p.x, p.y, p.z], i * 6)
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
    return geo
  }, [positions])
  useEffect(() => () => spokesGeometry.dispose(), [spokesGeometry])

  const orbitSpeed = useRef(0.14)
  useFrame((state, delta) => {
    // Ease the orbit almost to a stop while a node is highlighted.
    orbitSpeed.current = THREE.MathUtils.damp(orbitSpeed.current, activeIndex === null ? 0.14 : 0.015, 4, delta)
    if (ringRef.current) ringRef.current.rotation.y += orbitSpeed.current * delta

    const parallax = parallaxRef.current
    if (parallax) {
      parallax.rotation.y = THREE.MathUtils.damp(parallax.rotation.y, state.pointer.x * 0.22, 6, delta)
      parallax.rotation.x = THREE.MathUtils.damp(parallax.rotation.x, -state.pointer.y * 0.16, 6, delta)
    }
  })

  return (
    <group ref={parallaxRef}>
      <ambientLight intensity={0.55} />
      <JudgeCore />
      <Dust />
      <group rotation={[0.42, 0, -0.16]}>
        <group ref={ringRef}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[ORBIT_RADIUS, 0.008, 8, 160]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.35} />
          </mesh>
          <lineSegments geometry={spokesGeometry}>
            <lineBasicMaterial
              color="#38bdf8"
              transparent
              opacity={0.22}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </lineSegments>
          {nodes.map((node, i) => (
            <CategoryNode
              key={node.label}
              node={node}
              position={positions[i]}
              index={i}
              active={activeIndex === i}
              onActiveChange={onActiveChange}
            />
          ))}
        </group>
      </group>
    </group>
  )
}

/**
 * Interactive 3D visualization of the judge panel: five category nodes
 * orbiting a central judge core. Rendered with react-three-fiber.
 *
 * Performance & resilience (mirrors NeuralField):
 *  - DPR capped; render loop drops to on-demand when offscreen
 *  - respects prefers-reduced-motion (static frame, no continuous loop)
 *  - degrades to the CSS fallback if WebGL is unavailable
 */
export default function DimensionOrbit(props: DimensionOrbitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    const container = containerRef.current
    if (!container) return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 })
    io.observe(container)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="absolute inset-0 h-full w-full">
      <Canvas
        dpr={[1, 1.6]}
        frameloop={visible && !reduceMotion ? 'always' : 'demand'}
        camera={{ position: [0, 1.15, 7.1], fov: 42 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        fallback={null /* no WebGL — the wrapper's CSS glow stays visible */}
      >
        <OrbitScene {...props} />
      </Canvas>
    </div>
  )
}
