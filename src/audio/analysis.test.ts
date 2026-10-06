import { describe, expect, it } from 'vitest'
import { bandLevel, BeatDetector, binOf, follow, logBands, rms } from './analysis'

const RATE = 48000
const BINS = 1024 // fftSize 2048 → 1024 ячейки по ~23,4 Гц

/** Спектр, где громко только в диапазоне [from, to] Гц. */
function spectrumWith(from: number, to: number, value = 255) {
  const s = new Uint8Array(BINS)
  for (let i = binOf(from, RATE, BINS); i < binOf(to, RATE, BINS); i++) s[i] = value
  return s
}

describe('анализ спектра', () => {
  it('переводит частоту в номер ячейки', () => {
    expect(binOf(0, RATE, BINS)).toBe(0)
    expect(binOf(24000, RATE, BINS)).toBe(BINS - 1)
    expect(binOf(1000, RATE, BINS)).toBe(43)
  })

  it('считает уровень полосы', () => {
    const bass = spectrumWith(20, 150)
    expect(bandLevel(bass, RATE, [20, 150])).toBeCloseTo(1, 1)
    expect(bandLevel(bass, RATE, [2000, 12000])).toBe(0)
  })

  it('сглаживает: быстро вверх, медленно вниз', () => {
    expect(follow(0, 1, 0.5, 0.1)).toBe(0.5)
    expect(follow(1, 0, 0.5, 0.1)).toBeCloseTo(0.9)
  })

  it('сжимает спектр в логарифмические полосы: басы получают первые полосы', () => {
    const bands = logBands(spectrumWith(30, 120), RATE, 16)
    expect(bands[0]).toBeGreaterThan(0.5)
    expect(bands[15]).toBe(0)
  })

  it('считает громкость по форме волны', () => {
    expect(rms(new Uint8Array(64).fill(128))).toBe(0)
    const square = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 1))
    expect(rms(square)).toBeGreaterThan(0.95)
  })
})

describe('детектор долей', () => {
  it('находит удары бочки и пропускает ровный фон', () => {
    const d = new BeatDetector()
    let beats = 0
    // 3 секунды при 60 fps, удар каждые 500 мс (120 BPM).
    for (let frame = 0; frame < 180; frame++) {
      const t = frame * (1000 / 60)
      const hit = frame % 30 < 3
      if (d.update(hit ? 0.9 : 0.3, t)) beats++
    }
    expect(beats).toBeGreaterThanOrEqual(5)
    expect(beats).toBeLessThanOrEqual(6)
  })

  it('молчит в тишине, а на ровном громком звуке срабатывает не больше раза — на вступлении', () => {
    const d = new BeatDetector()
    let silent = 0
    let steady = 0
    for (let f = 0; f < 60; f++) silent += Number(d.update(0, f * 16))
    for (let f = 60; f < 180; f++) steady += Number(d.update(0.8, f * 16))
    expect(silent).toBe(0)
    expect(steady).toBeLessThanOrEqual(1)
  })

  it('не срабатывает чаще, чем позволяет пауза', () => {
    const d = new BeatDetector(1.2, 240)
    for (let f = 0; f < 20; f++) d.update(0.2, f * 16)
    expect(d.update(0.9, 400)).toBe(true)
    expect(d.update(0.95, 500)).toBe(false)
  })
})
