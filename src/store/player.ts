// Состояние интерфейса: что играет, какая сцена, громкость, скрыт ли UI.
// Здесь только то, что меняется редко и должно перерисовывать кнопки.
// Уровни звука (60 раз в секунду) живут отдельно — в audio/levels.ts.

import { create } from 'zustand'
import { audio, type Source } from '@/audio/engine'

export type SceneId = 'sphere' | 'galaxy' | 'terrain'

export const SCENES: { id: SceneId; title: string; key: string }[] = [
  { id: 'sphere', title: 'Пульс', key: '1' },
  { id: 'galaxy', title: 'Галактика', key: '2' },
  { id: 'terrain', title: 'Горизонт', key: '3' },
]

type PlayerState = {
  source: Source | null
  playing: boolean
  track: string
  scene: SceneId
  volume: number
  muted: boolean
  uiHidden: boolean
  error: string
  playDemo: () => Promise<void>
  playFile: (file: File) => Promise<void>
  playMic: () => Promise<void>
  toggle: () => Promise<void>
  setScene: (scene: SceneId) => void
  nextScene: (step?: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setUiHidden: (hidden: boolean) => void
  stop: () => void
}

const AUDIO_TYPES = /^audio\/|\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm)$/i

/** Похоже ли на звуковой файл (по типу или расширению — у некоторых файлов тип пустой). */
export const isAudioFile = (file: File) => AUDIO_TYPES.test(file.type) || AUDIO_TYPES.test(file.name)

/** «Artist - Song.mp3» → «Artist — Song». */
export const trackTitle = (name: string) =>
  name
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+-\s+/g, ' — ')
    .trim()

export const usePlayer = create<PlayerState>((set, get) => {
  const fail = (error: unknown, fallback: string) => {
    const name = error instanceof DOMException ? error.name : ''
    const message =
      name === 'NotAllowedError'
        ? 'Нет доступа к микрофону — разрешите его в настройках сайта'
        : name === 'NotFoundError'
          ? 'Микрофон не найден'
          : name === 'NotSupportedError'
            ? 'Браузер не умеет играть этот формат'
            : fallback
    set({ error: message })
    setTimeout(() => get().error === message && set({ error: '' }), 5000)
  }

  return {
    source: null,
    playing: false,
    track: '',
    scene: 'sphere',
    volume: 0.8,
    muted: false,
    uiHidden: false,
    error: '',

    playDemo: async () => {
      await audio.playDemo()
      audio.setVolume(get().muted ? 0 : get().volume)
      set({ source: 'demo', playing: true, track: 'Демо-трек «Резонанс»', error: '' })
    },

    playFile: async (file) => {
      if (!isAudioFile(file)) {
        fail(null, 'Это не похоже на аудиофайл')
        return
      }
      try {
        const el = await audio.playFile(file)
        audio.setVolume(get().muted ? 0 : get().volume)
        el.onplay = () => set({ playing: true })
        el.onpause = () => set({ playing: false })
        set({ source: 'file', playing: true, track: trackTitle(file.name), error: '' })
      } catch (error) {
        fail(error, 'Не удалось воспроизвести файл')
      }
    },

    playMic: async () => {
      try {
        await audio.playMic()
        set({ source: 'mic', playing: true, track: 'Микрофон', error: '' })
      } catch (error) {
        fail(error, 'Не удалось включить микрофон')
      }
    },

    toggle: async () => {
      if (!get().source) return get().playDemo()
      set({ playing: await audio.toggle() })
    },

    setScene: (scene) => set({ scene }),
    nextScene: (step = 1) => {
      const i = SCENES.findIndex((s) => s.id === get().scene)
      set({ scene: SCENES[(i + step + SCENES.length) % SCENES.length].id })
    },

    setVolume: (volume) => {
      audio.setVolume(volume)
      set({ volume, muted: false })
    },
    toggleMute: () => {
      const muted = !get().muted
      audio.setVolume(muted ? 0 : get().volume)
      set({ muted })
    },

    setUiHidden: (uiHidden) => set({ uiHidden }),

    stop: () => {
      audio.stop()
      set({ source: null, playing: false, track: '' })
    },
  }
})
