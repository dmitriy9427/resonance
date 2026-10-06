// Иконки плеера: штрихи 24×24, цвет — currentColor.
const PATHS = {
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  volume: 'M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12',
  mute: 'M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  back: 'M15 18l-6-6 6-6',
  wave: 'M3 12h2l2-6 3 12 3-15 3 15 2-6h3',
  file: 'M14 3H6v18h12V7zM14 3v4h4M10 17a2 2 0 1 1 0-.01M12 15V10l3 1',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4M8 21h8',
} as const

export type IconName = keyof typeof PATHS

const FILLED = new Set<IconName>(['play', 'pause'])

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const filled = FILLED.has(name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
