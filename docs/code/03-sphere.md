# 3. Сцена «Пульс»

[src/scenes/Sphere.tsx](../../src/scenes/Sphere.tsx). Глава — [05. Шейдеры](../05-shaders.md).

## Где на экране

Первая сцена: светящаяся сфера, поверхность которой колышется волнами — на басах вздымается, на
верхах покрывается мелкой рябью, на ударе бочки вспыхивает. Вокруг — два кольца-спектра: каждый
луч — своя полоса частот. Камера медленно облетает сферу; цвет меняется раз в четыре такта.

## Из чего состоит

```
<color background>         чёрный космос
<Stars>                    звёзды (drei)
<mesh>                     сфера: icosahedronGeometry + shaderMaterial
  vertex shader            двигает точки — волны
  fragment shader          красит пиксели — свечение краёв, «плёнка»
<SpectrumRing> × 2         кольца-спектры (lineLoop)
useFrame                   каждый кадр: uniforms из levels, цвет, камера
```

## Код по частям

### Uniforms: мост JS → видеокарта

```ts
const uniforms = useMemo(() => ({
  uTime: { value: 0 },
  uFlow: { value: 0 },
  uBass: { value: 0 },
  uTreble: { value: 0 },
  uPulse: { value: 0 },
  uColorA: { value: new THREE.Color('#1b0b3a') },
  uColorB: { value: new THREE.Color('#ff5ea8') },
}), [])
```

- **Uniform** — число (или цвет), которое JS передаёт шейдеру. Одно и то же для всех вершин и
  пикселей кадра.
- `{ value: … }` — обёртка: three.js держит ссылку на объект, а мы меняем `value` каждый кадр.
- **`useMemo([])`** — объект создаётся один раз. Новый на каждый рендер — материал потерял бы
  связь с ним.

### Вершинный шейдер: волны

```glsl
float t = uFlow;
float big  = snoise(normal * 1.4 + vec3(t, t * 0.7, -t * 0.4));
float fine = snoise(normal * 5.5 + vec3(-t * 2.0, t, t * 1.5));
float disp = big * (0.1 + uBass * 0.45) + fine * uTreble * 0.1 + uPulse * 0.05;
vec3 pos = position + normal * disp;
```

Для **каждой вершины** сферы:

1. `snoise` — плавный шум (simplex noise): соседние точки получают близкие значения — поверхность
   гладкая, а не «ёжик». `normal × 1.4` — крупные волны, `× 5.5` — мелкая рябь.
2. Сдвиг вершины **вдоль нормали** (наружу от центра) на `disp`.
3. Высота крупных волн — от **баса** (`0.1 + uBass × 0.45`: даже в тишине чуть волнуется), рябь —
   от **верхов**, `uPulse` — общий толчок на доле.

`vDisp`, `vNormal`, `vView` — `varying`: значения, которые вершинный шейдер передаёт фрагментному.

### Фрагментный шейдер: цвет

```glsl
float fresnel = pow(1.0 - max(dot(normalize(vNormal), vView), 0.0), 2.4);
vec3 base = mix(uColorA, uColorB, smoothstep(-0.3, 0.45, vDisp));
float bands = 0.5 + 0.5 * sin(vDisp * 85.0 - uTime * 2.0);
vec3 color = base * (0.08 + pow(bands, 6.0) * 0.9) + uColorB * fresnel * (1.1 + uPulse * 1.4);
```

- **Френель**: `dot(нормаль, взгляд)` = 1 там, где поверхность смотрит на нас (центр), и 0 на краях.
  `1 − dot` — края светятся. Объём **без единого источника света**.
- Гребни волн — цвет B, впадины — цвет A (`mix` по высоте).
- `sin(vDisp × 85)` — тонкие полосы по высоте волны, как радужная плёнка; `pow(…, 6)` делает их
  узкими.
- На доле (`uPulse`) края вспыхивают ярче — их подхватит Bloom постобработки.

### Каждый кадр

```ts
useFrame((state, dt) => {
  u.uTime.value += dt
  u.uFlow.value += dt * (0.25 + levels.mid * 0.6)
  u.uBass.value = levels.bass
  u.uTreble.value = levels.treble
  u.uPulse.value = levels.pulse
  const [a, b] = palettes[Math.floor(levels.beats / 16) % palettes.length]
  u.uColorA.value.lerp(a, dt * 1.5)
  u.uColorB.value.lerp(b, dt * 1.5)
  …
})
```

- **`uFlow` — накопленный путь**, а не `время × громкость`. Главная ловушка шейдеров под музыку:
  если в шейдере написать `snoise(normal + uTime * uMid)`, то при изменении `uMid` фаза
  **перескакивает** — волны дёргаются. Здесь скорость (`0.25 + mid × 0.6`) меняет только **прирост**:
  громче середина — волны бегут быстрее, но плавно.
- Цвет — плавный переход (`lerp` на долю пути за кадр) к палитре по номеру такта: каждые 16 долей.

### Кольцо-спектр

```ts
useFrame((state) => {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < RAYS; i++) {
    const half = i < RAYS / 2 ? i : RAYS - 1 - i
    const band = Math.floor((half / (RAYS / 2)) * bands * 0.85 + offset) % bands
    const r = radius + levels.spectrum[band] * 0.9
    const a = (i / RAYS) * Math.PI * 2
    pos.setXYZ(i, Math.cos(a) * r, Math.sin(a) * r, 0)
  }
  pos.needsUpdate = true
})
```

- 128 вершин на окружности; радиус каждой — от громкости своей полосы.
- **Зеркало**: первая половина круга — от низких к высоким, вторая — обратно. Кольцо симметрично и
  без «шва», где самые высокие встречались бы с самыми низкими.
- Геометрия создаётся **один раз**, а каждый кадр меняются только числа в её буфере;
  `needsUpdate = true` — сказать three.js отправить их на видеокарту.

### Камера

```ts
const t = state.clock.elapsedTime * 0.12
state.camera.position.set(Math.sin(t) * 5.2, Math.sin(t * 0.7) * 1.2, Math.cos(t) * 5.2)
state.camera.lookAt(0, 0, 0)
state.camera.translateX(-shift.current)
```

Камера медленно облетает сферу **по времени**, без толчков на долях — иначе зрителя бы укачивало.
На стартовом экране сфера уступает место заголовку: камера сдвигается в своей системе координат, и
сфера оказывается правее, где бы камера ни была на орбите.

## Что будет, если…

| Сделать | Что сломается |
| --- | --- |
| `uTime * uMid` в шейдере вместо `uFlow` | волны дёргаются при каждом изменении громкости |
| `uniforms` без `useMemo` | анимация не работает — шейдер читает старый объект |
| новая геометрия кольца каждый кадр | утечка памяти видеокарты и падение FPS |
| камера толкается на долях | укачивает |

## Проверьте себя

1. Почему края сферы светятся, хотя в сцене нет света?
2. Как сделать, чтобы цвет менялся каждые 8 долей?

<details>
<summary>Ответы</summary>

1. Френель в фрагментном шейдере: яркость растёт там, где поверхность повёрнута от взгляда.
2. `Math.floor(levels.beats / 8)`.
</details>
