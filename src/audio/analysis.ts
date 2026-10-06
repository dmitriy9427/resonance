// Анализ звука: из «сырого» спектра AnalyserNode получаем то, на что
// удобно реагировать графике, — громкость басов, середины и верхов,
// доли (удары бочки) и сжатый спектр из N полос.
//
// Всё здесь — чистые функции и маленькие классы без Web Audio, поэтому
// проверяются обычными тестами на подставных массивах.

/** Границы полос в герцах. */
export const BANDS = {
  bass: [20, 150],
  mid: [150, 2000],
  treble: [2000, 12000],
} as const

export type Band = keyof typeof BANDS

/** Индекс ячейки спектра для частоты: ячейки идут равномерно от 0 до sampleRate / 2. */
export function binOf(hz: number, sampleRate: number, binCount: number): number {
  const nyquist = sampleRate / 2
  return Math.min(binCount - 1, Math.max(0, Math.round((hz / nyquist) * binCount)))
}

/** Средняя громкость полосы частот, 0…1. spectrum — getByteFrequencyData (0…255). */
export function bandLevel(spectrum: ArrayLike<number>, sampleRate: number, [from, to]: readonly [number, number]): number {
  const a = binOf(from, sampleRate, spectrum.length)
  const b = Math.max(a + 1, binOf(to, sampleRate, spectrum.length))
  let sum = 0
  for (let i = a; i < b; i++) sum += spectrum[i]
  return sum / (b - a) / 255
}

/**
 * Сглаживание с разной скоростью: подъём быстрый (attack), спад медленный
 * (release). Так картинка мгновенно реагирует на удар, но не дёргается,
 * а плавно «остывает» — как стрелка аналогового индикатора.
 */
export function follow(prev: number, next: number, attack: number, release: number): number {
  const k = next > prev ? attack : release
  return prev + (next - prev) * k
}

/**
 * Спектр, сжатый до `count` полос с логарифмическим шагом. Слух
 * логарифмический: октава 50–100 Гц звучит так же «широко», как 5–10 кГц,
 * а в линейном спектре басы заняли бы пару ячеек из тысячи.
 */
export function logBands(
  spectrum: ArrayLike<number>,
  sampleRate: number,
  count: number,
  out = new Float32Array(count),
  minHz = 30,
  maxHz = 14000,
): Float32Array {
  const ratio = maxHz / minHz
  for (let i = 0; i < count; i++) {
    const from = minHz * ratio ** (i / count)
    const to = minHz * ratio ** ((i + 1) / count)
    out[i] = bandLevel(spectrum, sampleRate, [from, to])
  }
  return out
}

/** Громкость сигнала по форме волны (RMS), 0…1. waveform — getByteTimeDomainData (128 = тишина). */
export function rms(waveform: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < waveform.length; i++) {
    const v = (waveform[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / waveform.length)
}

/**
 * Детектор долей по басу. Доля — когда энергия баса заметно выше её
 * среднего за последнюю секунду. Сравнение со средним, а не с порогом,
 * делает детектор независимым от громкости трека.
 */
export class BeatDetector {
  private history: number[] = []
  private lastBeat = -Infinity
  private prev = 0

  constructor(
    /** Во сколько раз энергия должна превысить среднее. */
    private sensitivity = 1.35,
    /** Минимальная пауза между долями, мс (240 мс = до 250 BPM). */
    private cooldown = 240,
    /** Размер истории в кадрах (~1 с при 60 fps). */
    private size = 60,
    /** Ниже этого уровня — тишина, долей нет. */
    private floor = 0.15,
  ) {}

  /** Передать уровень баса текущего кадра; вернёт true, если это доля. */
  update(bass: number, now: number): boolean {
    const avg = this.history.length ? this.history.reduce((a, b) => a + b, 0) / this.history.length : bass
    this.history.push(bass)
    if (this.history.length > this.size) this.history.shift()
    // Удар — это всплеск: энергия должна расти прямо сейчас. Без этого
    // условия резкий переход тишина → громко давал серию ложных долей,
    // пока среднее «догоняло» новый уровень.
    const rising = bass > this.prev + 0.02
    this.prev = bass
    const isBeat =
      rising &&
      this.history.length > 10 &&
      bass > this.floor &&
      bass > avg * this.sensitivity &&
      now - this.lastBeat > this.cooldown
    if (isBeat) this.lastBeat = now
    return isBeat
  }

  reset(): void {
    this.history = []
    this.lastBeat = -Infinity
    this.prev = 0
  }
}
