import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { levels, SPECTRUM_BANDS } from '@/audio/levels'

// Сцена «Горизонт»: ландшафт в духе синтвейва. Каждая строка гор — снимок
// спектра в какой-то момент. Новые снимки появляются у горизонта и «едут»
// к зрителю, поэтому рельеф — это история музыки за последние секунды.
//
// История хранится в текстуре HISTORY × SPECTRUM_BANDS (кольцевой буфер):
// каждый кадр пишем одну строку, шейдер читает её со сдвигом uHead.
// Значения — байты 0…255: плавную (линейную) выборку из float-текстур
// умеют не все телефоны, а из байтовых — все.

const HISTORY = 128
const WIDTH = 44
const DEPTH = 70

const terrainVertex = /* glsl */ `
uniform sampler2D uHistory;
uniform float uHead;
uniform float uScroll;
varying float vHeight;
varying float vDepth;
varying vec2 vGrid;
void main() {
  // Расстояние от центральной «дороги»: на дороге гор нет.
  float side = abs(uv.x - 0.5) * 2.0;
  float band = clamp((side - 0.06) / 0.94, 0.0, 1.0);
  // uv.y = 1 — горизонт (новые строки), 0 — у камеры (старые).
  float row = fract(uHead - (1.0 - uv.y) + 0.5 / ${HISTORY.toFixed(1)});
  float level = texture2D(uHistory, vec2(band * 0.92 + 0.02, row)).r;
  float ridge = smoothstep(0.04, 0.22, side);
  // Музыка + неподвижные «холмы», которые едут вместе с решёткой: без них
  // на тихих местах рельеф превращался бы в ровную плиту.
  float gy = uv.y * ${DEPTH.toFixed(1)} + uScroll;
  float hills = (0.5 + 0.5 * sin(gy * 0.45 + uv.x * 17.0) * sin(gy * 0.21 - uv.x * 9.0)) * side * 1.6;
  float h = (pow(level, 1.4) * (2.0 + band * 7.0) + hills) * ridge;
  vHeight = h;
  vDepth = uv.y;
  vGrid = vec2(uv.x * ${WIDTH.toFixed(1)}, uv.y * ${DEPTH.toFixed(1)});
  vec3 pos = position + vec3(0.0, 0.0, h);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const terrainFragment = /* glsl */ `
uniform float uScroll;
uniform float uPulse;
uniform vec3 uLine;
uniform vec3 uPeak;
varying float vHeight;
varying float vDepth;
varying vec2 vGrid;
void main() {
  // Линии сетки толщиной в ~1 пиксель на любом расстоянии: fwidth — изменение
  // координаты между соседними пикселями. Решётка «едет» вместе с историей.
  vec2 g = vec2(vGrid.x, vGrid.y + uScroll);
  vec2 w = fwidth(g);
  vec2 a = abs(fract(g - 0.5) - 0.5) / w;
  float line = 1.0 - min(min(a.x, a.y), 1.0);
  vec3 color = mix(uLine, uPeak, smoothstep(0.3, 3.5, vHeight));
  // Чем дальше, тем тусклее — туман к горизонту.
  float fade = smoothstep(1.0, 0.55, vDepth);
  vec3 fill = vec3(0.02, 0.0, 0.05) + color * 0.05 * vHeight;
  gl_FragColor = vec4(mix(fill, color * (1.4 + uPulse * 1.2), line) * fade, 1.0);
}
`

const skyFragment = /* glsl */ `
varying vec2 vUv;
void main() {
  // Небо: тёмно-синее сверху, малиновое свечение у горизонта.
  vec3 top = vec3(0.02, 0.0, 0.06);
  vec3 glow = vec3(0.32, 0.03, 0.36);
  gl_FragColor = vec4(mix(glow, top, smoothstep(0.0, 0.55, vUv.y)), 1.0);
}
`

const sunVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const sunFragment = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  // Градиент сверху вниз: жёлтый → малиновый.
  vec3 color = mix(vec3(1.0, 0.22, 0.55), vec3(1.0, 0.85, 0.3), vUv.y);
  // Горизонтальные прорези в нижней половине. Ровно бегут вниз с постоянной
  // скоростью, а толщина зависит от медленной «энергии» музыки.
  float y = vUv.y;
  float stripe = fract(y * 14.0 + uTime * 0.25);
  float width = smoothstep(0.48, 0.05, y) * (0.35 + uEnergy * 0.3);
  float cut = y < 0.48 ? smoothstep(width - 0.02, width + 0.02, stripe) : 1.0;
  gl_FragColor = vec4(color * (0.8 + uEnergy * 0.25), cut * smoothstep(0.5, 0.48, d));
}
`

