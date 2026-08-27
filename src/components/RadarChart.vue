<template>
  <div ref="el" :style="{ width: width, height: height }" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as echarts from 'echarts'

const props = withDefaults(defineProps<{
  axis: string[]; current: number[]; prev?: (number | null)[]; norm?: number
  width?: string; height?: string
}>(), { width: '100%', height: '320px' })

const el = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

function render() {
  if (!el.value) return
  chart = chart || echarts.init(el.value)
  const grades = ['Стажёр', 'Младший', 'Осн.1', 'Осн.2', 'Ст.1', 'Ст.2', 'Вед.1', 'Вед.2', 'Кл.1', 'Кл.2']
  chart.setOption({
    tooltip: { trigger: 'item' },
    legend: { data: ['Текущий', 'Прошлый', 'Норма грейда'], bottom: 0 },
    radar: {
      indicator: props.axis.map((a) => ({ name: a.length > 22 ? a.slice(0, 20) + '…' : a, max: 9 })),
      radius: '65%',
    },
    series: [{
      type: 'radar',
      data: [
        { value: props.current, name: 'Текущий', areaStyle: { opacity: 0.25 } },
        ...(props.prev ? [{ value: props.prev, name: 'Прошлый', lineStyle: { type: 'dashed' } }] : []),
        ...(props.norm != null ? [{
          value: props.axis.map(() => props.norm), name: 'Норма грейда',
          lineStyle: { color: '#94a3b8' }, areaStyle: { opacity: 0.06 },
        }] : []),
      ],
    } as never],
    ...(grades ? {} : {}),
  })
}

onMounted(render)
onBeforeUnmount(() => chart?.dispose())
</script>
