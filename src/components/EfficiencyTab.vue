<template>
  <div>
    <div class="comp-head">
      <SelectButton v-model="effKind" :options="effKinds" option-label="label" option-value="value" />
      <Button v-if="effKind === 'traffic' && canEditTraffic" label="Внести значение"
              size="small" @click="trafficDialog = true" />
    </div>
    <template v-if="effKind === 'efficiency'">
      <Card style="max-width: 820px">
        <template #title>Эффективность — помесячно</template>
        <template #content>
          <SparkLine v-if="effRows.length" :width="700" :height="100"
                     :points="effRows.map((e: any) => ({ label: e.month, value: e.value }))" />
          <div class="trend-line" v-if="effTrend">
            Тренд: <b :style="{ color: effTrend.color }">{{ effTrend.arrow }} {{ effTrend.text }}</b>
            ({{ effTrend.from }} → {{ effTrend.to }}, {{ effTrend.delta > 0 ? '+' : '' }}{{ effTrend.delta }})
          </div>
          <DataTable :value="[...effRows].reverse()" size="small" style="max-width: 360px">
            <Column field="month" header="Месяц" />
            <Column field="value" header="Result" />
          </DataTable>
          <p v-if="!effRows.length" class="muted">нет данных</p>
        </template>
      </Card>
      <Card v-if="effParams.length" style="margin-top: 12px; max-width: 820px">
        <template #title>Аналитика параметров</template>
        <template #content>
          <DataTable :value="effParams" size="small">
            <Column header="Параметр">
              <template #body="{ data: p }">{{ paramLabel(p.code) }}</template>
            </Column>
            <Column header="Динамика">
              <template #body="{ data: p }">
                <SparkLine v-if="p.series.length > 1" :width="160" :height="36"
                           :color="p.dir === 'спад' ? '#dc2626' : '#16a34a'"
                           :points="p.series.map((v: number, i: number) => ({ label: effRows[i]?.month || '', value: v }))" />
                <span v-else class="muted">одно значение</span>
              </template>
            </Column>
            <Column header="Тренд">
              <template #body="{ data: p }">
                <span :style="{ color: p.dir === 'рост' ? '#16a34a' : p.dir === 'спад' ? '#dc2626' : '#64748b', fontSize: '1.1rem' }">
                  {{ p.dir === 'рост' ? '↑' : p.dir === 'спад' ? '↓' : '=' }}
                </span>
              </template>
            </Column>
          </DataTable>
          <div class="reco">
            <b>Рекомендации:</b>
            <ul>
              <li v-for="(r, i) in effRecommendations" :key="i">{{ r }}</li>
              <li v-if="!effRecommendations.length">в целом всё стабильно — значимых отклонений нет</li>
            </ul>
          </div>
        </template>
      </Card>
    </template>
    <template v-else>
      <Card style="max-width: 640px">
        <template #title>Светофор</template>
        <template #content>
          <DataTable :value="[...trafficRows].reverse()" size="small" style="max-width: 320px">
            <Column field="month" header="Дата" />
            <Column header="Значение">
              <template #body="{ data: t }">
                <span class="traffic-dot" :class="trafficClass(t)" />
                {{ trafficLabel(t) }}
                <i v-if="t.source === 'manual'" class="pi pi-user-edit muted" style="font-size:.65rem;margin-left:4px"
                   v-tooltip.top="t.comment" />
              </template>
            </Column>
          </DataTable>
          <p v-if="!trafficRows.length" class="muted">нет данных — импортируйте файл светофора</p>
        </template>
      </Card>
    </template>

    <!-- ручной светофор -->
    <Dialog v-model:visible="trafficDialog" modal header="Внести значение светофора" style="width: 480px">
      <div class="traffic-form">
        <label>Месяц <InputText v-model="trafficForm.month" placeholder="2026-08" size="small" /></label>
        <label>Значение <InputNumber v-model="trafficForm.value" :min-fraction-digits="2" :max-fraction-digits="2" size="small" /></label>
        <label>Комментарий (обязателен) <Textarea v-model="trafficForm.comment" rows="2" class="w100" /></label>
        <label>План коррекции (при жёлтом) <Textarea v-model="trafficForm.correction_plan" rows="2" class="w100" /></label>
        <label>Дата расставания (при красном) <InputText v-model="trafficForm.dismissal_date" type="date" size="small" /></label>
        <Button label="Сохранить" size="small" :loading="busy" @click="saveTraffic" />
        <span class="muted small">Жёлтый требует план коррекции, красный — дату расставания. Всё фиксируется в аудите.</span>
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import Textarea from 'primevue/textarea'
import SparkLine from './SparkLine.vue'
import { staffApi } from '../api/endpoints'
import type { EmployeeCard, PublicSettings } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{ card: EmployeeCard; perms: Record<string, boolean>
  effLabels: Record<string, string> }>()