export function Terrain() {
  const history = useMemo(() => {
    const data = new Uint8Array(SPECTRUM_BANDS * HISTORY)
    const tex = new THREE.DataTexture(data, SPECTRUM_BANDS, HISTORY, THREE.RedFormat, THREE.UnsignedByteType)
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearFilter
    tex.wrapT = THREE.RepeatWrapping
    tex.needsUpdate = true
    return { tex, data, head: 0 }
  }, [])

  const terrainUniforms = useMemo(
    () => ({
      uHistory: { value: history.tex },
      uHead: { value: 0 },
      uScroll: { value: 0 },
      uPulse: { value: 0 },
      uLine: { value: new THREE.Color('#ff3fb4') },
      uPeak: { value: new THREE.Color('#5ff3ff') },
    }),
    [history],
  )
  const sunUniforms = useMemo(() => ({ uTime: { value: 0 }, uEnergy: { value: 0 } }), [])
  const sun = useRef<THREE.Mesh>(null)
  const acc = useRef(0)

  useFrame((state, dt) => {
    // Новая строка истории ~45 раз в секунду, независимо от частоты кадров.
    acc.current = Math.min(acc.current + dt, 0.5) // после свёрнутой вкладки не догоняем секунды
    const rowTime = 1 / 45
    while (acc.current >= rowTime) {
      acc.current -= rowTime
      history.head = (history.head + 1) % HISTORY
      const offset = history.head * SPECTRUM_BANDS
      for (let i = 0; i < SPECTRUM_BANDS; i++) history.data[offset + i] = Math.min(255, levels.spectrum[i] * 255)
      terrainUniforms.uScroll.value += DEPTH / HISTORY
    }
    history.tex.needsUpdate = true
    terrainUniforms.uHead.value = (history.head + 1) / HISTORY
    terrainUniforms.uPulse.value = levels.pulse
    sunUniforms.uTime.value += dt
    // Солнцу — своё, очень медленное сглаживание: оно «дышит» вместе с
    // громкостью трека за последние секунды, а не мигает на каждом ударе.
    const energy = sunUniforms.uEnergy
    energy.value += (levels.bass - energy.value) * Math.min(1, dt * 0.8)
    sun.current?.scale.setScalar(1 + energy.value * 0.05)
    // Камера чуть покачивается, будто едем по дороге.
    const t = state.clock.elapsedTime
    state.camera.position.set(Math.sin(t * 0.3) * 0.6, 2.2 + Math.sin(t * 0.5) * 0.15, 15)
    state.camera.lookAt(0, 2.4, -20)
  })

  return (
    <>
      <color attach="background" args={['#0a0016']} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -DEPTH / 2 + 18]}>
        <planeGeometry args={[WIDTH, DEPTH, SPECTRUM_BANDS * 2 - 1, HISTORY - 1]} />
        <shaderMaterial vertexShader={terrainVertex} fragmentShader={terrainFragment} uniforms={terrainUniforms} />
      </mesh>
      <mesh ref={sun} position={[0, 6.5, -DEPTH + 16]}>
        <planeGeometry args={[22, 22]} />
        <shaderMaterial vertexShader={sunVertex} fragmentShader={sunFragment} uniforms={sunUniforms} transparent />
      </mesh>
      {/* Небо — огромная плоскость с градиентом позади всего. */}
      <mesh position={[0, 30, -DEPTH + 10]} renderOrder={-1}>
        <planeGeometry args={[260, 64]} />
        <shaderMaterial vertexShader={sunVertex} fragmentShader={skyFragment} depthWrite={false} />
      </mesh>
    </>
  )
}
