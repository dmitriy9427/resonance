import { describe, expect, it } from 'vitest'
import { idleLevels, levels } from '@/audio/levels'
import { isAudioFile, trackTitle } from '@/store/player'
import { commandFor, formatTime } from './keys'

describe('интерфейс', () => {
  it('сопоставляет клавиши командам (по коду клавиши — в любой раскладке)', () => {
    expect(commandFor('Space')).toBe('toggle')
    expect(commandFor('Digit2')).toBe('scene2')
    expect(commandFor('KeyH')).toBe('hide')
    expect(commandFor('KeyQ')).toBeNull()
  })

  it('форматирует время', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(75.9)).toBe('1:15')
    expect(formatTime(NaN)).toBe('—')
    expect(formatTime(Infinity)).toBe('—')
  })

  it('узнаёт аудиофайлы по типу или расширению', () => {
    expect(isAudioFile(new File([], 'song.mp3'))).toBe(true)
    expect(isAudioFile(new File([], 'x', { type: 'audio/ogg' }))).toBe(true)
    expect(isAudioFile(new File([], 'photo.jpg', { type: 'image/jpeg' }))).toBe(false)
  })

  it('делает название трека из имени файла', () => {
    expect(trackTitle('Artist - Song_Name.mp3')).toBe('Artist — Song Name')
  })

  it('«дыхание» без музыки остаётся в пределах 0…1', () => {
    for (let t = 0; t < 20; t += 0.37) {
      idleLevels(t, levels)
      for (const v of [levels.bass, levels.mid, levels.treble, ...levels.spectrum]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
})
