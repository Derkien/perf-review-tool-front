<template>
  <div class="page">
    <h1>Внецикловые номинации на повышение</h1>
    <div class="head">
      <Button v-if="canNominate" label="+ Номинация" @click="dialog = true" />
      <Button label="Экспорт XLSX" severity="secondary" @click="exportXlsx" />
      <span class="muted">Список к подаче до 4 сентября</span>
    </div>
    <DataTable :value="nominations" size="small" stripedRows>
      <Column field="employee" header="Сотрудник" />
      <Column field="grade" header="Грейд" />
      <Column field="salary" header="Оклад">
        <template #body="{ data: n }">{{ (n.salary || 0).toLocaleString('ru') }}</template>
      </Column>
      <Column header="Предложение">
        <template #body="{ data: n }">
          {{ n.proposed_pct ? n.proposed_pct + '%' : (n.proposed_salary || 0).toLocaleString('ru') + ' ₽' }}
          <Tag v-if="n.target_grade" :value="n.target_grade" severity="info" style="margin-left:6px" />
        </template>
      </Column>
      <Column field="rationale" header="Обоснование" style="max-width: 320px">
        <template #body="{ data: n }"><span class="small">{{ n.rationale }}</span></template>
      </Column>
      <Column field="nominator" header="Номинатор" />
      <Column header="⚠">
        <template #body="{ data: n }">
          <i v-for="(w, i) in n.warnings" :key="i" class="pi pi-exclamation-triangle"
             style="color:#f59e0b; margin-right:4px" v-tooltip.top="w as string" />
        </template>
      </Column>
      <Column field="status" header="Статус">
        <template #body="{ data: n }">
          <Tag v-if="canDecide" :value="statusLabel(n)" :severity="sev(n.status)"
               style="cursor:pointer" @click="decide(n)" />
          <Tag v-else :value="statusLabel(n)" :severity="sev(n.status)" />
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="dialog" modal header="Новая номинация">
      <div class="form">
        <Dropdown v-model="form.employee_id" :options="employees" option-label="full_name"
                  option-value="id" filter placeholder="Сотрудник" />
        <InputText v-model.number="form.proposed_pct" placeholder="Предлагаемый % повышения" />
        <InputText v-model.number="form.proposed_salary" placeholder="Или целевая ЗП (₽)" />
        <InputText v-model="form.target_grade" placeholder="Целевой грейд (опционально)" />
        <Textarea v-model="form.rationale" rows="4" placeholder="Обоснование: за что конкретно" class="w100" />
        <Button label="Подать" :loading="busy" @click="submit" />
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { api, errMsg } from '../api'
import { useAuth } from '../stores/auth'
import { useToast } from 'primevue/usetoast'

const auth = useAuth()
const toast = useToast()
const nominations = ref<any[]>([])
const employees = ref<any[]>([])
const dialog = ref(false)
const busy = ref(false)
const form = ref<any>({ employee_id: null, proposed_pct: null, proposed_salary: null, target_grade: '', rationale: '' })
const statusLabels: Record<string, string> = {
  submitted: 'подана', approved: 'одобрена', rejected: 'отклонена', deferred: 'отложена',
}
const canNominate = computed(() => ['admin', 'cto', 'line-manager'].includes(auth.role))
const canDecide = computed(() => ['admin', 'cto'].includes(auth.role))

function statusLabel(n: any): string {
  return statusLabels[String(n?.status)] || String(n?.status ?? '')
}

function sev(s: string) {
  return { approved: 'success', rejected: 'danger', deferred: 'warn', submitted: 'info' }[s] || 'info'
}

onMounted(async () => {
  nominations.value = (await api.get('/decisions/nominations')).data
  employees.value = (await api.get('/staff/employees')).data
})

async function submit() {
  busy.value = true
  try {
    await api.post('/decisions/nominations', form.value)
    dialog.value = false
    nominations.value = (await api.get('/decisions/nominations')).data
    toast.add({ severity: 'success', summary: 'Номинация подана' })
  } catch (e) { toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) }) }
  finally { busy.value = false }
}

async function decide(n: any) {
  const transitions: Record<string, string> = { submitted: 'approved', approved: 'rejected', rejected: 'deferred', deferred: 'approved' }
  const next = transitions[String(n.status)]
  await api.patch(`/decisions/nominations/${n.id}`, { status: next, decision_comment: '' })
  nominations.value = (await api.get('/decisions/nominations')).data
}

async function exportXlsx() {
  const r = await api.get('/exports/nominations', { responseType: 'blob' })
  const url = URL.createObjectURL(r.data as Blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'nominations.xlsx'; a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.head { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.form { display: flex; flex-direction: column; gap: 10px; min-width: 340px; }
.w100 { width: 100%; box-sizing: border-box; }
.small { font-size: 0.82rem; }
</style>
