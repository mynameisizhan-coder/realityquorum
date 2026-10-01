import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { locations } from '../data/campus'
import type { CampusLocation } from '../types'

interface SceneProps {
  selected: string | null
  onSelect: (id: string) => void
  markers: RefObject<Map<string, HTMLDivElement>>
  command: { action: 'reset' | 'in' | 'out'; tick: number }
}

type Block = {
  x: number
  z: number
  w: number
  d: number
  h: number
  rotation?: number
  roof?: boolean
  solar?: boolean
  color?: string
  windows?: boolean
}

const blocks: Record<string, Block[]> = {
  admin: [{ x: 0, z: 0, w: 14, d: 5.2, h: 7.8, rotation: -0.08, solar: true }],
  ramanujan: [
    { x: 0, z: -2.8, w: 13, d: 2.8, h: 7.6 },
    { x: -5.1, z: 0.6, w: 2.8, d: 7.2, h: 7.2 },
    { x: 5.1, z: 0.6, w: 2.8, d: 7.2, h: 7.8 },
  ],
  smv: [
    { x: 0, z: 0, w: 7.5, d: 5.2, h: 8.6, roof: true },
    { x: -3.7, z: 3.6, w: 4.3, d: 2.4, h: 5.2 },
  ],
  'cv-raman': [
    { x: 0, z: 0, w: 6.4, d: 9.5, h: 9.2, roof: true },
    { x: 4.1, z: 0.8, w: 3.2, d: 7, h: 7.6, roof: true },
  ],
  'sac-oat': [{ x: 0, z: 3.8, w: 7.5, d: 1.9, h: 1.9, roof: true, windows: false }],
  aic: [{ x: 0, z: 0, w: 7.5, d: 5, h: 4.2, roof: true }],
  'bus-stop': [{ x: 0, z: 0, w: 5.2, d: 1.5, h: 1.5, roof: true, windows: false }],
  amphitheatre: [
    { x: 0, z: 0, w: 13.5, d: 8.2, h: 6, roof: true, windows: false },
    { x: 0, z: 5, w: 10, d: 2, h: 2.2, windows: false },
  ],
  hostel: [
    { x: 0, z: 0, w: 15, d: 5, h: 8.5 },
    { x: 4, z: 5, w: 7, d: 4, h: 7.2 },
    { x: -5.3, z: 5.2, w: 4.5, d: 4.2, h: 6.3 },
  ],
  canteen: [{ x: 0, z: 0, w: 7, d: 5, h: 3.1, roof: true }],
  'indoor-stadium': [{ x: 0, z: 0, w: 18, d: 9, h: 7, roof: true, windows: false }],
}

const outdoorSizes: Record<string, [number, number]> = {
  'sac-oat': [12, 9],
  'new-ground': [49, 31],
  garden: [21, 18],
}

function Solid({
  position,
  size,
  color,
  ...props
}: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  rotation?: [number, number, number]
}) {
  return (
    <mesh position={position} castShadow receiveShadow {...props}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  )
}

function Windows({ w, d, h }: { w: number; d: number; h: number }) {
  const matrices = useMemo(() => {
    const values: THREE.Matrix4[] = []
    const dummy = new THREE.Object3D()
    const rows = Math.max(1, Math.floor(h / 1.9))
    const columns = Math.max(1, Math.floor(w / 1.8))
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        for (const sign of [-1, 1]) {
          dummy.position.set((c - (columns - 1) / 2) * 1.65, 1 + r * 1.75, sign * (d / 2 + 0.012))
          dummy.scale.set(0.86, 0.92, 0.06)
          dummy.rotation.set(0, 0, 0)
          dummy.updateMatrix()
          values.push(dummy.matrix.clone())
        }
      }
    }
    const sides = Math.max(1, Math.floor(d / 1.9))
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < sides; c += 1) {
        for (const sign of [-1, 1]) {
          dummy.position.set(sign * (w / 2 + 0.014), 1 + r * 1.75, (c - (sides - 1) / 2) * 1.65)
          dummy.scale.set(0.05, 0.92, 0.84)
          dummy.rotation.set(0, 0, 0)
          dummy.updateMatrix()
          values.push(dummy.matrix.clone())
        }
      }
    }
    return values
  }, [w, d, h])
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    matrices.forEach((matrix, index) => ref.current?.setMatrixAt(index, matrix))
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true
  }, [matrices])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, matrices.length]}>
      <boxGeometry />
      <meshStandardMaterial color="#526863" roughness={0.55} />
    </instancedMesh>
  )
}

