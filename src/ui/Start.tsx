import { usePlayer } from '@/store/player'
import { Icon } from './Icon'
import { SHORTCUTS } from './keys'

/** Стартовый экран: выбор источника звука. Сцена уже «дышит» на фоне. */
export function Start({ onPickFile }: { onPickFile: () => void }) {
  const playDemo = usePlayer((s) => s.playDemo)
  const playMic = usePlayer((s) => s.playMic)
  return (
    <section className="start" aria-labelledby="start-title">
      <p className="start__eyebrow">Музыкальный визуализатор</p>
      <h1 id="start-title" className="start__title">
        Резонанс
      </h1>
      <p className="start__lead">
        Включите музыку — и она станет светом. Бас качает поверхность, ритм вспыхивает, верхние частоты рассыпаются
        звёздами.
      </p>
      <div className="start__sources">
        <button type="button" className="source source--main" onClick={() => void playDemo()}>
          <Icon name="wave" size={26} />
          <span>
            <b>Демо-трек</b>
            <small>синтезируется прямо в браузере</small>
          </span>
        </button>
        <button type="button" className="source" onClick={onPickFile}>
          <Icon name="file" size={26} />
          <span>
            <b>Свой файл</b>
            <small>или перетащите его в окно</small>
          </span>
        </button>
        <button type="button" className="source" onClick={() => void playMic()}>
          <Icon name="mic" size={26} />
          <span>
            <b>Микрофон</b>
            <small>звук вокруг вас</small>
          </span>
        </button>
      </div>
      <ul className="start__keys" aria-label="Горячие клавиши">
        {SHORTCUTS.map((s) => (
          <li key={s.keys}>
            <kbd>{s.keys}</kbd> {s.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
