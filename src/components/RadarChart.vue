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
  norm?: number
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

const el = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
let ro: ResizeObserver | null = null

function render() {
  if (!el.value) return
  if (!chart) {
    if (!el.value.clientWidth) return  // контейнер ещё скрыт вкладкой — придёт ResizeObserver
    chart = echarts.init(el.value)
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
    push('Норма грейда', props.axis.map(() => props.norm), '#94a3b8')
  }
  chart.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    radar: {
      indicator: props.axis.map((a) => ({
        name: a.length > 24 ? a.slice(0, 22) + '…' : a, max: 10,
      })),
      radius: '66%',  // запас под подписи осей у края холста (28 осей qa резались при 78%)
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
