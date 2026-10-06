// Аудио-движок: один AudioContext на всё приложение, анализатор и три
// источника звука. Граф Web Audio:
//
//   демо-синтезатор ─┐
//   <audio> (файл) ──┼─→ input ─→ analyser ─→ volume ─→ динамики
//   микрофон ────────┘      (микрофон — только в analyser, не в динамики:
//                            иначе звук из колонок попадал бы обратно в микрофон)
//
// Браузер разрешает запускать звук только после действия пользователя
// (клик, клавиша), поэтому контекст создаётся лениво — при первом выборе
// источника.

import { BeatDetector, bandLevel, BANDS, follow, logBands, rms } from './analysis'
import { levels, SPECTRUM_BANDS } from './levels'
import { DemoSynth } from './synth'

export type Source = 'demo' | 'file' | 'mic'

class AudioEngine {
  private ctx: AudioContext | null = null
  private analyser!: AnalyserNode
  private input!: GainNode
  private volume!: GainNode
  private synth: DemoSynth | null = null
  private media: HTMLAudioElement | null = null
  private mediaNode: MediaElementAudioSourceNode | null = null
  private mic: MediaStream | null = null
  private micNode: MediaStreamAudioSourceNode | null = null
  private objectUrl = ''
  private freq = new Uint8Array(0)
  private wave = new Uint8Array(0)
  private bands = new Float32Array(SPECTRUM_BANDS)
  private detector = new BeatDetector()
  source: Source | null = null

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx
    const ctx = new AudioContext()
    this.input = ctx.createGain()
    this.analyser = ctx.createAnalyser()
    // 2048 точек: 1024 полосы шириной ~23 Гц — хватает, чтобы различить басы.
    this.analyser.fftSize = 2048
    // Своё сглаживание (follow) делаем сами, у анализатора — лёгкое.
    this.analyser.smoothingTimeConstant = 0.6
    this.volume = ctx.createGain()
    this.input.connect(this.analyser).connect(this.volume).connect(ctx.destination)
    this.freq = new Uint8Array(this.analyser.frequencyBinCount)
    this.wave = new Uint8Array(this.analyser.fftSize)
    this.ctx = ctx
    return ctx
  }

  /** Остановить текущий источник (но не закрывать контекст). */
  private stopAll(): void {
    this.synth?.stop()
    this.media?.pause()
    this.micNode?.disconnect()
    this.mic?.getTracks().forEach((t) => t.stop())
    this.mic = null
    this.micNode = null
    this.detector.reset()
  }

  /** Полностью остановить звук и отпустить микрофон (возврат на стартовый экран). */
  stop(): void {
    this.stopAll()
    this.source = null
  }

  async playDemo(): Promise<void> {
    const ctx = this.ensure()
    await ctx.resume()
    this.stopAll()
    this.synth ??= new DemoSynth(ctx, this.input)
    this.synth.start()
    this.source = 'demo'
  }

  /** Файл пользователя: играет через <audio> — так работают перемотка и длительность. */
  async playFile(file: File): Promise<HTMLAudioElement> {
    const ctx = this.ensure()
    await ctx.resume()
    this.stopAll()
    if (!this.media) {
      this.media = new Audio()
      this.media.crossOrigin = 'anonymous'
      // MediaElementSource можно создать для элемента только один раз —
      // поэтому <audio> один, а меняется только его src.
      this.mediaNode = ctx.createMediaElementSource(this.media)
      this.mediaNode.connect(this.input)
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = URL.createObjectURL(file)
    this.media.src = this.objectUrl
    await this.media.play()
    this.source = 'file'
    return this.media
  }

  async playMic(): Promise<void> {
    const ctx = this.ensure()
    await ctx.resume()
    // Запрос доступа — до остановки текущего звука: если пользователь
    // откажет, музыка продолжит играть.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    })
    this.stopAll()
    this.mic = stream
    this.micNode = ctx.createMediaStreamSource(stream)
    this.micNode.connect(this.analyser)
    this.source = 'mic'
  }

  /** Пауза/продолжение. Для микрофона — останавливается анализ (контекст на паузе). */
  async toggle(): Promise<boolean> {
    if (!this.ctx || !this.source) return false
    if (this.source === 'demo') {
      if (this.synth?.playing) this.synth.stop()
      else this.synth?.start()
      return !!this.synth?.playing
    }
    if (this.source === 'file' && this.media) {
      if (this.media.paused) await this.media.play()
      else this.media.pause()
      return !this.media.paused
    }
    if (this.ctx.state === 'running') await this.ctx.suspend()
    else await this.ctx.resume()
    return this.ctx.state === 'running'
  }

  setVolume(value: number): void {
    if (this.ctx) this.volume.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02)
  }

  get element(): HTMLAudioElement | null {
    return this.media
  }

  /** Время для демо-трека (у файла время берётся из <audio>). */
  demoElapsed(): number {
    return this.synth?.elapsed() ?? 0
  }

  get isPlaying(): boolean {
    if (!this.ctx || !this.source) return false
    if (this.source === 'demo') return !!this.synth?.playing
    if (this.source === 'file') return !!this.media && !this.media.paused
    return this.ctx.state === 'running'
  }

  /**
   * Снять показания для текущего кадра и записать их в `levels`.
   * Вызывается из useFrame каждый кадр (см. scenes/AudioPump.tsx).
   * Возвращает false, если звука нет и сцена должна «дышать» сама.
   */
  sample(nowMs: number, dt: number): boolean {
    if (!this.ctx || !this.isPlaying) {
      levels.active = false
      return false
    }
    this.analyser.getByteFrequencyData(this.freq)
    this.analyser.getByteTimeDomainData(this.wave)
    const rate = this.ctx.sampleRate
    // Коэффициенты сглаживания пересчитаны на длительность кадра: при 120 и
    // 60 fps анимация выглядит одинаково.
    const k = Math.min(1, dt * 60)
    levels.bass = follow(levels.bass, bandLevel(this.freq, rate, BANDS.bass), 0.6 * k, 0.12 * k)
    levels.mid = follow(levels.mid, bandLevel(this.freq, rate, BANDS.mid), 0.5 * k, 0.1 * k)
    levels.treble = follow(levels.treble, bandLevel(this.freq, rate, BANDS.treble) * 1.6, 0.5 * k, 0.1 * k)
    levels.volume = follow(levels.volume, rms(this.wave) * 2.2, 0.5 * k, 0.08 * k)
    logBands(this.freq, rate, SPECTRUM_BANDS, this.bands)
    for (let i = 0; i < SPECTRUM_BANDS; i++) {
      levels.spectrum[i] = follow(levels.spectrum[i], this.bands[i], 0.7 * k, 0.15 * k)
    }
    levels.beat = this.detector.update(bandLevel(this.freq, rate, [30, 110]), nowMs)
    if (levels.beat) {
      levels.pulse = 1
      levels.beats++
    } else {
      levels.pulse = Math.max(0, levels.pulse - dt * 3.2)
    }
    levels.active = true
    return true
  }
}

export const audio = new AudioEngine()
