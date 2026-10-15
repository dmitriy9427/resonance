# 2. Аудио-движок и кадр

[src/audio/engine.ts](../../src/audio/engine.ts), [levels.ts](../../src/audio/levels.ts),
`AudioPump` в [scenes/Stage.tsx](../../src/scenes/Stage.tsx).

## Где на экране

Стартовый экран: «Демо-трек», «Свой файл», «Микрофон». Плеер внизу: пауза, громкость. Сцена
«дышит» медленными волнами, пока звука нет, и оживает с музыкой.

## Граф Web Audio

```
демо-синтезатор ─┐
<audio> (файл) ──┼─→ input (Gain) ─→ analyser ─→ volume (Gain) ─→ динамики
микрофон ─────────────────────────→ analyser       (только в анализатор!)
```

Узлы соединяются `connect`, как гитара → педаль → усилитель. Анализатор стоит **до** громкости:
сцена реагирует на музыку одинаково, хоть ползунок громкости на нуле.

**Микрофон — только в анализатор.** Подключи его к динамикам — звук из колонок снова попадёт в
микрофон, и получится свист (обратная связь).

## Код по частям

### Контекст — по первому действию

```ts
private ensure(): AudioContext {
  if (this.ctx) return this.ctx
  const ctx = new AudioContext()
  this.input = ctx.createGain()
  this.analyser = ctx.createAnalyser()
  this.analyser.fftSize = 2048
  this.analyser.smoothingTimeConstant = 0.6
  this.volume = ctx.createGain()
  this.input.connect(this.analyser).connect(this.volume).connect(ctx.destination)
  this.freq = new Uint8Array(this.analyser.frequencyBinCount)
  this.wave = new Uint8Array(this.analyser.fftSize)
  this.ctx = ctx
  return ctx
}
```

- Браузер **не разрешает** звук без действия пользователя: контекст, созданный при загрузке, будет
  приостановлен. Поэтому он создаётся лениво — при первом выборе источника — и каждый `play…`
  делает `await ctx.resume()`.
- `fftSize = 2048` → 1024 частотные ячейки по ~23 Гц: достаточно, чтобы различать басы.
- Своё сглаживание (`follow`) — в анализе, у анализатора лёгкое (0,6).
- Массивы под данные создаются **один раз**: `sample()` вызывается каждый кадр.
- `connect` возвращает узел, к которому подключили, — цепочка читается слева направо.

### Файл пользователя

```ts
async playFile(file: File) {
  const ctx = this.ensure()
  await ctx.resume()
  this.stopAll()
  if (!this.media) {
    this.media = new Audio()
    this.mediaNode = ctx.createMediaElementSource(this.media)
    this.mediaNode.connect(this.input)
  }
  if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
  this.objectUrl = URL.createObjectURL(file)
  this.media.src = this.objectUrl
  await this.media.play()
}
```

- Через `<audio>` — работают перемотка и длительность.
- **`createMediaElementSource` — один раз на элемент**; повторный вызов — ошибка. Поэтому `<audio>`
  один, меняется только `src`.
- `URL.createObjectURL(file)` — временный адрес для файла с диска; старый освобождаем
  (`revokeObjectURL`), иначе каждый трек держит память.

### Микрофон

```ts
async playMic() {
  const ctx = this.ensure()
  await ctx.resume()
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
  })
  this.stopAll()
  …
  this.micNode.connect(this.analyser)
}
```

- **Разрешение — до остановки текущего звука.** Откажет пользователь — музыка продолжит играть.
- Шумоподавление и эхоподавление выключены: они рассчитаны на речь и «срезали» бы музыку.
- `stopAll` при уходе останавливает дорожки микрофона (`track.stop()`) — индикатор микрофона в
  браузере гаснет.

### Каждый кадр: `sample`

```ts
sample(nowMs: number, dt: number): boolean {
  if (!this.ctx || !this.isPlaying) { levels.active = false; return false }
  this.analyser.getByteFrequencyData(this.freq)
  this.analyser.getByteTimeDomainData(this.wave)
  const k = Math.min(1, dt * 60)
  levels.bass = follow(levels.bass, bandLevel(this.freq, rate, BANDS.bass), 0.6 * k, 0.12 * k)
  …
  logBands(this.freq, rate, SPECTRUM_BANDS, this.bands)
  for (let i = 0; i < SPECTRUM_BANDS; i++) levels.spectrum[i] = follow(levels.spectrum[i], this.bands[i], 0.7 * k, 0.15 * k)
  levels.beat = this.detector.update(bandLevel(this.freq, rate, [30, 110]), nowMs)
  if (levels.beat) { this.pulseTarget = 1; levels.beats++ }
  else this.pulseTarget = Math.max(0, this.pulseTarget - dt * 2.5)
  levels.pulse = follow(levels.pulse, this.pulseTarget, 0.35 * k, 0.15 * k)
  levels.active = true
  return true
}
```

- **`k = dt × 60`** — коэффициенты сглаживания рассчитаны на 60 кадров в секунду. На мониторе
  120 Гц кадров вдвое больше — `k` вдвое меньше, и реакция выглядит одинаково.
- Верха умножаются на 1,6 — их энергия в музыке заметно ниже, без усиления рябь была бы почти
  незаметной.
- **`pulse`** — импульс доли не прыгает в 1 мгновенно: цель становится 1, а значение догоняет за
  пару кадров и плавно затухает. Мгновенный скачок выглядел как дёрганье сцены.
- `beats` — счётчик долей: сфера меняет цвет каждые 16 (раз в четыре такта).

### `levels` — объект вне React

```ts
export const levels: Levels = { bass: 0, mid: 0, treble: 0, volume: 0, beat: false, pulse: 0, beats: 0,
  spectrum: new Float32Array(SPECTRUM_BANDS), active: false }
```

Обычный изменяемый объект. Положи его в `useState` или стор — React перерисовывал бы компоненты
60 раз в секунду. Здесь звук **пишет**, сцены **читают** в `useFrame` — без рендера.

### Насос

```tsx
function AudioPump() {
  useFrame((state, dt) => {
    if (!audio.sample(performance.now(), dt)) idleLevels(state.clock.elapsedTime, levels)
  }, -1)
  return null
}
```

- Компонент **ничего не рисует** — он только живёт внутри `<Canvas>`, чтобы получать кадры.
- Приоритет `-1` — выполняется **раньше** `useFrame` сцен: к их кадру `levels` уже свежие.
- Нет звука — `idleLevels`: медленные синусы, чтобы сцена «дышала», а не стояла мёртвой.

## Что будет, если…

| Сделать | Что сломается |
| --- | --- |
| `new AudioContext()` при загрузке | звук не пойдёт до действия пользователя, предупреждение в консоли |
| микрофон в динамики | свист обратной связи |
| `createMediaElementSource` на каждый файл | ошибка на втором файле |
| без `k = dt × 60` | на 120 Гц сцена реагирует вдвое резче |
| `levels` в `useState` | 60 перерисовок в секунду, тормоза |

## Проверьте себя

1. Почему анализатор стоит до узла громкости?
2. Что произойдёт, если пользователь откажет в доступе к микрофону во время демо-трека?

<details>
<summary>Ответы</summary>

1. Чтобы реакция сцены не зависела от громкости: убрали звук — картинка всё равно танцует.
2. Демо продолжит играть: `getUserMedia` бросит ошибку до `stopAll()`.
</details>
