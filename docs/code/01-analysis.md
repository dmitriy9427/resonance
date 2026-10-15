# 1. Анализ звука

[src/audio/analysis.ts](../../src/audio/analysis.ts) — чистые функции и маленький класс без Web Audio.
Тесты — `analysis.test.ts` на подставных массивах. Глава — [02. Web Audio](../02-web-audio.md).

## Где на экране

Нигде напрямую — но от этого файла зависит, **как** сцены реагируют: сфера вздымается на басах,
рябь бежит на верхах, кольца-спектры шевелятся каждым лучом, цвет толкается на каждом ударе бочки.

## Что делает

| Функция | Что даёт |
| --- | --- |
| `binOf`, `bandLevel` | средняя громкость полосы частот (бас, середина, верха) 0…1 |
| `logBands` | спектр, сжатый до 64 полос с логарифмическим шагом |
| `follow` | сглаживание «быстро вверх, медленно вниз» |
| `rms` | общая громкость по форме волны |
| `BeatDetector` | «сейчас удар бочки?» |

## Что приходит от анализатора

`AnalyserNode.getByteFrequencyData(массив)` заполняет массив из 1024 чисел 0…255: громкость каждой
**частотной ячейки**. Ячейки идут **равномерно** от 0 Гц до половины частоты дискретизации (24 000
Гц при 48 кГц) — по ~23 Гц.

## Код по частям

### Ячейка для частоты и громкость полосы

```ts
export function binOf(hz: number, sampleRate: number, binCount: number): number {
  const nyquist = sampleRate / 2
  return Math.min(binCount - 1, Math.max(0, Math.round((hz / nyquist) * binCount)))
}

export function bandLevel(spectrum, sampleRate, [from, to]) {
  const a = binOf(from, sampleRate, spectrum.length)
  const b = Math.max(a + 1, binOf(to, sampleRate, spectrum.length))
  let sum = 0
  for (let i = a; i < b; i++) sum += spectrum[i]
  return sum / (b - a) / 255
}
```

- **Найквист** — половина частоты дискретизации: выше неё цифровой звук частот не содержит.
- 150 Гц при 48 кГц: `150 / 24000 × 1024 ≈ 6` — шестая ячейка.
- `Math.max(a + 1, …)` — хотя бы одна ячейка, иначе деление на ноль для узкой полосы.
- Делим на 255 — получаем 0…1: удобно умножать на что угодно в сцене.

### Логарифмический спектр

```ts
export function logBands(spectrum, sampleRate, count, out = new Float32Array(count), minHz = 30, maxHz = 14000) {
  const ratio = maxHz / minHz
  for (let i = 0; i < count; i++) {
    const from = minHz * ratio ** (i / count)
    const to = minHz * ratio ** ((i + 1) / count)
    out[i] = bandLevel(spectrum, sampleRate, [from, to])
  }
  return out
}
```

Слух **логарифмический**: октава 50→100 Гц звучит так же «широко», как 5000→10 000 Гц. Если
поделить 1024 ячейки поровну на 64 луча, басы займут половину первого луча, а все остальные будут
про верха, которых почти не слышно.

Здесь каждая следующая полоса **во столько-то раз** шире предыдущей: `minHz × ratio^(i/count)`.
Получается: 30 Гц, 33, 36, 40… — и до 14 кГц. Бас занимает много лучей, как и в восприятии.

`out` — массив **передают снаружи** и переиспользуют: функция вызывается 60 раз в секунду, и
создавать новый `Float32Array` каждый кадр — лишняя работа сборщику мусора.

### Сглаживание: быстро вверх, медленно вниз

```ts
export function follow(prev: number, next: number, attack: number, release: number): number {
  const k = next > prev ? attack : release
  return prev + (next - prev) * k
}
```

Каждый кадр значение проходит долю пути к новому: `attack` (например, 0,6) — когда растёт,
`release` (0,12) — когда падает.

```
кадр:      1    2    3    4    5    6
сигнал:    1    0    0    0    0    0
значение: 0.6  0.53 0.46 0.41 0.36 0.32   (attack 0.6, release 0.12)
```

Удар — мгновенный подъём, потом плавное «остывание», как у стрелки аналогового индикатора. Без
этого картинка дёргалась бы на каждой ноте.

### Громкость по форме волны

```ts
export function rms(waveform: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < waveform.length; i++) {
    const v = (waveform[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / waveform.length)
}
```

Форма волны в байтах: 128 — тишина (ноль), 0 и 255 — крайние отклонения. Переводим в −1…1,
**квадраты** (чтобы минус и плюс не гасили друг друга), среднее, корень — «среднеквадратичное».

### Детектор долей

```ts
update(bass: number, now: number): boolean {
  const avg = this.history.length ? this.history.reduce((a, b) => a + b, 0) / this.history.length : bass
  this.history.push(bass)
  if (this.history.length > this.size) this.history.shift()
  const rising = bass > this.prev + 0.02
  this.prev = bass
  const isBeat =
    rising &&
    this.history.length > 10 &&
    bass > this.floor &&
    bass > avg * this.sensitivity &&
    now - this.lastBeat > this.cooldown
  if (isBeat) this.lastBeat = now
  return isBeat
}
```

Доля — когда **все** условия сразу:

| Условие | Зачем |
| --- | --- |
| `bass > avg × 1.35` | бас заметно выше **своего среднего за секунду** — не зависит от громкости трека |
| `rising` | энергия растёт прямо сейчас — без этого переход «тишина → громко» давал серию ложных долей, пока среднее догоняло |
| `history.length > 10` | первые кадры среднего ещё нет |
| `bass > floor` | в тишине шум не считается ударом |
| `now − lastBeat > 240 мс` | не чаще 250 ударов в минуту — один удар не засчитывается дважды |

## Что будет, если…

| Сделать | Что сломается |
| --- | --- |
| линейный спектр на 64 луча | басы — один луч, остальные почти неподвижны |
| `follow` с одинаковыми attack и release | картинка дёргается в такт каждой ноте |
| порог доли числом (`bass > 0.6`) | тихий трек — ни одной доли, громкий — доля на каждой ноте |
| без `rising` | в начале громкой части — пулемётная очередь ложных долей |

## Проверьте себя

1. `follow(0.5, 1, 0.6, 0.12)` и `follow(0.5, 0, 0.6, 0.12)`?
2. Почему `BeatDetector` смотрит на полосу 30–110 Гц, а не на весь бас 20–150?

<details>
<summary>Ответы</summary>

1. `0.5 + 0.5 × 0.6 = 0.8` и `0.5 − 0.5 × 0.12 = 0.44`.
2. Удар бочки — самая низкая и плотная часть; узкая полоса меньше путает её с бас-гитарой и
   низкими нотами синтезатора.
</details>