function Roof({ w, d, h }: { w: number; d: number; h: number }) {
  const angle = Math.atan2(1.1, d / 2 + 0.35)
  const slope = Math.sqrt((d / 2 + 0.35) ** 2 + 1.1 ** 2)
  return (
    <group position={[0, h + 0.08, 0]}>
      {[-1, 1].map((side) => (
        <Solid
          key={side}
          position={[0, 0.55, side * (d / 4 + 0.14)]}
          size={[w + 0.8, 0.15, slope]}
          color={side === 1 ? '#ad5b4d' : '#c5765e'}
          rotation={[side * angle, 0, 0]}
        />
      ))}
      <Solid position={[0, 1.08, 0]} size={[w + 0.9, 0.16, 0.18]} color="#934b43" />
    </group>
  )
}

function SolarPanels({ w, d, h }: { w: number; d: number; h: number }) {
  const count = Math.max(3, Math.floor(w / 2.2))
  return (
    <group position={[0, h + 0.34, 0]} rotation={[-0.1, 0, 0]}>
      {Array.from({ length: count }, (_, index) => (
        <group key={index} position={[(index - (count - 1) / 2) * 2.05, 0, 0]}>
          <Solid position={[0, 0, 0]} size={[1.82, 0.11, Math.max(2.6, d - 0.7)]} color="#365568" />
          <Solid position={[0, 0.07, 0]} size={[0.03, 0.01, Math.max(2.6, d - 0.7)]} color="#a8bec5" />
        </group>
      ))}
    </group>
  )
}

function Building({
  location,
  selected,
  onSelect,
}: {
  location: CampusLocation
  selected: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const pieces = blocks[location.id] ?? []
  const outdoor = outdoorSizes[location.id]
  const radius = outdoor ? Math.max(outdoor[0], outdoor[1]) * 0.54 : 7.5
  useEffect(() => {
    if (hovered) document.body.style.cursor = 'pointer'
    return () => {
      document.body.style.cursor = ''
    }
  }, [hovered])
  return (
    <group
      position={location.position}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      {pieces.map((block, index) => (
        <group key={index} position={[block.x, 0.14, block.z]} rotation={[0, block.rotation ?? 0, 0]}>
          <mesh position={[0, block.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[block.w, block.h, block.d]} />
            <meshStandardMaterial
              color={selected ? '#e2ebce' : hovered ? '#f5f3df' : block.color ?? '#f0eee1'}
            />
            {(selected || hovered) && (
              <Edges scale={1.006} threshold={25} color={selected ? '#3a785c' : '#91ac70'} />
            )}
          </mesh>
          {block.windows !== false && <Windows w={block.w} d={block.d} h={block.h} />}
          {Array.from({ length: Math.floor(block.h / 1.75) }, (_, floor) => (
            <Solid
              key={floor}
              position={[0, 1.66 + floor * 1.75, 0]}
              size={[block.w + 0.18, 0.1, block.d + 0.18]}
              color="#e5e2d2"
            />
          ))}
          {block.roof ? (
            <Roof w={block.w} d={block.d} h={block.h} />
          ) : (
            <Solid position={[0, block.h + 0.11, 0]} size={[block.w + 0.22, 0.22, block.d + 0.22]} color="#cfcbba" />
          )}
          {block.solar && <SolarPanels w={block.w} d={block.d} h={block.h} />}
        </group>
      ))}
      {outdoor && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.42, 0]}>
          <planeGeometry args={outdoor} />
          <meshBasicMaterial transparent opacity={0.01} depthWrite={false} />
        </mesh>
      )}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.46, 0]}>
          <ringGeometry args={[radius, radius + 0.3, 96]} />
          <meshBasicMaterial color="#4c8161" transparent opacity={0.78} />
        </mesh>
      )}
    </group>
  )
}

