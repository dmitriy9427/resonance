import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import type { ChromaticAberrationEffect } from 'postprocessing'
import { useRef, useState } from 'react'
import * as THREE from 'three'
import { audio } from '@/audio/engine'
import { idleLevels, levels } from '@/audio/levels'
import { usePlayer, type SceneId } from '@/store/player'
import { Galaxy } from './Galaxy'
import { Sphere } from './Sphere'
import { Terrain } from './Terrain'

const SCENE_COMPONENTS: Record<SceneId, () => React.JSX.Element> = {
  sphere: Sphere,
  galaxy: Galaxy,
  terrain: Terrain,
}

/**
 * «Насос» данных: раз в кадр, раньше всех сцен (приоритет -1), снимает
 * показания анализатора в общий объект levels. Если звука нет — сцена
 * «дышит» сама (idleLevels).
 */
function AudioPump() {
  useFrame((state, dt) => {
    if (!audio.sample(performance.now(), dt)) idleLevels(state.clock.elapsedTime, levels)
  }, -1)
  return null
}

/** Постобработка: свечение, расслоение цвета на долях, виньетка, лёгкое зерно. */
function Effects({ reduced }: { reduced: boolean }) {
  const chroma = useRef<ChromaticAberrationEffect>(null)
  // Начальный сдвиг; дальше эффект меняем напрямую в useFrame.
  const [initial] = useState(() => new THREE.Vector2())
  useFrame(() => {
    const k = reduced ? 0 : levels.pulse * 0.0025 + levels.treble * 0.0005
    chroma.current?.offset.set(k, k * 0.6)
  })
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={0.95} luminanceThreshold={0.3} luminanceSmoothing={0.25} radius={0.75} />
      <ChromaticAberration ref={chroma} offset={initial} radialModulation={false} modulationOffset={0} />
      <Vignette eskil={false} offset={0.25} darkness={0.75} />
      <Noise opacity={0.035} />
    </EffectComposer>
  )
}

export function Stage() {
  const scene = usePlayer((s) => s.scene)
  const Scene = SCENE_COMPONENTS[scene]
  // PerformanceMonitor следит за частотой кадров: на слабом устройстве
  // снижаем плотность пикселей, вместо того чтобы показывать слайд-шоу.
  const [dpr, setDpr] = useState(Math.min(window.devicePixelRatio, 2))
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <Canvas
      className="stage"
      dpr={dpr}
      camera={{ fov: 50, near: 0.1, far: 200, position: [0, 0, 6] }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      aria-hidden="true"
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(Math.min(window.devicePixelRatio, 2))} />
      <AudioPump />
      <Scene key={scene} />
      <Effects reduced={reduced} />
    </Canvas>
  )
}
