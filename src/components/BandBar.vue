<template>
  <div v-if="band" class="band-block">
    <div class="amt-line muted">
      грейд по АМТ <b>{{ band.amt_grade }}</b>
      <span v-if="band.qualification"> — {{ band.qualification }}</span>,
      код <b>{{ band.amt_code }}</b>
    </div>

    <div class="scale-wrap">
      <!-- чёрный балун совокупного дохода -->
      <div class="balloon" :style="{ left: pinPct }">
        <div class="balloon-body">{{ shortMoney(salaryTotal) }}</div>
        <div class="balloon-tail" />
      </div>

      <!-- шкала с зонами -->
      <div class="track">
        <div class="zone z-under" :style="{ width: pct(band.min) }" />
        <div class="zone z-min-avg" :style="{ left: pct(band.min), width: widthBetween(band.min, band.avg) }" />
        <div class="zone z-avg-max" :style="{ left: pct(band.avg), width: widthBetween(band.avg, band.max) }" />
        <div class="zone z-over" :style="{ left: pct(band.max) }" />
        <!-- позиции границ -->
        <div v-for="m in boundaries" :key="m.key" class="tick" :style="{ left: m.pct }" />
        <!-- позиция ЗП -->
        <div class="pin" :style="{ left: pinPct }" />
      </div>

      <!-- подписи под границами -->
      <div class="labels">
        <div v-for="m in boundaries" :key="m.key" class="label" :style="{ left: m.pct }">
          <b>{{ m.name }}</b>
          <span>{{ fmt(m.value) }}</span>
        </div>
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

// шкала шире вилки на 30% с каждой стороны: видно недоплаченных и переплаченных
const MARGIN = computed(() => Math.max((props.band!.max - props.band!.min) * 0.3, 20000))
const lo = computed(() => props.band!.min - MARGIN.value)
const hi = computed(() => props.band!.max + MARGIN.value)

function pct(v: number): string {
  return `${((v - lo.value) / (hi.value - lo.value)) * 100}%`
}
function widthBetween(a: number, b: number): string {
  return `${((b - a) / (hi.value - lo.value)) * 100}%`
}

const boundaries = computed(() => [
  { key: 'min', name: 'MIN', value: props.band!.min },
  { key: 'avg', name: 'AVG', value: props.band!.avg },
  { key: 'max', name: 'MAX', value: props.band!.max },
].map((m) => ({ ...m, pct: pct(m.value) })))

const pinPct = computed(() =>
  `${Math.max(2, Math.min(98, ((props.salaryTotal - lo.value) / (hi.value - lo.value)) * 100))}%`)

function fmt(v?: number) { return Math.round(v || 0).toLocaleString('ru-RU') }
function shortMoney(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1).replace('.', ',')}м`
  if (v >= 1000) return `${Math.round(v / 1000)}к`
  return String(Math.round(v))
}
function pctStr(v: number | null | undefined): string {
  if (v == null) return '—'
  return v > 0 ? `+${v}%` : `${v}%`
}
</script>

<style scoped>
.band-block { max-width: 760px; }
.amt-line { font-size: 0.85rem; margin-bottom: 4px; }

.scale-wrap { position: relative; margin: 46px 10px 8px; }

/* чёрный балун с суммой */
.balloon {
  position: absolute; bottom: calc(100% + 6px); transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; z-index: 3;
}
.balloon-body {
  background: #1e293b; color: #fff; font-weight: 700; font-size: 0.86rem;
  padding: 5px 12px; border-radius: 14px; white-space: nowrap;
  box-shadow: 0 2px 6px rgba(15, 23, 42, .35);
}
.balloon-tail {
  width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent;
  border-top: 7px solid #1e293b; margin-top: -1px;
}

/* шкала */
.track { position: relative; height: 16px; }
.zone { position: absolute; top: 0; bottom: 0; }
.z-under  { left: 0; background: #e2e8f0; border-radius: 8px 0 0 8px; }
.z-min-avg { background: #86efac; }
.z-avg-max { background: #fde047; }
.z-over   { right: 0; background: #fca5a5; border-radius: 0 8px 8px 0; }

/* границы диапазонов */
.tick {
  position: absolute; top: -4px; bottom: -4px; width: 2px;
  background: #475569; transform: translateX(-50%); z-index: 2;
}

/* позиция ЗП */
.pin {
  position: absolute; top: -6px; bottom: -6px; width: 3px;
  background: #0f172a; border-radius: 2px; transform: translateX(-50%);
  box-shadow: 0 0 0 1.5px #fff; z-index: 4;
}

/* подписи под границами */
.labels { position: relative; height: 34px; }
.label {
  position: absolute; top: 6px; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; line-height: 1.25;
}
.label b { font-size: 0.68rem; color: #475569; letter-spacing: .03em; }
.label span { font-size: 0.72rem; color: #64748b; font-variant-numeric: tabular-nums; white-space: nowrap; }

.explain { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px; }
.et { border-collapse: collapse; font-size: 0.86rem; }
.et td { padding: 4px 12px 4px 0; border-bottom: 1px dashed #e2e8f0; }
.et td:first-child { color: #64748b; white-space: nowrap; }
.et td:last-child { text-align: right; font-weight: 600; }
.et-total td { border-top: 1px solid #94a3b8; font-weight: 700; }
.et-reco { text-align: right !important; font-weight: 500; }
@media (max-width: 700px) { .explain { grid-template-columns: 1fr; } }
</style>
