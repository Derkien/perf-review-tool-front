<template>
  <div ref="el" :style="{ width: width, height: height }" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = withDefaults(defineProps<{
  axis: string[]
  self?: (number | null)[] | number[]
  manager?: (number | null)[] | number[]
  /** полигон нормы по осям; скаляр — плоская окружность (все оси одной нормой) */
  norm?: number | (number | null)[] | null
  session1?: (number | null)[] | null
  session2?: (number | null)[] | null
  /** системные («по умолчанию») значения сравниваемых сессий — пустые точки */
  session1Default?: boolean[] | null
  session2Default?: boolean[] | null
  current?: number[]  // legacy
  prev?: (number | null)[] | null
  width?: string
  height?: string
}>(), { width: '100%', height: '340px' })

const emit = defineEmits<{ (e: 'axis-click', label: string): void }>()

const RADIUS = 55  // % от min(w,h)/2 при широком холсте: запас под подписи у краёв
const RADIUS_NARROW = 48  // узкий холст — звезду поджимаем, подписям нужно больше поля
// шрифт подписей 11px: при 12px строка в 15 симв (~108px) не влезает в поле
// между вершиной оси и краем холста даже на широком экране
const LABEL_FONT = 11

const el = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
let ro: ResizeObserver | null = null

/** радиус в % от min(w,h)/2 — один источник для опции радара и геометрии клика */
function radiusPct(): number {
  const min = el.value ? Math.min(el.value.clientWidth, el.value.clientHeight) : 0
  return min && min < 500 ? RADIUS_NARROW : RADIUS
}

/** подпись оси в 1–3 строки ≤15 симв (перенос по словам, «/» клеится к слову,
 *  длинное слово не рвём, хвост за 3 строки — «…») — иначе боковые подписи
 *  вылезают за края холста */
function wrapLabel(name: string): string {
  const MAX = 15
  if (name.length <= MAX) return name
  const words: string[] = []
  let pendingSlash = false
  for (const w of name.split(/\s+/)) {
    if (w === '/') { pendingSlash = true; continue }  // «/» — префикс следующего слова
    words.push(pendingSlash ? `/ ${w}` : w)
    pendingSlash = false
  }
  if (pendingSlash && words.length) words[words.length - 1] += ' /'  // хвостовой слэш
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w
    if (!cur || cand.length <= MAX) cur = cand
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  if (lines.length > 3) {
    const rest = lines.slice(2).join(' ')
    lines.length = 2
    lines.push(rest.length > MAX ? rest.slice(0, MAX - 1) + '…' : rest)
  }
  return lines.join('\n')
}

function render() {
  if (!el.value) return
  if (!chart) {
    if (!el.value.clientWidth) return  // контейнер ещё скрыт вкладкой — придёт ResizeObserver
    chart = echarts.init(el.value)
    // клик по подписи оси: подписи радара silent и не «серия» — chart.on('click') их не
    // отдаёт и target пуст; выбираем ось геометрически — угол клика от центра → ближайшая
    chart.getZr().on('click', (e: { target?: unknown; offsetX?: number; offsetY?: number }) => {
      if (e.target != null || e.offsetX == null || e.offsetY == null || !el.value) return
      const w = el.value.clientWidth, h = el.value.clientHeight
      if (!w || !h) return
      const dx = e.offsetX - w / 2, dy = e.offsetY - h / 2
      const rMax = radiusPct() / 100 * Math.min(w, h) / 2
      if (Math.hypot(dx, dy) < rMax * 0.9) return  // клик по зоне данных — не выбор категории
      // направление оси i — формула echarts (Radar.js resize(): startAngle 90°,
      // clockwise:false → ПРОТИВ часовой, math-конвенция y вверх): экранная ось i
      // (n осей) = (-sin(i·2π/n), -cos(i·2π/n)); ищем максимальную косинусную близость
      const n = props.axis.length
      const step = Math.PI * 2 / n
      let best = 0, bestDot = -2
      for (let i = 0; i < n; i++) {
        const dot = dx * -Math.sin(i * step) + dy * -Math.cos(i * step)
        if (dot > bestDot) { bestDot = dot; best = i }
      }
      emit('axis-click', props.axis[best])
    })
  }
  const series: any[] = []
  const push = (name: string, data: any, color: string, dashed = false, area = false,
                hollow = false) =>
    series.push({
      name, type: 'radar', data: [{ value: data, name }],
      lineStyle: dashed ? { type: 'dashed', color } : { color },
      itemStyle: hollow ? { color: 'transparent', borderColor: color } : { color },
      areaStyle: area ? { color, opacity: 0.15 } : undefined,
    })
  if (props.manager?.length) push('Руководитель', props.manager, '#2563eb', false, true)
  if (props.self?.length) push('Самооценка', props.self, '#f59e0b')
  // сравниваемая сессия: системные пункты — отдельной полой линией (бейдж «по умолчанию»)
  const pushSession = (idx: number, data: (number | null)[] | null | undefined,
                       defaults: boolean[] | null | undefined, color: string) => {
    if (!data?.length) return
    push(`Сессия ${idx}`, data.map((v, i) => (defaults?.[i] ? null : v)), color, true)
    if (defaults?.some(Boolean)) {
      push(`Сессия ${idx} (по умолчанию)`, data.map((v, i) => (defaults[i] ? v : null)),
           color, true, false, true)
    }
  }
  pushSession(1, props.session1, props.session1Default, '#9333ea')
  pushSession(2, props.session2, props.session2Default, '#0d9488')
  if (props.current?.length) push('Текущий', props.current, '#2563eb', false, true)
  if (props.prev?.length) push('Прошлый', props.prev, '#94a3b8', true)
  if (props.norm != null && props.axis.length) {
    // норма грейда — полигон по осям (категориям); скаляр разворачивается в окружность
    const normData = Array.isArray(props.norm)
      ? props.norm
      : props.axis.map(() => props.norm as number)
    push('Норма грейда', normData, '#94a3b8')
  }
  chart.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    radar: {
      indicator: props.axis.map((a) => ({ name: wrapLabel(a), max: 10 })),
      axisName: { fontSize: LABEL_FONT },
      radius: `${radiusPct()}%`,
    },
    series,
  } as never, true)
}

onMounted(() => {
  render()
  // перерисовка при появлении контейнера (вкладка стала активной) и при ресайзе
  ro = new ResizeObserver(() => {
    if (el.value?.clientWidth) {
      if (chart) chart.resize()
      else render()
    }
  })
  if (el.value) ro.observe(el.value)
})
watch(() => [props.axis, props.self, props.manager, props.norm, props.session1, props.session2,
  props.session1Default, props.session2Default], render)
onBeforeUnmount(() => {
  ro?.disconnect()
  chart?.dispose()
})
</script>
