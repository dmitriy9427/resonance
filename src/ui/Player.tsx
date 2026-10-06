import { useEffect, useState } from 'react'
import { audio } from '@/audio/engine'
import { SCENES, usePlayer } from '@/store/player'
import { Icon, type IconName } from './Icon'
import { formatTime } from './keys'
import { MiniSpectrum } from './MiniSpectrum'
import { toggleFullscreen } from './useShortcuts'

/** Время и длительность: для файла — из <audio>, для демо — из синтезатора. 4 раза в секунду хватает. */
function useClock(source: string | null) {
  const [clock, setClock] = useState({ current: 0, duration: NaN })
  useEffect(() => {
    const id = setInterval(() => {
      const el = audio.element
      if (source === 'file' && el) setClock({ current: el.currentTime, duration: el.duration })
      else if (source === 'demo') setClock({ current: audio.demoElapsed(), duration: NaN })
    }, 250)
    return () => clearInterval(id)
  }, [source])
  return clock
}

/**
 * Кнопка-иконка с подсказкой. На компьютере подсказка всплывает при
 * наведении и фокусе с клавиатуры (вместе с горячей клавишей), на телефоне
 * наведения нет — там под иконкой всегда видна короткая подпись.
 */
function ToolButton({
  icon,
  label,
  short,
  hotkey,
  onClick,
}: {
  icon: IconName
  label: string
  short: string
  hotkey?: string
  onClick: () => void
}) {
  return (
    <button type="button" className="tool" aria-label={label} aria-keyshortcuts={hotkey} onClick={onClick}>
      <Icon name={icon} />
      <span className="tool__caption" aria-hidden="true">
        {short}
      </span>
      <span className="tip" role="tooltip" aria-hidden="true">
        {label}
        {hotkey && <kbd>{hotkey}</kbd>}
      </span>
    </button>
  )
}

export function Player() {
  const { source, playing, track, scene, volume, muted } = usePlayer()
  const { toggle, setScene, setVolume, toggleMute, setUiHidden, stop } = usePlayer.getState()
  const { current, duration } = useClock(source)
  const seekable = source === 'file' && Number.isFinite(duration)

  return (
    <section className="player" aria-label="Плеер">
      <div className="player__main">
        <button
          type="button"
          className="player__play"
          aria-keyshortcuts="Space"
          aria-label={playing ? 'Пауза' : 'Играть'}
          onClick={() => void toggle()}
        >
          <Icon name={playing ? 'pause' : 'play'} size={22} />
          <span className="tip" role="tooltip" aria-hidden="true">
            {playing ? 'Пауза' : 'Играть'}
            <kbd>Пробел</kbd>
          </span>
        </button>
        <div className="player__info">
          <p className="player__track" title={track}>
            {source === 'mic' && <span className="player__live" aria-hidden="true" />}
            {track}
          </p>
          {seekable ? (
            <div className="player__seek">
              <span>{formatTime(current)}</span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={current}
                aria-label="Перемотка"
                style={{ '--fill': `${(current / duration) * 100}%` } as React.CSSProperties}
                onChange={(e) => {
                  if (audio.element) audio.element.currentTime = Number(e.target.value)
                }}
              />
              <span>{formatTime(duration)}</span>
            </div>
          ) : (
            <p className="player__time">{source === 'mic' ? 'в эфире' : formatTime(current)}</p>
          )}
        </div>
        <MiniSpectrum />
      </div>

      <div className="player__scenes" role="radiogroup" aria-label="Сцена">
        {SCENES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={scene === s.id}
            className="scene-tab"
            onClick={() => setScene(s.id)}
          >
            <kbd aria-hidden="true">{s.key}</kbd>
            {s.title}
          </button>
        ))}
      </div>

      <div className="player__tools">
        {source !== 'mic' && (
          <div className="volume">
            <ToolButton
              icon={muted || volume === 0 ? 'mute' : 'volume'}
              label={muted ? 'Включить звук' : 'Выключить звук'}
              short="Звук"
              hotkey="M"
              onClick={toggleMute}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              aria-label="Громкость"
              style={{ '--fill': `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </div>
        )}
        <ToolButton icon="eyeOff" label="Скрыть интерфейс" short="Скрыть" hotkey="H" onClick={() => setUiHidden(true)} />
        <ToolButton icon="fullscreen" label="Во весь экран" short="Экран" hotkey="F" onClick={toggleFullscreen} />
        <ToolButton icon="back" label="Выбрать другой источник звука" short="Источник" onClick={stop} />
      </div>
    </section>
  )
}
