import { useEffect, useRef, useState } from 'react'
import { Stage } from '@/scenes/Stage'
import { SCENES, usePlayer } from '@/store/player'
import { Player } from '@/ui/Player'
import { Start } from '@/ui/Start'
import { useIdle } from '@/ui/useIdle'
import { useShortcuts } from '@/ui/useShortcuts'

export function App() {
  const { source, playing, uiHidden, scene, error, playFile, setUiHidden } = usePlayer()
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  useShortcuts()
  // Во время музыки интерфейс и курсор прячутся через 3 секунды покоя.
  const idle = useIdle(3000, playing)
  const hidden = uiHidden || idle

  // Файл можно бросить в любое место окна.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) void usePlayer.getState().playFile(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  const sceneTitle = SCENES.find((s) => s.id === scene)!.title

  return (
    <div className="app" data-hidden={hidden || undefined}>
      <Stage />
      {/* Короткая вспышка-затемнение при смене сцены (ключ перезапускает анимацию). */}
      <div key={scene} className="scene-flash" aria-hidden="true">
        <span>{sceneTitle}</span>
      </div>

      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Резонанс — в начало">
          <span className="brand__mark" aria-hidden="true" />
          Резонанс
        </a>
        <a className="topbar__link" href="https://github.com/dmitriy9427/resonance" target="_blank" rel="noreferrer">
          Код на GitHub
        </a>
      </header>

      <main className="overlay">
        {source ? <Player /> : <Start onPickFile={() => fileInput.current?.click()} />}
      </main>

      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void playFile(file)
          e.target.value = ''
        }}
      />

      {uiHidden && (
        <button type="button" className="show-ui" onClick={() => setUiHidden(false)}>
          Показать интерфейс <kbd>H</kbd>
        </button>
      )}

      {dragging && (
        <div className="dropzone" aria-hidden="true">
          <p>Отпустите файл — и он зазвучит</p>
        </div>
      )}

      <p className="toast" role="status" aria-live="polite">
        {error}
      </p>
    </div>
  )
}
