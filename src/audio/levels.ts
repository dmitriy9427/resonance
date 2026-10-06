// Общий объект «что сейчас звучит». Его каждый кадр обновляет AudioPump,
// а сцены читают в useFrame.
//
// Почему не React-состояние: значения меняются 60 раз в секунду. Если
// класть их в useState или Zustand, React перерисовывал бы компоненты
// каждый кадр. Изменяемый объект вне React — обычная практика для
// анимации в React Three Fiber: «читай в useFrame, не рендери».

export const SPECTRUM_BANDS = 64

export type Levels = {
  /** Сглаженные уровни полос, 0…1. */
  bass: number
  mid: number
  treble: number
  /** Общая громкость (RMS), 0…1. */
  volume: number
  /** true только в кадре, где обнаружена доля. */
  beat: boolean
  /** Импульс доли: 1 в момент удара, дальше плавно затухает к 0. */
  pulse: number
  /** Сколько долей было с начала воспроизведения (для смены цвета и т. п.). */
  beats: number
  /** Спектр из SPECTRUM_BANDS логарифмических полос, 0…1. */
  spectrum: Float32Array
  /** Есть ли сейчас звук (иначе сцены показывают «дыхание» без музыки). */
  active: boolean
}

export const levels: Levels = {
  bass: 0,
  mid: 0,
  treble: 0,
  volume: 0,
  beat: false,
  pulse: 0,
  beats: 0,
  spectrum: new Float32Array(SPECTRUM_BANDS),
  active: false,
}

/**
 * «Дыхание» без музыки: на стартовом экране сцена живёт медленными волнами,
 * чтобы не стоять мёртвой картинкой. Чистая функция времени (секунды).
 */
export function idleLevels(t: number, out: Levels): void {
  out.bass = 0.25 + 0.15 * Math.sin(t * 0.9)
  out.mid = 0.2 + 0.1 * Math.sin(t * 0.6 + 1)
  out.treble = 0.12 + 0.08 * Math.sin(t * 1.3 + 2)
  out.volume = 0.15
  out.beat = false
  out.pulse *= 0.95
  for (let i = 0; i < out.spectrum.length; i++) {
    const x = i / out.spectrum.length
    out.spectrum[i] = Math.max(0, 0.35 * (1 - x) + 0.12 * Math.sin(t * 1.2 + x * 9) + 0.08 * Math.sin(t * 0.7 - x * 23))
  }
}
