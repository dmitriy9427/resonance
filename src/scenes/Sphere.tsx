import { Stars } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { levels } from '@/audio/levels'
import { usePlayer } from '@/store/player'
import { SIMPLEX_3D } from './glsl'

// Сцена «Пульс»: сфера, поверхность которой колышет шум, а амплитуду
// задаёт бас. Верхние частоты добавляют мелкую «рябь», доля — толчок.
// Вокруг — два кольца-спектра: каждый луч — своя полоса частот.

const vertex = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uPulse;
varying float vDisp;
varying vec3 vNormal;
varying vec3 vView;
${SIMPLEX_3D}
void main() {
  // Крупные волны: скорость растёт от середины, высота — от баса.
  float t = uTime * (0.25 + uMid * 0.6);
  float big = snoise(normal * 1.4 + vec3(t, t * 0.7, -t * 0.4));
  // Мелкая рябь — от верхних частот.
  float fine = snoise(normal * 5.5 + vec3(-t * 2.0, t, t * 1.5));
  float disp = big * (0.1 + uBass * 0.55) + fine * uTreble * 0.12 + uPulse * 0.14;
  vDisp = disp;
  vec3 pos = position + normal * disp;
  vec4 world = modelMatrix * vec4(pos, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragment = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vDisp;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  // Френель: края сферы светятся сильнее центра — объём без освещения.
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), vView), 0.0), 2.4);
  vec3 base = mix(uColorA, uColorB, smoothstep(-0.3, 0.45, vDisp));
  // Тонкие «изолинии» по высоте волны — как радужная плёнка.
  float bands = 0.5 + 0.5 * sin(vDisp * 85.0 - uTime * 2.0);
  vec3 color = base * (0.08 + pow(bands, 6.0) * 0.9) + uColorB * fresnel * (1.1 + uPulse * 1.4);
  gl_FragColor = vec4(color, 1.0);
}
`

const RAYS = 128

/** Кольцо-спектр: вершины на окружности, радиус каждой зависит от своей полосы. */
function SpectrumRing({ radius, tilt, color, offset }: { radius: number; tilt: number; color: string; offset: number }) {
  const ref = useRef<THREE.LineLoop>(null)
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAYS * 3), 3))
    return g
  }, [])
  useFrame((state) => {
    const pos = geometry.attributes.position as THREE.BufferAttribute
    const bands = levels.spectrum.length
    for (let i = 0; i < RAYS; i++) {
      // Отражаем спектр: полукруг — от низких к высоким, вторая половина — обратно.
      const half = i < RAYS / 2 ? i : RAYS - 1 - i
      const band = Math.floor((half / (RAYS / 2)) * bands * 0.85 + offset) % bands
      const r = radius + levels.spectrum[band] * 0.9
      const a = (i / RAYS) * Math.PI * 2
      pos.setXYZ(i, Math.cos(a) * r, Math.sin(a) * r, 0)
    }
    pos.needsUpdate = true
    if (ref.current) ref.current.rotation.z = state.clock.elapsedTime * 0.08 * (offset ? -1 : 1)
  })
  return (
    <group rotation={[tilt, 0, 0]}>
      <lineLoop ref={ref} geometry={geometry}>
        <lineBasicMaterial color={color} toneMapped={false} transparent opacity={0.85} />
      </lineLoop>
    </group>
  )
}

export function Sphere() {
  const mesh = useRef<THREE.Mesh>(null)
  const shift = useRef(0)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uPulse: { value: 0 },
      uColorA: { value: new THREE.Color('#1b0b3a') },
      uColorB: { value: new THREE.Color('#ff5ea8') },
    }),
    [],
  )
  // Цвета сменяются на каждой 16-й доле — раз в четыре такта.
  const palettes = useMemo(
    () => [
      ['#1b0b3a', '#ff5ea8'],
      ['#04203a', '#3ef0ff'],
      ['#2a1200', '#ffb547'],
      ['#08251a', '#6dff9e'],
    ].map(([a, b]) => [new THREE.Color(a), new THREE.Color(b)]),
    [],
  )

  useFrame((state, dt) => {
    const u = uniforms
    u.uTime.value += dt
    u.uBass.value = levels.bass
    u.uMid.value = levels.mid
    u.uTreble.value = levels.treble
    u.uPulse.value = levels.pulse
    const [a, b] = palettes[Math.floor(levels.beats / 16) % palettes.length]
    u.uColorA.value.lerp(a, dt * 1.5)
    u.uColorB.value.lerp(b, dt * 1.5)
    if (mesh.current) {
      mesh.current.rotation.y += dt * (0.1 + levels.mid * 0.4)
      mesh.current.scale.setScalar(1 + levels.pulse * 0.06)
    }
    // На стартовом экране (широкий экран) сфера уступает место заголовку:
    // камера смещается влево в своей системе координат — сфера на экране
    // правее, где бы камера ни была на орбите. С музыкой — плавно в центр.
    const aside = !usePlayer.getState().source && state.size.width / state.size.height > 1.2
    shift.current += ((aside ? 1.9 : 0) - shift.current) * Math.min(1, dt * 2.5)
    // Камера медленно облетает сферу и вздрагивает на долях.
    const t = state.clock.elapsedTime * 0.12
    state.camera.position.set(Math.sin(t) * 5.2, Math.sin(t * 0.7) * 1.2 + levels.pulse * 0.08, Math.cos(t) * 5.2)
    state.camera.lookAt(0, 0, 0)
    state.camera.translateX(-shift.current)
  })

  return (
    <>
      <color attach="background" args={['#05030a']} />
      <Stars radius={60} depth={40} count={2500} factor={3} fade speed={0.6} />
      <group>
        <mesh ref={mesh}>
          <icosahedronGeometry args={[1.3, 48]} />
          <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} />
        </mesh>
        <SpectrumRing radius={2.2} tilt={Math.PI / 2.4} color="#ff8fd0" offset={0} />
        <SpectrumRing radius={2.6} tilt={Math.PI / 1.8} color="#7fe8ff" offset={7} />
      </group>
    </>
  )
}
