// Демо-трек как данные: темп, аккорды, аранжировка и партии по шагам.
// Синтезатор (synth.ts) только спрашивает «что играет на шаге N» и
// озвучивает ответ. Музыка отделена от звука — её можно проверить тестами.
//
// Шаг — шестнадцатая доля: 16 шагов в такте, 4 шага на удар бочки.

export const BPM = 118
export const STEPS_PER_BAR = 16
/** Длина шага в секундах. */
export const STEP = 60 / BPM / 4
/** Длина всей композиции в тактах, дальше она повторяется. */
export const SONG_BARS = 32

export type Instrument = 'kick' | 'clap' | 'hat' | 'openHat' | 'bass' | 'pad' | 'arp'

export type NoteEvent = {
  instrument: Instrument
  /** Нота MIDI (69 = ля первой октавы, 440 Гц); у ударных не нужна. */
  midi?: number
  /** Громкость 0…1. */
  velocity: number
  /** Длительность в шагах. */
  length: number
}

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** Аккорды ля минора: Am – F – C – G, по два такта на аккорд. Ноты — MIDI. */
export const CHORDS: { name: string; notes: [number, number, number] }[] = [
  { name: 'Am', notes: [57, 60, 64] },
  { name: 'F', notes: [53, 57, 60] },
  { name: 'C', notes: [48, 52, 55] },
  { name: 'G', notes: [55, 59, 62] },
]

export const chordAt = (bar: number) => CHORDS[Math.floor(bar / 2) % CHORDS.length]

export type Section = 'intro' | 'drop' | 'break' | 'drop2'

/** Часть композиции по номеру такта. */
export function sectionAt(bar: number): Section {
  const b = bar % SONG_BARS
  if (b < 4) return 'intro'
  if (b < 16) return 'drop'
  if (b < 20) return 'break'
  return 'drop2'
}

// Порядок нот арпеджио: индексы в [тоника, терция, квинта, тоника + октава].
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 1, 3, 2]

/** Что звучит на шаге `step` (счёт с начала воспроизведения). */
export function eventsAt(step: number): NoteEvent[] {
  const bar = Math.floor(step / STEPS_PER_BAR)
  const s = step % STEPS_PER_BAR
  const section = sectionAt(bar)
  const chord = chordAt(bar)
  const root = chord.notes[0]
  const drums = section === 'drop' || section === 'drop2'
  const out: NoteEvent[] = []

  // Бочка «четыре на пол». В последнем такте перед дропом — пауза для напряжения.
  const fillBar = bar % SONG_BARS === 19 || bar % SONG_BARS === 3
  if (drums && s % 4 === 0) out.push({ instrument: 'kick', velocity: 1, length: 1 })
  // В конце вступления и брейка бочка «разгоняется» шестнадцатыми — подводка к дропу.
  if (fillBar && s >= 8) out.push({ instrument: 'kick', velocity: 0.35 + (s - 8) * 0.08, length: 1 })

  if (drums && (s === 4 || s === 12)) out.push({ instrument: 'clap', velocity: 0.9, length: 1 })

  // Хэты: на слабые доли, во втором дропе — ещё и шестнадцатые потише.
  if (s % 4 === 2) out.push({ instrument: drums ? 'openHat' : 'hat', velocity: drums ? 0.55 : 0.3, length: 1 })
  if (section === 'drop2' && s % 2 === 1) out.push({ instrument: 'hat', velocity: 0.22, length: 1 })

  // Бас между ударами бочки — «качающий» транс-бас; в брейке тянет тонику.
  if (drums && s % 4 === 2) out.push({ instrument: 'bass', midi: root - 24 + (s === 14 ? 12 : 0), velocity: 0.9, length: 2 })
  if (section === 'break' && s === 0) out.push({ instrument: 'bass', midi: root - 24, velocity: 0.5, length: 16 })

  // Пэд — аккорд на каждую смену гармонии.
  if (s === 0 && bar % 2 === 0) {
    for (const midi of chord.notes) out.push({ instrument: 'pad', midi, velocity: 0.5, length: STEPS_PER_BAR * 2 })
  }

  // Арпеджио шестнадцатыми (во вступлении — восьмыми).
  if (section !== 'intro' || s % 2 === 0) {
    const tones = [...chord.notes, root + 12]
    out.push({ instrument: 'arp', midi: tones[ARP[s]] + 12, velocity: section === 'break' ? 0.6 : 0.45, length: 1 })
  }
  return out
}
