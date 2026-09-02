<template>
  <div class="page">
    <h1>Решения и бюджет</h1>
    <div class="head">
      <Dropdown v-model="cycleId" :options="cycles" option-label="name" option-value="id" placeholder="Цикл" />
      <Button label="Экспорт XLSX" severity="secondary" :disabled="!cycleId" @click="exportXlsx" />
      <Button label="Создать решение по…" text :disabled="!cycleId" @click="createDialog = true" />
    </div>
    <Card v-if="budget" style="margin: 12px 0">
      <template #title>Бюджет ФОТ</template>
      <template #content>
        <div class="budget">
          <div>ФОТ: <b>{{ fmt(budget.total_fot) }}</b> ₽/мес</div>
          <div>Планируемый прирост: <b :style="{ color: budget.within_budget ? '#16a34a' : '#dc2626' }">
            +{{ fmt(budget.planned_increase) }}</b> ₽/мес</div>
          <div>Лимит: <b>{{ fmt(budget.limit) }}</b> ₽/мес</div>
          <ProgressBar :value="budgetPct" :class="{ over: !budget.within_budget }" />
          <span class="muted">{{ budget.within_budget ? 'в бюджете' : 'ПРЕВЫШЕНИЕ' }}
            (запас {{ fmt(budget.headroom ?? 0) }})</span>
        </div>
      </template>
    </Card>
    <DataTable :value="decisions" size="small" scrollable edit-mode="cell" stripedRows>
      <Column field="employee" header="Сотрудник" />
      <Column field="grade" header="Грейд" />
      <Column field="salary" header="Оклад">
        <template #body="{ data: d }">{{ fmt(d.salary) }}</template>
      </Column>
      <Column field="final_rating" header="Оценка">
        <template #editor="{ data: d }">
          <InputText v-model="d.final_rating" @change="patch(d)" />
        </template>
        <template #body="{ data: d }">
          <b :style="{ color: letterColor(d.final_rating) }">{{ d.final_rating }}</b>
        </template>
      </Column>
      <Column field="decision" header="Решение">
        <template #editor="{ data: d }">
          <Dropdown v-model="d.decision" :options="decisionKinds" @change="patch(d)" />
        </template>
        <template #body="{ data: d }">{{ decisionLabels[d.decision] || d.decision }}</template>
      </Column>
      <Column field="target_grade" header="Целевой грейд">
        <template #editor="{ data: d }">
          <Dropdown v-model="d.target_grade" :options="grades" @change="patch(d)" />
        </template>
      </Column>
      <Column field="target_salary" header="Целевая ЗП">
        <template #editor="{ data: d }">
          <InputText v-model.number="d.target_salary" @change="patch(d)" />
        </template>
        <template #body="{ data: d }">{{ d.target_salary ? fmt(d.target_salary) : '' }}</template>
      </Column>
      <Column field="raise_pct" header="Рейз %">
        <template #editor="{ data: d }">
          <InputText v-model.number="d.raise_pct" @change="patch(d)" />
        </template>
      </Column>
      <Column header="⚠">
        <template #body="{ data: d }">
          <i v-for="(w, i) in d.warnings" :key="i" class="pi pi-exclamation-triangle"
             style="color:#f59e0b; margin-right:4px" v-tooltip.top="w" />
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="createDialog" modal header="Новое решение">
      <div class="create-form">
        <Dropdown v-model="newDecision.employee_id" :options="employees" option-label="full_name"
                  option-value="id" filter placeholder="Сотрудник" />
        <Dropdown v-model="newDecision.decision" :options="decisionKinds" placeholder="Решение" />
        <InputText v-model.number="newDecision.raise_pct" placeholder="Рейз %" />
        <InputText v-model.number="newDecision.target_salary" placeholder="Целевая ЗП" />
        <Button label="Создать (оценка подтянется из калибровки)" :loading="busy" @click="create" />
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import ProgressBar from 'primevue/progressbar'
import { decisionsApi, reviewsApi, staffApi } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const cycles = ref<any[]>([])
const cycleId = ref<number | null>(null)
const decisions = ref<any[]>([])
const budget = ref<any>(null)
const employees = ref<any[]>([])
const createDialog = ref(false)
const busy = ref(false)
const newDecision = ref<any>({ employee_id: null, decision: 'raise-now', raise_pct: null, target_salary: null })
const decisionKinds = ['keep', 'next-cycle', 'grade-nomination', 'raise-now', 'raise-later']
const grades = ref<string[]>([])
const decisionLabels: Record<string, string> = {
  keep: 'оставить', 'next-cycle': 'следующий цикл', 'grade-nomination': 'номинация на грейд',
  'raise-now': 'дать сейчас', 'raise-later': 'дать потом',
}

const budgetPct = computed(() =>
  budget.value?.limit ? Math.min(150, Math.round((budget.value.planned_increase / budget.value.limit) * 100)) : 0)

function fmt(v: number) { return (v || 0).toLocaleString('ru-RU') }
function letterColor(l?: string) {
  const c = (l || '')[0]
  return { A: '#16a34a', B: '#65a30d', C: '#3b82f6', D: '#f59e0b', E: '#dc2626' }[c] || '#334155'
}

onMounted(async () => {
  grades.value = (await reviewsApi.publicSettings()).grades || []
  cycles.value = await reviewsApi.cycles()
  cycleId.value = cycles.value.find((c: any) => !['closed', 'imported'].includes(c.stage))?.id || null
  employees.value = await staffApi.listEmployees()
})
watch(cycleId, load)
async function load() {
  if (!cycleId.value) return
  decisions.value = await decisionsApi.list(cycleId.value)
  budget.value = await decisionsApi.budget(cycleId.value)
}

async function patch(d: any) {
  try {
    const r = await decisionsApi.patch(d.id, {
      final_rating: d.final_rating, decision: d.decision, target_grade: d.target_grade,
      target_salary: d.target_salary, raise_pct: d.raise_pct,
    })
    d.warnings = r.warnings || d.warnings
    await load()
  } catch (e) { toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) }) }
}

async function create() {
  busy.value = true
  try {
    await decisionsApi.create(cycleId.value!, newDecision.value)
    createDialog.value = false
    await load()
  } catch (e) { toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) }) }
  finally { busy.value = false }
}

async function exportXlsx() {
  if (!cycleId.value) return
  const blob = await decisionsApi.exportDecisions(cycleId.value)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `decisions-${cycleId.value}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.head { display: flex; gap: 10px; flex-wrap: wrap; }
.budget { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; }
.budget .over :deep(.p-progressbar-value) { background: #dc2626; }
.create-form { display: flex; flex-direction: column; gap: 10px; min-width: 320px; }
</style>
