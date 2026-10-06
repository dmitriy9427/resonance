import { useEffect, useRef } from 'react'
import { levels } from '@/audio/levels'

/**
 * Маленький спектр в плеере — обычный 2D-canvas. Рисуется в своём
 * requestAnimationFrame прямо из levels, без React-состояния.
 */
export function MiniSpectrum() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio, 2)
    let frame = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      // Размер берём каждый кадр: на узком экране canvas скрыт (0×0) — тогда не рисуем.
      const w = Math.round(canvas.clientWidth * dpr)
      const h = Math.round(canvas.clientHeight * dpr)
      if (!w || !h) return
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      ctx.clearRect(0, 0, w, h)
      const bars = 24
      const gap = 2 * dpr
      const bw = (w - gap * (bars - 1)) / bars
      const gradient = ctx.createLinearGradient(0, h, 0, 0)
      gradient.addColorStop(0, '#ff4fa3')
      gradient.addColorStop(1, '#6ff0ff')
      ctx.fillStyle = gradient
      for (let i = 0; i < bars; i++) {
        const v = levels.spectrum[Math.floor((i / bars) * levels.spectrum.length * 0.9)]
        const bh = Math.max(2 * dpr, v * h)
        ctx.beginPath()
        ctx.roundRect(i * (bw + gap), h - bh, bw, bh, bw / 2)
        ctx.fill()
      }
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={ref} className="mini-spectrum" aria-hidden="true" />
}