const emit = defineEmits<{ (e: 'card-refresh'): void }>()

const toast = useToast()
const effKind = ref('efficiency')
const effKinds = [{ label: 'Эффективность', value: 'efficiency' }, { label: 'Светофор', value: 'traffic' }]
const trafficDialog = ref(false)
const busy = ref(false)
const trafficForm = ref<any>({ month: '', value: null, comment: '', correction_plan: '', dismissal_date: '' })
const canEditTraffic = computed(() => !!props.perms.edit_traffic)

const effRows = computed(() => (props.card as any).efficiency || [])
const trafficRows = computed(() => (props.card as any).traffic || [])

const effTrend = computed(() => {
  const rows = effRows.value
  if (rows.length < 2) return null
  const from = rows[0].value, to = rows[rows.length - 1].value
  const delta = Math.round((to - from) * 100) / 100
  return {
    from, to, delta,
    text: delta > 0.3 ? 'рост' : delta < -0.3 ? 'спад' : 'стабильно',
    arrow: delta > 0.3 ? '↑' : delta < -0.3 ? '↓' : '=',
    color: delta > 0.3 ? '#16a34a' : delta < -0.3 ? '#dc2626' : '#475569',
  }
})

const effParams = computed(() => {
  const rows = effRows.value
  if (!rows.length) return []
  const codes = new Set<string>()
  rows.forEach((r: any) => Object.keys(r.params || {}).forEach((c) => codes.add(c)))
  return Array.from(codes).map((code) => {
    const series = rows.map((r: any) => r.params?.[code]).filter((v: number | null) => v != null)
    const last = series[series.length - 1], prev = series[series.length - 2] ?? last
    const d = last - prev
    return { code, series, dir: d > 0.05 ? 'рост' : d < -0.05 ? 'спад' : 'ровно' }
  })
})

const effRecommendations = computed(() => {
  const out: string[] = []
  const downs = effParams.value.filter((p) => p.dir === 'спад')
  const ups = effParams.value.filter((p) => p.dir === 'рост')
  if (downs.length) out.push(`Подтянуть параметры со спадом: ${downs.map((p) => paramLabel(p.code)).join(', ')} — обсудить причины на 1-1`)
  if (ups.length) out.push(`Растущие параметры (${ups.map((p) => paramLabel(p.code)).join(', ')}) — закрепить успех`)
  if (effTrend.value?.text === 'спад') out.push('Общий тренд эффективности снижается — корректировка нагрузки/задач')
  if (effTrend.value?.text === 'рост') out.push('Общий тренд положительный — кандидат на повышенную сложность задач')
  return out
})

function paramLabel(code: string): string {
  return props.effLabels[code] || `код ${code}`
}

function trafficClass(t: any): string {
  return trafficLabel(t).startsWith('зел') ? 't-green' : trafficLabel(t).startsWith('жёл') ? 't-yellow' : 't-red'
}
function trafficLabel(t: any): string {
  if (t.label) return t.label
  return t.value >= 5.2 ? 'зелёный' : t.value >= 4.2 ? 'жёлтый' : 'красный'
}

async function saveTraffic() {
  busy.value = true
  try {
    await staffApi.setTraffic(String(props.card.id), {
      month: trafficForm.value.month, value: trafficForm.value.value,
      comment: trafficForm.value.comment, correction_plan: trafficForm.value.correction_plan,
      dismissal_date: trafficForm.value.dismissal_date || null,
    })
    toast.add({ severity: 'success', summary: 'Светофор сохранён', life: 4000 })
    trafficDialog.value = false
    trafficForm.value = { month: '', value: null, comment: '', correction_plan: '', dismissal_date: '' }
    emit('card-refresh')
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}
</script>

<style scoped>
.comp-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
.trend-line { margin: 8px 0; }
.reco { margin-top: 10px; }
.reco ul { margin: 6px 0 0 18px; padding: 0; }
.traffic-form { display: flex; flex-direction: column; gap: 10px; }
.traffic-form label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; }
.traffic-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
.t-green { background: #16a34a; } .t-yellow { background: #eab308; } .t-red { background: #dc2626; }
.w100 { width: 100%; box-sizing: border-box; }
.small { font-size: 0.78rem; }
</style>
