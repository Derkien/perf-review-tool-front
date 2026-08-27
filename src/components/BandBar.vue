<template>
  <div v-if="band">
    <div class="band-bar">
      <div class="fill" :style="{ left: posPct, width: '3px' }" />
      <span class="tick min">{{ band.min.toLocaleString('ru') }}</span>
      <span class="tick avg">{{ band.avg.toLocaleString('ru') }}</span>
      <span class="tick max">{{ band.max.toLocaleString('ru') }}</span>
    </div>
    <div class="muted">{{ label }} · {{ salaryTotal.toLocaleString('ru') }} ₽/мес</div>
  </div>
  <div v-else class="muted">Вилка для должности/грейда не найдена</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  band: { min: number; avg: number; max: number } | null
  position: number | null
  salaryTotal: number
}>()

const posPct = computed(() => `${Math.max(0, Math.min(100, (props.position ?? 0) * 100))}%`)
const label = computed(() => {
  if (props.position == null) return '—'
  const pct = Math.round(props.position * 100)
  if (props.position < 0) return `ниже вилки (${pct}%) — недоплачен`
  if (props.position > 1) return `выше вилки (${pct}%) — переплачен`
  return `в вилке, ${pct}%`
})
</script>

<style scoped>
.band-bar {
  position: relative; height: 14px; border-radius: 7px; margin: 14px 0 4px;
  background: linear-gradient(90deg, #bbf7d0, #fde68a, #fca5a5);
}
.fill { position: absolute; top: -4px; bottom: -4px; background: #1e293b; border-radius: 2px; }
.tick { position: absolute; top: 20px; font-size: 0.72rem; color: #64748b; }
.min { left: 0 } .avg { left: 50%; transform: translateX(-50%) } .max { right: 0 }
</style>
