// Синтезатор демо-трека на Web Audio API: ни одного звукового файла,
// каждый удар и нота собираются из осцилляторов и шума в момент игры.
//
// Планирование — по схеме «двух часов» (статья «A Tale of Two Clocks»):
// таймер JS тикает каждые 25 мс и заранее, с запасом 120 мс, ставит ноты
// в очередь по часам аудиоконтекста (ctx.currentTime). Таймеры JS неточны,
// а часы звуковой карты — точны, поэтому ритм не «плывёт», даже если
// вкладка занята отрисовкой 3D.

import { eventsAt, midiToHz, STEP, type NoteEvent } from './song'

const LOOKAHEAD = 0.12
const TICK_MS = 25

export class DemoSynth {
  private timer = 0
  private step = 0
  private nextTime = 0
  private readonly noise: AudioBuffer
  private readonly out: GainNode
  private readonly padBus: GainNode
  private readonly fx: GainNode

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.noise = makeNoise(ctx)
    // Общий выход синтезатора → компрессор «склеивает» партии в один звук.
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    comp.attack.value = 0.005
    comp.release.value = 0.15
    this.out = ctx.createGain()
    this.out.gain.value = 0.8
    this.out.connect(comp).connect(destination)

    // Эффекты: эхо в такт (3/16) и реверберация из сгенерированного импульса.
    this.fx = ctx.createGain()
    const delay = ctx.createDelay(1)
    delay.delayTime.value = STEP * 3
    const feedback = ctx.createGain()
    feedback.gain.value = 0.38
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 2600
    this.fx.connect(delay).connect(damp).connect(feedback).connect(delay)
    damp.connect(this.out)
    const reverb = ctx.createConvolver()
    reverb.buffer = makeImpulse(ctx, 2.8)
    const reverbGain = ctx.createGain()
    reverbGain.gain.value = 0.5
    this.fx.connect(reverb).connect(reverbGain).connect(this.out)

    // Пэд идёт через отдельную шину: её «приглушает» каждый удар бочки
    // (sidechain) — отсюда характерное «дыхание» электронной музыки.
    this.padBus = ctx.createGain()
    this.padBus.connect(this.out)
    this.padBus.connect(this.fx)
  }

  start(): void {
    this.stop()
    this.step = 0
    this.nextTime = this.ctx.currentTime + 0.05
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
    this.tick()
  }

  stop(): void {
    clearInterval(this.timer)
    this.timer = 0
  }

  get playing(): boolean {
    return this.timer !== 0
  }

  /** Секунды с начала трека — для индикатора времени. */
  elapsed(): number {
    return Math.max(0, this.step * STEP - (this.nextTime - this.ctx.currentTime))
  }

  private tick(): void {
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      for (const event of eventsAt(this.step)) this.play(event, this.nextTime)
      this.nextTime += STEP
      this.step++
    }
  }

  private play(e: NoteEvent, t: number): void {
    switch (e.instrument) {
      case 'kick':
        return this.kick(t, e.velocity)
      case 'clap':
        return this.clap(t, e.velocity)
      case 'hat':
        return this.hat(t, e.velocity, 0.045)
      case 'openHat':
        return this.hat(t, e.velocity, 0.16)
      case 'bass':
        return this.bass(t, e)
      case 'pad':
        return this.pad(t, e)
      case 'arp':
        return this.arp(t, e)
    }
  }

  /** Бочка: синус, частота которого падает со 150 до 42 Гц. */
  private kick(t: number, v: number): void {
    const { ctx } = this
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    gain.gain.setValueAtTime(v, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
    osc.connect(gain).connect(this.out)
    osc.start(t)
    osc.stop(t + 0.5)
    // Sidechain: пэд проседает и за четверть секунды возвращается.
    this.padBus.gain.cancelScheduledValues(t)
    this.padBus.gain.setValueAtTime(0.25, t)
    this.padBus.gain.linearRampToValueAtTime(1, t + 0.28)
  }

  /** Клэп: шум через полосовой фильтр, три быстрых «хлопка» и хвост. */
  private clap(t: number, v: number): void {
    const { ctx } = this
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1500
    band.Q.value = 0.9
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    for (const offset of [0, 0.012, 0.024]) {
      gain.gain.setValueAtTime(v * 0.9, t + offset)
      gain.gain.exponentialRampToValueAtTime(0.1, t + offset + 0.01)
    }
    gain.gain.setValueAtTime(v * 0.7, t + 0.035)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
    src.connect(band).connect(gain).connect(this.out)
    gain.connect(this.fx)
    src.start(t, Math.random())
    src.stop(t + 0.25)
  }

  /** Хэт: высокочастотный шум; открытый звучит дольше. */
  private hat(t: number, v: number, decay: number): void {
    const { ctx } = this
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7500
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(v * 0.35, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + decay)
    src.connect(hp).connect(gain).connect(this.out)
    src.start(t, Math.random())
    src.stop(t + decay + 0.02)
  }

  /** Бас: пила через фильтр, который «закрывается» после удара — звук «вау». */
  private bass(t: number, e: NoteEvent): void {
    const { ctx } = this
    const dur = e.length * STEP
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = midiToHz(e.midi!)
    const sub = ctx.createOscillator()
    sub.frequency.value = midiToHz(e.midi! - 12)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 6
    lp.frequency.setValueAtTime(1400, t)
    lp.frequency.exponentialRampToValueAtTime(180, t + dur * 0.8)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(e.velocity * 0.4, t + 0.008)
    gain.gain.setTargetAtTime(0, t + dur * 0.7, 0.03)
    osc.connect(lp)
    sub.connect(lp)
    lp.connect(gain).connect(this.out)
    for (const o of [osc, sub]) {
      o.start(t)
      o.stop(t + dur + 0.2)
    }
  }

  /** Пэд: три расстроенные пилы на ноту — «широкий» мягкий аккорд с медленной атакой. */
  private pad(t: number, e: NoteEvent): void {
    const { ctx } = this
    const dur = e.length * STEP
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(700, t)
    lp.frequency.linearRampToValueAtTime(1800, t + dur * 0.6)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(e.velocity * 0.07, t + 0.8)
    gain.gain.setValueAtTime(e.velocity * 0.07, t + dur - 0.3)
    gain.gain.linearRampToValueAtTime(0, t + dur + 0.4)
    lp.connect(gain).connect(this.padBus)
    for (const detune of [-12, 0, 11]) {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = midiToHz(e.midi!)
      osc.detune.value = detune
      osc.connect(lp)
      osc.start(t)
      osc.stop(t + dur + 0.5)
    }
  }

  /** Арпеджио: короткий «стеклянный» треугольник с октавным призвуком, в эхо. */
  private arp(t: number, e: NoteEvent): void {
    const { ctx } = this
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(e.velocity * 0.14, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
    gain.connect(this.out)
    gain.connect(this.fx)
    for (const [type, mult] of [
      ['triangle', 1],
      ['sine', 2],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = midiToHz(e.midi!) * mult
      osc.connect(gain)
      osc.start(t)
      osc.stop(t + 0.25)
    }
  }
}

/** Секунда белого шума — из неё получаются клэп и хэты. */
function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** Импульс для реверберации: стерео-шум, затухающий по экспоненте. */
function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
  }
  return buffer
}
