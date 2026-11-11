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

const RADIUS = 66  // % от min(w,h)/2: запас под подписи осей у края холста (28 осей qa резались при 78%)

const el = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
let ro: ResizeObserver | null = null

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
      const rMax = RADIUS / 100 * Math.min(w, h) / 2
      if (Math.hypot(dx, dy) < rMax * 0.9) return  // клик по зоне данных — не выбор категории
      // оси: 0-я сверху (startAngle 90), далее по часовой; в экранных координатах y вниз
      const n = props.axis.length
      const step = Math.PI * 2 / n
      const i = ((Math.round((Math.atan2(dy, dx) + Math.PI / 2) / step)) % n + n) % n
      emit('axis-click', props.axis[i])
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
      indicator: props.axis.map((a) => ({
        name: a.length > 24 ? a.slice(0, 22) + '…' : a, max: 10,
      })),
      radius: `${RADIUS}%`,
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
