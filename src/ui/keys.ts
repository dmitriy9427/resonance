// Горячие клавиши. Отображение «клавиша → команда» — чистая функция,
// поэтому её легко проверить и показать в подсказке.

export type Command = 'toggle' | 'scene1' | 'scene2' | 'scene3' | 'next' | 'prev' | 'fullscreen' | 'hide' | 'mute'

export const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'Пробел', label: 'пауза' },
  { keys: '1 2 3', label: 'сцены' },
  { keys: '← →', label: 'листать сцены' },
  { keys: 'F', label: 'весь экран' },
  { keys: 'H', label: 'скрыть интерфейс' },
  { keys: 'M', label: 'без звука' },
]

/** e.code, а не e.key: клавиши работают и в русской раскладке (H = Р). */
export function commandFor(code: string): Command | null {
  switch (code) {
    case 'Space':
      return 'toggle'
    case 'Digit1':
    case 'Numpad1':
      return 'scene1'
    case 'Digit2':
    case 'Numpad2':
      return 'scene2'
    case 'Digit3':
    case 'Numpad3':
      return 'scene3'
    case 'ArrowRight':
      return 'next'
    case 'ArrowLeft':
      return 'prev'
    case 'KeyF':
      return 'fullscreen'
    case 'KeyH':
      return 'hide'
    case 'KeyM':
      return 'mute'
    default:
      return null
  }
}

/** 75 → «1:15», NaN/Infinity → «—». */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
