import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { levels, SPECTRUM_BANDS } from '@/audio/levels'
import { PALETTE } from './glsl'

// Сцена «Галактика»: 60 000 частиц в спиральных рукавах. Каждая частица
// привязана к своей полосе спектра по расстоянию от центра: ядро — басы,
// окраины — высокие. Громкая полоса поднимает свои звёзды над диском.
//
// Всё движение считается в вершинном шейдере на видеокарте: процессор
// каждый кадр передаёт только время и 64 числа спектра.

const COUNT = 60_000
const ARMS = 4
const RADIUS = 6

const vertex = /* glsl */ `
uniform float uSpin;
uniform float uPulse;
uniform float uSpectrum[${SPECTRUM_BANDS}];
uniform float uPixelRatio;
attribute float aRadius;
attribute float aArm;
attribute vec3 aJitter;
attribute float aSize;
varying float vRadius;
varying float vLevel;
void main() {
  float r = aRadius;
  // Внутренние звёзды вращаются быстрее внешних — как в настоящей галактике.
  // uSpin — накопленный в JS угол: музыка меняет скорость, а не положение.
  float angle = aArm + r * 0.9 + uSpin * (0.6 / (0.6 + r));
  vec3 pos = vec3(cos(angle) * r, 0.0, sin(angle) * r) + aJitter * (0.15 + r * 0.08);
  int band = int(clamp(r / ${RADIUS.toFixed(1)}, 0.0, 0.999) * ${SPECTRUM_BANDS.toFixed(1)});
  float level = uSpectrum[band];
  vLevel = level;
  vRadius = r / ${RADIUS.toFixed(1)};
  // Громкая полоса выталкивает звёзды вверх и вниз от диска.
  pos.y += aJitter.y * level * 2.6;
  // На долю галактика чуть-чуть «вздыхает».
  pos.xz *= 1.0 + uPulse * 0.015;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * (1.0 + level * 1.8 + uPulse * 0.3) * uPixelRatio * (13.0 / -mv.z);
}
`

const fragment = /* glsl */ `
uniform float uHue;
varying float vRadius;
varying float vLevel;
${PALETTE}
void main() {
  // Круглая мягкая точка вместо квадрата.
  float d = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.0, d);
  vec3 color = palette(vRadius * 0.7 + uHue, vec3(0.6), vec3(0.5), vec3(1.0), vec3(0.0, 0.18, 0.4));
  // Ядро горячее и светлее.
  color = mix(vec3(1.0, 0.82, 0.6), color, smoothstep(0.0, 0.3, vRadius));
  // Звёзд десятки тысяч и они складываются — поэтому каждая очень тусклая;
  // ярче становятся только те, чья полоса сейчас громкая.
  gl_FragColor = vec4(color * (0.16 + vLevel * 0.9), alpha * 0.55);
}
`

/** Начальные параметры звёзд: радиус, рукав, разброс, размер. */
function makeGalaxy(count: number) {
  const radius = new Float32Array(count)
  const arm = new Float32Array(count)
  const jitter = new Float32Array(count * 3)
  const size = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    // Больше звёзд ближе к центру: степень «прижимает» распределение.
    radius[i] = Math.random() ** 1.6 * RADIUS + 0.05
    arm[i] = ((i % ARMS) / ARMS) * Math.PI * 2
    // Разброс вокруг рукава — по нормальному распределению (сумма случайных).
    for (let k = 0; k < 3; k++) {
      const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
      jitter[i * 3 + k] = k === 1 ? g * 0.35 : g
    }
    size[i] = 0.6 + Math.random() ** 3 * 2.4
  }
  const g = new THREE.BufferGeometry()
  // Позиции считает шейдер; атрибут position нужен three.js для числа вершин.
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  g.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1))
  g.setAttribute('aArm', new THREE.BufferAttribute(arm, 1))
  g.setAttribute('aJitter', new THREE.BufferAttribute(jitter, 3))
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  // Шейдер двигает точки сам — рамку для отсечения задаём вручную с запасом.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RADIUS * 2)
  return g
}

export function Galaxy() {
  const geometry = useMemo(() => makeGalaxy(COUNT), [])
  const uniforms = useMemo(
    () => ({
      uSpin: { value: 0 },
      uPulse: { value: 0 },
      uHue: { value: 0 },
      uPixelRatio: { value: 1 },
      uSpectrum: { value: new Float32Array(SPECTRUM_BANDS) },
    }),
    [],
  )

  useFrame((state, dt) => {
    const u = uniforms
    // Скорость вращения растёт с басом. Важно копить угол (+= скорость × dt),
    // а не умножать время на бас: время × бас «прыгает» на десятки радиан при
    // любом изменении громкости — так раньше дёргалась вся сцена.
    u.uSpin.value += dt * (1 + levels.bass * 1.2)
    u.uPulse.value = levels.pulse
    u.uPixelRatio.value = state.gl.getPixelRatio()
    u.uSpectrum.value.set(levels.spectrum)
    // Цвета медленно «плывут» и сдвигаются на каждой доле.
    u.uHue.value += dt * (0.02 + levels.pulse * 0.08)
    const t = state.clock.elapsedTime * 0.07
    state.camera.position.set(Math.sin(t) * 8, 3.6 + Math.sin(t * 1.3) * 1.5, Math.cos(t) * 8)
    state.camera.lookAt(0, 0, 0)
  })

  return (
    <>
      <color attach="background" args={['#020208']} />
      <points geometry={geometry}>
        <shaderMaterial
          vertexShader={vertex}
          fragmentShader={fragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          // Сложение цветов: где звёзды гуще, там светлее — как настоящее свечение.
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  )
}