type RoadPoint = [number, number]
const roadNetworks: { points: RoadPoint[]; width: number }[] = [
  { points: [[-80, -58], [-63, -54], [-52, -49], [-40, -45], [-25, -43], [-8, -38], [8, -28]], width: 4.8 },
  { points: [[-58, -48], [-54, -35], [-38, -28], [-23, -27], [-7, -22], [4, -10], [5, 7], [-7, 21], [-13, 42], [-15, 67]], width: 3.4 },
  { points: [[-38, -30], [-23, -35], [-7, -35], [5, -28], [19, -24], [38, -28], [62, -34], [70, -28]], width: 3.2 },
  { points: [[3, -22], [18, -15], [35, -10], [55, -4], [66, 4], [71, 17]], width: 3.5 },
  { points: [[62, -32], [64, -18], [61, -6], [58, 7]], width: 3.2 },
  { points: [[4, 8], [18, 10], [33, 4], [49, -2], [61, -6]], width: 3.1 },
  { points: [[-8, 22], [-28, 22], [-39, 31], [-41, 47], [-25, 59], [-15, 65]], width: 3.2 },
]

function Road({ points, width }: { points: RoadPoint[]; width: number }) {
  return (
    <group>
      {points.slice(1).map(([x, z], index) => {
        const [fromX, fromZ] = points[index]
        const dx = x - fromX
        const dz = z - fromZ
        const length = Math.hypot(dx, dz)
        return (
          <Solid
            key={`${fromX}-${fromZ}-${x}-${z}`}
            position={[(fromX + x) / 2, 0.13, (fromZ + z) / 2]}
            size={[length + width * 0.65, 0.11, width]}
            color="#aeb4a8"
            rotation={[0, -Math.atan2(dz, dx), 0]}
          />
        )
      })}
    </group>
  )
}

function Greenery() {
  const instances = useMemo(() => {
    let seed = 2719
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    const zones: [number, number, number, number][] = [
      [-42, -45, 20, 13], [-54, -34, 19, 17], [-42, -22, 13, 13], [-30, -34, 13, 15],
      [-42, -34, 15, 12], [-18, -22, 13, 12], [-17, -11, 9, 7], [-7, -35, 20, 15],
      [8, -5, 12, 11], [1, 8, 22, 17],
      [-15, 63, 55, 37], [64, -32, 24, 15], [58, -18, 12, 10], [60, -6, 25, 22],
    ]
    const roadSegments = roadNetworks.flatMap((road) => road.points.slice(1).map((point, index) => [road.points[index], point, road.width] as const))
    const nearRoad = (x: number, z: number) => roadSegments.some(([a, b, width]) => {
      const vx = b[0] - a[0]
      const vz = b[1] - a[1]
      const projection = THREE.MathUtils.clamp(((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz), 0, 1)
      return Math.hypot(x - (a[0] + projection * vx), z - (a[1] + projection * vz)) < width / 2 + 1.5
    })
    const items: { x: number; z: number; scale: number; color: string }[] = []
    for (let index = 0; index < 280; index += 1) {
      const x = random() * 164 - 80
      const z = random() * 145 - 62
      if (zones.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 && Math.abs(z - cz) < d / 2) || nearRoad(x, z)) continue
      items.push({
        x,
        z,
        scale: 0.52 + random() * 0.72,
        color: ['#719365', '#85a472', '#5b805e', '#91aa75', '#6a8c62'][Math.floor(random() * 5)],
      })
    }
    return items
  }, [])
  const tops = useRef<THREE.InstancedMesh>(null)
  const trunks = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D()
    instances.forEach((tree, index) => {
      dummy.position.set(tree.x, 1.8 * tree.scale, tree.z)
      dummy.scale.set(tree.scale, tree.scale * 1.28, tree.scale)
      dummy.updateMatrix()
      tops.current?.setMatrixAt(index, dummy.matrix)
      tops.current?.setColorAt(index, new THREE.Color(tree.color))
      dummy.position.y = tree.scale * 0.78
      dummy.scale.set(0.13 * tree.scale, 1.55 * tree.scale, 0.13 * tree.scale)
      dummy.updateMatrix()
      trunks.current?.setMatrixAt(index, dummy.matrix)
    })
    if (tops.current) {
      tops.current.instanceMatrix.needsUpdate = true
      if (tops.current.instanceColor) tops.current.instanceColor.needsUpdate = true
    }
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true
  }, [instances])
  return (
    <group>
      <instancedMesh ref={tops} args={[undefined, undefined, instances.length]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, instances.length]}>
        <cylinderGeometry args={[1, 1.2, 1, 5]} />
        <meshStandardMaterial color="#887b5e" />
      </instancedMesh>
    </group>
  )
}

