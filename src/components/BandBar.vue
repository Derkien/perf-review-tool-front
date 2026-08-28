<template>
  <div v-if="band">
    <!-- шкала вилки: min/avg/max кружками, положение ЗП вертикальной чертой -->
    <div class="band-scale">
      <div class="track">
        <span class="zone z1" /><span class="zone z2" /><span class="zone z3" />
        <span class="mark min" :style="{ left: '0%' }"><i />{{ fmt(band.min) }}</span>
        <span class="mark avg" :style="{ left: '50%' }"><i />{{ fmt(band.avg) }}</span>
        <span class="mark max" :style="{ left: '100%' }"><i />{{ fmt(band.max) }}</span>
        <span v-if="position != null" class="salary-pin" :style="{ left: pinPct }" v-tooltip.top="tooltipText">
          <i />
        </span>
      </div>
      <div class="under">
        <span>{{ salaryTotal ? fmt(salaryTotal) + ' ₽/мес (оклад+премия)' : '' }}</span>
        <span :class="['zone-label', zoneClass]">{{ advice?.zone || '—' }}</span>
      </div>
    </div>
    <!-- расшифровка: проценты до границ, рекомендация -->
    <div v-if="advice" class="advice">
      <div class="row"><span>До MIN:</span><b>{{ pct(advice.to_min_pct) }}</b></div>
      <div class="row"><span>До AVG:</span><b>{{ pct(advice.to_avg_pct) }}</b></div>
      <div class="row"><span>До MAX:</span><b>{{ pct(advice.to_max_pct) }}</b></div>
      <div class="row reco"><span>Рекомендация:</span><b>{{ advice.recommendation }}</b></div>
    </div>
    <p v-else class="muted">Вилка для должности/грейда не найдена — обновите кадровую матрицу или АМТ-справочник.</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  band: { min: number; avg: number; max: number } | null
  position: number | null
  salaryTotal: number
  advice?: { zone: string; recommendation: string; to_min_pct: number | null; to_avg_pct: number | null; to_max_pct: number | null } | null
}>()

// черта может выходить за шкалу (до min / после max) — зажимаем отрисовку с запасом
const pinPct = computed(() => `${Math.max(0, Math.min(100, (props.position ?? 0) * 100))}%`)
const tooltipText = computed(() =>
  props.position != null ? `Положение в вилке: ${Math.round(props.position * 100)}%` : '')
const zoneClass = computed(() => {
  const z = props.advice?.zone || ''
  if (z.startsWith('ниже')) return 'z-below'
  if (z.startsWith('выше')) return 'z-above'
  return 'z-in'
})
function fmt(v?: number) { return (v || 0).toLocaleString('ru-RU') }
function pct(v: number | null | undefined): string {
  if (v == null) return '—'
  return v > 0 ? `+${v}%` : `${v}%`
}
</script>

<style scoped>
.band-scale { margin: 6px 0 10px; }
.track { position: relative; height: 30px; margin: 14px 24px 30px; }
.zones, .track { display: block; }
.zone { position: absolute; top: 10px; height: 10px; border-radius: 5px; }
.z1 { left: 0; width: 50%; background: #bbf7d0; }
.z2 { left: 50%; width: 50%; background: #fde68a; }
.z3 { display: none; }
.mark { position: absolute; top: 0; transform: translateX(-50%); text-align: center; }
.mark i {
  display: block; width: 12px; height: 12px; border-radius: 50%; margin: 4px auto 0;
  background: #fff; border: 2.5px solid #475569;
}
.mark.min { color: #475569; } .mark.avg { color: #475569; } .mark.max { color: #475569; }
.mark span, .mark { font-size: 0.72rem; }
.salary-pin { position: absolute; top: -8px; transform: translateX(-50%); }
.salary-pin i {
  display: block; width: 3.5px; height: 36px; border-radius: 2px; background: #1e293b;
  box-shadow: 0 0 0 1px #fff;
}
.under { display: flex; justify-content: space-between; font-size: 0.8rem; color: #475569; margin: 0 24px; }
.zone-label { font-weight: 600; }
.z-below { color: #b45309; } .z-above { color: #b91c1c; } .z-in { color: #15803d; }
.advice { border-top: 1px dashed #e2e8f0; padding-top: 8px; }
.advice .row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 0.84rem; }
.advice .row span { color: #64748b; }
.advice .reco b { text-align: right; }
</style>
