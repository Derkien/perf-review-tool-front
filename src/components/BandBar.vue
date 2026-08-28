<template>
  <div v-if="band" class="band-block">
    <div class="band-scale">
      <div class="track">
        <span class="zone z-min" /><span class="zone z-mid" /><span class="zone z-max" />
        <span class="mark" :style="{ left: pct(band.min) }"><i /><b>{{ fmt(band.min) }}</b></span>
        <span class="mark" :style="{ left: pct(band.avg) }"><i /><b>{{ fmt(band.avg) }}</b></span>
        <span class="mark" :style="{ left: pct(band.max) }"><i /><b>{{ fmt(band.max) }}</b></span>
        <span v-if="position != null" class="pin" :style="{ left: pinPct }" v-tooltip.top="pinTooltip">
          <i />
        </span>
      </div>
      <div class="under">
        <span class="muted">недоплачено</span>
        <span :class="['zone-label', zoneClass]">{{ advice?.zone || '—' }}</span>
        <span class="muted">переплачено</span>
      </div>
    </div>
    <div v-if="advice" class="advice">
      <div class="row"><span>Совокупный доход</span><b>{{ fmt(salaryTotal) }} ₽/мес</b></div>
      <div class="row"><span>До MIN</span><b>{{ pctStr(advice.to_min_pct) }}</b></div>
      <div class="row"><span>До AVG</span><b>{{ pctStr(advice.to_avg_pct) }}</b></div>
      <div class="row"><span>До MAX</span><b>{{ pctStr(advice.to_max_pct) }}</b></div>
      <div class="row reco"><span>Рекомендация</span><b>{{ advice.recommendation }}</b></div>
    </div>
  </div>
  <p v-else class="muted">Вилка для должности/грейда не найдена — обновите кадровую матрицу или АМТ-справочник.</p>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  band: { min: number; avg: number; max: number } | null
  position: number | null
  salaryTotal: number
  advice?: { zone: string; recommendation: string; to_min_pct: number | null; to_avg_pct: number | null; to_max_pct: number | null } | null
}>()

// шкала шире вилки на margin с обеих сторон: видно и недоплаченных, и переплаченных
const MARGIN = computed(() => Math.max((props.band!.max - props.band!.min) * 0.35, 20000))
const lo = computed(() => props.band!.min - MARGIN.value)
const hi = computed(() => props.band!.max + MARGIN.value)

function pct(v: number): string {
  return `${Math.max(2, Math.min(98, ((v - lo.value) / (hi.value - lo.value)) * 100))}%`
}
const pinPct = computed(() =>
  `${Math.max(1, Math.min(99, ((props.salaryTotal - lo.value) / (hi.value - lo.value)) * 100))}%`)
const pinTooltip = computed(() =>
  props.position != null ? `Совокупный доход: ${Math.round(props.position * 100)}% вилки` : '')
const zoneClass = computed(() => {
  const z = props.advice?.zone || ''
  if (z.startsWith('ниже')) return 'z-below'
  if (z.startsWith('выше')) return 'z-above'
  return 'z-in'
})
function fmt(v?: number) { return Math.round(v || 0).toLocaleString('ru-RU') }
function pctStr(v: number | null | undefined): string {
  if (v == null) return '—'
  return v > 0 ? `+${v}%` : `${v}%`
}
</script>

<style scoped>
.band-block { max-width: 560px; }
.band-scale { margin: 4px 0 8px; }
.track { position: relative; height: 34px; margin: 18px 8px 34px; }
.zone { position: absolute; top: 15px; height: 4px; }
.z-min { left: 0; width: 34%; background: repeating-linear-gradient(90deg, #e2e8f0 0 6px, transparent 6px 10px); }
.z-mid { left: 34%; width: 32%; background: #bbf7d0; }
.z-max { left: 66%; width: 34%; background: #fde68a; }
.mark { position: absolute; top: 8px; transform: translateX(-50%); text-align: center; }
.mark i {
  display: block; width: 11px; height: 11px; border-radius: 50%; margin: 0 auto;
  background: #fff; border: 2.5px solid #475569; position: relative; z-index: 2;
}
.mark b { display: block; margin-top: 6px; font-size: 0.68rem; color: #475569; font-weight: 600; white-space: nowrap; }
.pin { position: absolute; top: -2px; transform: translateX(-50%); }
.pin i {
  display: block; width: 3px; height: 44px; border-radius: 2px; background: #1e293b;
  box-shadow: 0 0 0 1px #fff; position: relative; z-index: 3;
}
.under { display: flex; justify-content: space-between; font-size: 0.72rem; margin: 0 8px; }
.zone-label { font-weight: 700; font-size: 0.8rem; }
.z-below { color: #b45309; } .z-above { color: #b91c1c; } .z-in { color: #15803d; }
.advice { border-top: 1px dashed #e2e8f0; padding-top: 6px; max-width: 420px; }
.advice .row { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; font-size: 0.84rem; }
.advice .row span { color: #64748b; flex-shrink: 0; }
.advice .row b { text-align: right; }
</style>