function Palm({ x, z, h = 4.4 }: { x: number; z: number; h?: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.18, h, 6]} />
        <meshStandardMaterial color="#94876a" />
      </mesh>
      {Array.from({ length: 7 }, (_, index) => (
        <group key={index} position={[0, h, 0]} rotation={[0, (index * Math.PI * 2) / 7, 0]}>
          <mesh position={[0, -0.06, 0.84]} scale={[0.29, 0.1, 1.28]} castShadow>
            <sphereGeometry args={[1, 5, 3]} />
            <meshStandardMaterial color={index % 2 ? '#588663' : '#719955'} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function FootballPitch({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  return (
    <group position={[x, 0, z]}>
      <Solid position={[0, 0.17, 0]} size={[w, 0.09, d]} color="#87a874" />
      <Line points={[[0, 0.25, -d / 2 + 1], [0, 0.25, d / 2 - 1]]} color="#e7ead7" lineWidth={1} />
      <Line points={[
        [-w / 2 + 1, 0.25, -d / 2 + 1], [w / 2 - 1, 0.25, -d / 2 + 1],
        [w / 2 - 1, 0.25, d / 2 - 1], [-w / 2 + 1, 0.25, d / 2 - 1], [-w / 2 + 1, 0.25, -d / 2 + 1],
      ]} color="#e7ead7" lineWidth={1} />
      <mesh position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.4, 2.5, 48]} />
        <meshBasicMaterial color="#e7ead7" />
      </mesh>
    </group>
  )
}

function Landscape() {
  return (
    <group>
      <Solid position={[2, -1.22, 8]} size={[166, 2.2, 147]} color="#bdc9b1" />
      <Solid position={[2, -0.08, 8]} size={[166, 0.28, 147]} color="#d1dcc2" />
      {roadNetworks.map((road, index) => <Road key={index} {...road} />)}

      <group position={[-42, 0, -34]}>
        <Solid position={[0, 0.16, 0]} size={[12, 0.09, 9]} color="#9fb886" />
        <Solid position={[0, 0.22, 0]} size={[1.2, 0.05, 9]} color="#e6dfc9" />
        <Solid position={[0, 0.22, 0]} size={[12, 0.05, 1.1]} color="#e6dfc9" />
      </group>

      <FootballPitch x={-11.5} z={22.1} w={35} d={20} />
      <group position={[-14.9, 0, 63.1]}>
        <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[25, 16, 1]}>
          <circleGeometry args={[1, 96]} />
          <meshStandardMaterial color="#a17b63" />
        </mesh>
        <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[21.5, 12.5, 1]}>
          <circleGeometry args={[1, 96]} />
          <meshStandardMaterial color="#82a66e" />
        </mesh>
        <FootballPitch x={0} z={0} w={38} d={20} />
      </group>

      <group position={[60.4, 0, -6.3]}>
        <Solid position={[0, 0.17, 0]} size={[21, 0.1, 18]} color="#9fba80" />
        <Solid position={[0, 0.23, 0]} size={[1.5, 0.06, 18]} color="#e6dfc9" />
        <Solid position={[0, 0.23, 0]} size={[21, 0.06, 1.5]} color="#e6dfc9" />
        <Solid position={[0, 0.27, 0]} size={[8.5, 0.11, 6.8]} color="#779d96" />
        <Solid position={[0, 0.34, 0]} size={[0.6, 0.04, 7]} color="#ebe4cf" />
        <Solid position={[0, 0.34, 0]} size={[8.7, 0.04, 0.6]} color="#ebe4cf" />
      </group>
      {[52, 59, 67].flatMap((x) => [-13, -5, 2].map((z) => <Palm key={`${x}-${z}`} x={x} z={z} />))}

      <Solid position={[-70, 1.25, -57]} size={[0.65, 2.5, 0.65]} color="#ece4d0" />
      <Solid position={[-63, 1.25, -55]} size={[0.65, 2.5, 0.65]} color="#ece4d0" />
      <Solid position={[-66.5, 2.55, -56]} size={[8, 0.42, 0.8]} color="#eee7d3" />

      <Greenery />
    </group>
  )
}

