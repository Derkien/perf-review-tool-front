<template>
  <div>
    <div class="spark-labels muted">
      <span>{{ points[0]?.label }}</span><span>{{ points[points.length-1]?.label }}</span>
    </div>
    <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`">
      <polyline :points="polyline" fill="none" :stroke="color" stroke-width="2" />
      <circle v-for="(p, i) in pts" :key="i" :cx="p.x" :cy="p.y" r="2.5" :fill="color">
        <title>{{ p.label }}: {{ p.value }}</title>
      </circle>
    </svg>
    <div class="muted">последнее: <b>{{ last }}</b></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  points: { label: string; value: number }[]; width?: number; height?: number; color?: string
}>(), { width: 220, height: 48, color: '#3b82f6' })

const pts = computed(() => {
  const vals = props.points.map((p) => p.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const stepX = props.width / Math.max(props.points.length - 1, 1)
  return props.points.map((p, i) => ({
    x: i * stepX, y: props.height - 6 - ((p.value - min) / span) * (props.height - 12),
    label: p.label, value: p.value,
  }))
})
const polyline = computed(() => pts.value.map((p) => `${p.x},${p.y}`).join(' '))
const last = computed(() => props.points[props.points.length - 1]?.value ?? '—')
</script>

<style scoped>
.spark-labels { display: flex; justify-content: space-between; font-size: 0.7rem; }
</style>
