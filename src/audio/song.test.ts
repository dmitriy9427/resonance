import { describe, expect, it } from 'vitest'
import { chordAt, eventsAt, midiToHz, sectionAt, SONG_BARS, STEPS_PER_BAR } from './song'

const bar = (n: number) => n * STEPS_PER_BAR
const has = (step: number, instrument: string) => eventsAt(step).some((e) => e.instrument === instrument)

describe('демо-трек', () => {
  it('переводит ноты в частоты', () => {
    expect(midiToHz(69)).toBe(440)
    expect(midiToHz(81)).toBe(880)
    expect(midiToHz(57)).toBe(220)
  })

  it('делится на части', () => {
    expect([0, 4, 16, 20, 31, 32].map(sectionAt)).toEqual(['intro', 'drop', 'break', 'drop2', 'drop2', 'intro'])
  })

  it('меняет аккорд каждые два такта по кругу', () => {
    expect([0, 2, 4, 6, 8].map((b) => chordAt(b).name)).toEqual(['Am', 'F', 'C', 'G', 'Am'])
  })

  it('во вступлении нет бочки, в дропе — «четыре на пол»', () => {
    expect(has(bar(1), 'kick')).toBe(false)
    const kicks = Array.from({ length: STEPS_PER_BAR }, (_, s) => has(bar(5) + s, 'kick'))
    expect(kicks.filter(Boolean)).toHaveLength(4)
    expect([0, 4, 8, 12].every((s) => kicks[s])).toBe(true)
  })

  it('бас играет между ударами бочки', () => {
    expect(has(bar(5) + 2, 'bass')).toBe(true)
    expect(has(bar(5), 'bass')).toBe(false)
  })

  it('пэд берёт аккорд на смене гармонии', () => {
    const pad = eventsAt(bar(4)).filter((e) => e.instrument === 'pad')
    expect(pad.map((e) => e.midi)).toEqual(chordAt(4).notes)
  })

  it('арпеджио играет только ноты текущего аккорда', () => {
    for (let s = 0; s < STEPS_PER_BAR * 8; s++) {
      const arp = eventsAt(bar(4) + s).find((e) => e.instrument === 'arp')
      if (!arp) continue
      const chord = chordAt(Math.floor((bar(4) + s) / STEPS_PER_BAR))
      const classes = chord.notes.map((n) => n % 12)
      expect(classes).toContain(arp.midi! % 12)
    }
  })

  it('повторяется через SONG_BARS тактов', () => {
    expect(eventsAt(bar(5) + 3)).toEqual(eventsAt(bar(5 + SONG_BARS) + 3))
  })
})