function CameraControls({ command }: Pick<SceneProps, 'command'>) {
  const ref = useRef<OrbitControlsImpl>(null)
  const initialized = useRef(false)
  const { camera, size, invalidate } = useThree()
  const baseZoom = Math.min(size.width / 205, size.height / 150)
  useEffect(() => {
    if ('zoom' in camera) {
      if (!initialized.current) {
        camera.position.set(130, 145, 165)
        camera.lookAt(0, 0, 4)
        ref.current?.target.set(0, 0, 4)
        ref.current?.update()
        initialized.current = true
      }
      camera.zoom = baseZoom
      camera.updateProjectionMatrix()
      invalidate()
    }
  }, [baseZoom, camera, invalidate])
  useEffect(() => {
    if (!('zoom' in camera)) return
    if (command.action === 'reset') {
      camera.position.set(130, 145, 165)
      ref.current?.target.set(0, 0, 4)
      camera.zoom = baseZoom
    } else {
      camera.zoom = THREE.MathUtils.clamp(
        camera.zoom * (command.action === 'in' ? 1.22 : 1 / 1.22),
        baseZoom * 0.72,
        baseZoom * 3.2,
      )
    }
    camera.updateProjectionMatrix()
    ref.current?.update()
    invalidate()
    // A command is intentionally applied once per click, not on every viewport resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command.tick])
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      target={[0, 0, 4]}
      enableDamping={false}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI / 2.45}
      minZoom={baseZoom * 0.72}
      maxZoom={baseZoom * 3.2}
      enablePan={false}
    />
  )
}

const markerPriority = [
  'admin', 'smv', 'hostel', 'new-ground', 'indoor-stadium', 'garden',
  'ramanujan', 'cv-raman', 'sac-oat', 'aic', 'bus-stop',
  'amphitheatre', 'canteen',
]

function ProjectMarkers({ markers, selected }: Pick<SceneProps, 'markers' | 'selected'>) {
  const point = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    const order = [...locations].sort((a, b) => {
      if (a.id === selected) return -1
      if (b.id === selected) return 1
      return markerPriority.indexOf(a.id) - markerPriority.indexOf(b.id)
    })
    const occupied: { left: number; right: number; top: number; bottom: number }[] = []
    for (const location of order) {
      const element = markers.current.get(location.id)
      if (!element) continue
      point.set(...location.labelPosition).project(camera)
      const x = (point.x * 0.5 + 0.5) * size.width
      const y = (-point.y * 0.5 + 0.5) * size.height
      const halfWidth = Math.max(35, element.offsetWidth / 2) + 4
      const halfHeight = Math.max(11, element.offsetHeight / 2) + 3
      const rect = { left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight }
      const inView = point.z > -1 && point.z < 1 && x > -halfWidth && x < size.width + halfWidth && y > -halfHeight && y < size.height + halfHeight
      const overlaps = occupied.some((other) => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top)
      element.style.visibility = inView && !overlaps ? 'visible' : 'hidden'
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      if (inView && !overlaps) occupied.push(rect)
    }
  })
  return null
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback">
        <span>3D is unavailable on this device.</span>
        <p>Use “Location list” above to choose any campus location.</p>
      </div>
    ) : this.props.children
  }
}

export default function CampusScene(props: SceneProps) {
  return (
    <SceneBoundary>
      <Canvas
        orthographic
        frameloop="demand"
        dpr={[1, 1.5]}
        shadows
        camera={{ position: [130, 145, 165], zoom: 4, near: 0.1, far: 600 }}
        gl={{ antialias: true, alpha: true }}
        fallback={<div className="scene-fallback">Use the location list to explore this campus.</div>}
      >
        <ambientLight intensity={1.3} />
        <hemisphereLight args={['#f4f4e3', '#92a478', 1.35]} />
        <directionalLight
          position={[-45, 85, 25]}
          intensity={2.35}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-100}
          shadow-camera-right={100}
          shadow-camera-top={100}
          shadow-camera-bottom={-100}
          shadow-camera-far={220}
          shadow-normalBias={0.08}
          shadow-bias={-0.0001}
        />
        <Suspense fallback={null}>
          <Landscape />
          {locations.map((location) => (
            <Building
              key={location.id}
              location={location}
              selected={location.id === props.selected}
              onSelect={() => props.onSelect(location.id)}
            />
          ))}
        </Suspense>
        <CameraControls command={props.command} />
        <ProjectMarkers markers={props.markers} selected={props.selected} />
      </Canvas>
    </SceneBoundary>
  )
}
