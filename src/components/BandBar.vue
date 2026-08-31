<template>
  <div v-if="band" class="band-block">
    <div class="amt-line muted">
      грейд по АМТ <b>{{ band.amt_grade }}</b>
      <span v-if="band.qualification"> — {{ band.qualification }}</span>,
      код <b>{{ band.amt_code }}</b>
    </div>
    <div class="band-scale">
      <div class="track">
        <span v-for="m in marks" :key="m.key" class="stick" :style="{ left: m.pct }">
          <i /><b>{{ m.label }}</b>
        </span>
        <span v-if="position != null" class="pin" :style="{ left: pinPct }" v-tooltip.top="pinTooltip">
          <span class="pin-icon">₽</span><i class="pin-stick" />
        </span>
      </div>
    </div>
    <div class="explain">
      <table class="et">
        <tr><td>Оклад</td><td>{{ fmt(salary) }} ₽</td></tr>
        <tr><td>Премия УУ</td><td>{{ fmt(salary * premiumPct) }} ₽</td></tr>
        <tr><td>Квартальный бонус</td><td>{{ bonus ? fmt(bonus) + ' ₽' : '—' }}</td></tr>
        <tr class="et-total"><td>Совокупный доход</td><td>{{ fmt(salaryTotal) }} ₽/мес</td></tr>
      </table>
      <table class="et">
        <tr><td>До MIN</td><td>{{ pctStr(advice?.to_min_pct) }}</td></tr>
        <tr><td>До AVG</td><td>{{ pctStr(advice?.to_avg_pct) }}</td></tr>
        <tr><td>До MAX</td><td>{{ pctStr(advice?.to_max_pct) }}</td></tr>
        <tr><td>Рекомендация</td><td class="et-reco">{{ advice?.recommendation || '—' }}</td></tr>
      </table>
    </div>
  </div>
  <p v-else class="muted">Вилка для должности/грейда не найдена — обновите кадровую матрицу или АМТ-справочник.</p>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  band: { min: number; avg: number; max: number; amt_code?: string; amt_grade?: string; qualification?: string } | null
  position: number | null
  salary: number
  premiumPct: number
  bonus: number
  salaryTotal: number
  advice?: { zone: string; recommendation: string; to_min_pct: number | null; to_avg_pct: number | null; to_max_pct: number | null } | null
}>()

// шкала шире вилки: видно недоплаченных и переплаченных
const MARGIN = computed(() => Math.max((props.band!.max - props.band!.min) * 0.35, 20000))
const lo = computed(() => props.band!.min - MARGIN.value)
const hi = computed(() => props.band!.max + MARGIN.value)

const marks = computed(() => [
  { key: 'min', v: props.band!.min, label: 'MIN ' + fmt(props.band!.min) },
  { key: 'avg', v: props.band!.avg, label: 'AVG ' + fmt(props.band!.avg) },
  { key: 'max', v: props.band!.max, label: 'MAX ' + fmt(props.band!.max) },
].map((m) => ({ ...m, pct: `${Math.max(3, Math.min(97, ((m.v - lo.value) / (hi.value - lo.value)) * 100))}%` })))

const pinPct = computed(() =>
  `${Math.max(1.5, Math.min(98.5, ((props.salaryTotal - lo.value) / (hi.value - lo.value)) * 100))}%`)
const pinTooltip = computed(() =>
  props.position != null ? `Совокупный доход: ${Math.round(props.position * 100)}% вилки` : '')

function fmt(v?: number) { return Math.round(v || 0).toLocaleString('ru-RU') }
function pctStr(v: number | null | undefined): string {
  if (v == null) return '—'
  return v > 0 ? `+${v}%` : `${v}%`
}
</script>

<style scoped>
.band-block { max-width: 760px; }
.amt-line { font-size: 0.85rem; margin-bottom: 6px; }
.band-scale { margin: 8px 0; }
.track { position: relative; height: 56px; margin: 8px 6px 4px; }
.track::before {
  content: ''; position: absolute; left: 0; right: 0; top: 22px; height: 2px; background: #cbd5e1;
}
.stick { position: absolute; top: 6px; transform: translateX(-50%); text-align: center; }
.stick i {
  display: block; width: 2.5px; height: 34px; background: #475569; margin: 0 auto; border-radius: 2px;
}
.stick b { display: block; margin-top: 4px; font-size: 0.7rem; color: #475569; white-space: nowrap; font-weight: 600; }
.pin { position: absolute; top: 0; transform: translateX(-50%); text-align: center; }
.pin-stick {
  display: block; width: 3px; height: 46px; background: #1e293b; margin: 0 auto; border-radius: 2px;
  box-shadow: 0 0 0 1px #fff;
}
.pin-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%; background: #1e293b; color: #fff;
  font-size: 0.72rem; font-weight: 700;
}
.explain { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px; }
.et { border-collapse: collapse; font-size: 0.86rem; }
.et td { padding: 4px 12px 4px 0; border-bottom: 1px dashed #e2e8f0; }
.et td:first-child { color: #64748b; white-space: nowrap; }
.et td:last-child { text-align: right; font-weight: 600; }
.et-total td { border-top: 1px solid #94a3b8; font-weight: 700; }
.et-reco { text-align: right !important; font-weight: 500; }
@media (max-width: 700px) { .explain { grid-template-columns: 1fr; } }
</style>
