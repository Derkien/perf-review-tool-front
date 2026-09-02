<template>
  <div class="page">
    <div class="head-row">
      <h1 style="margin:0">Дашборд цикла</h1>
      <div class="head-actions">
        <Dropdown v-model="cycleId" :options="cycles" option-label="label" option-value="id"
                  placeholder="Цикл" style="min-width: 260px" />
        <Button v-if="auth.can('ROLE_C_CYCLE')" label="Новый цикл" size="small"
                @click="createVisible = true" />
      </div>
    </div>

    <div v-if="cycle" class="cards">
      <Card>
        <template #title>{{ cycle.name }}</template>
        <template #content>
          <Tag :value="stageLabel" :severity="cycle.stage === 'cancelled' ? 'danger' : cycle.stage === 'closed' ? 'success' : 'info'" />
          <div v-for="(d, s) in cycle.stage_deadlines" :key="s" class="muted" style="margin-top:4px">
            {{ stageNames[s] || s }}: до {{ String(d).slice(0, 10) }}
          </div>
          <div v-if="cycle.period_start || cycle.period_end" class="muted" style="margin-top:4px">
            период: {{ cycle.period_start || '…' }} — {{ cycle.period_end || '…' }}
          </div>
          <!-- переходы стейт-машины: кнопки из каталога, причины блокировки — в тултипе -->
          <div class="transitions">
            <template v-for="trItem in transitions" :key="trItem.name">
              <Button v-if="trItem.allowed" :label="trItem.label" size="small"
                      :loading="busy && busyTransition === trItem.name"
                      :severity="trItem.name === 'cancel' ? 'danger' : trItem.name === 'finish' ? 'success' : undefined"
                      :text="trItem.name === 'cancel'" @click="applyTransition(trItem)" />
              <Button v-else :label="trItem.label" size="small" severity="secondary" text disabled
                      v-tooltip.top="trItem.reasons.join('; ') || 'недостаточно прав'" />
            </template>
          </div>
        </template>
      </Card>
      <Card><template #title>Селф-ревью</template><template #content>
        <big>{{ t.self_done }} / {{ t.employees }}</big>
      </template></Card>
      <Card><template #title>Ответы пиров</template><template #content>
        <big>{{ t.peer_answers }} / {{ t.peer_assignments }}</big>
      </template></Card>
      <Card><template #title>Предоценки руклей</template><template #content>
        <big>{{ t.leader_done }} / {{ t.employees }}</big>
      </template></Card>
    </div>
    <div class="grid-2">
      <Card>
        <template #title>Распределение предварительных оценок</template>
        <template #content>
          <div class="dist">
            <div v-for="L in ['A','B','C','D','E']" :key="L" class="dist-row">
              <b>{{ L }}</b>
              <div class="dist-bar"><div :style="{ width: pct(L) + '%', background: colors[L] }" /></div>
              <span class="muted">{{ dist[L] || 0 }}</span>
            </div>
          </div>
        </template>
      </Card>
      <Card>
        <template #title>Прогресс по отделам</template>
        <template #content>
          <DataTable :value="deptRows" size="small" scrollable scroll-height="260px">
            <Column field="dept" header="Отдел" />
            <Column field="total" header="Чел." />
            <Column field="self_done" header="Селф" />
            <Column field="peer_answers" header="Ответы" />
            <Column field="peer_total" header="Задания" />
          </DataTable>
        </template>
      </Card>
    </div>
    <Card style="margin-top:16px">
      <template #title>Кого пушить</template>
      <template #content>
        <DataTable :value="data?.problems || []" size="small" scrollable scroll-height="300px"
                   paginator :rows="15">
          <Column field="employee" header="Сотрудник" />
          <Column field="team" header="Команда" />
          <Column field="issue" header="Проблема">
            <template #body="{ data: p }">
              <Tag :value="p.issue" :severity="p.issue.includes('не отправлено') ? 'danger' : 'warn'" />
            </template>
          </Column>
        </DataTable>
      </template>
    </Card>

    <!-- создание цикла -->
    <Dialog v-model:visible="createVisible" modal header="Новый цикл перф-ревью" style="width: 420px">
      <div class="create-form">
        <label>Название <InputText v-model="newCycle.name" placeholder="Осень 2026" class="w100" /></label>
        <span class="muted small">
          Цикл создаётся в стадии «подготовка»; далее — переходами стейт-машины
          (сбор ачивок → пиры → предоценки → калибровки → решения → закрыт).
        </span>
        <Button label="Создать" size="small" :disabled="!newCycle.name.trim()" :loading="busy"
                @click="createCycle" />
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
import Tag from 'primevue/tag'
import { reviewsApi } from '../api/endpoints'
import type { Cycle, CycleTransition } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAuth } from '../stores/auth'
import { useToast } from 'primevue/usetoast'

const auth = useAuth()
const toast = useToast()
const data = ref<any>(null)
const cycles = ref<(Cycle & { label?: string })[]>([])
const cycleId = ref<number | null>(null)
const transitions = ref<CycleTransition[]>([])
const busy = ref(false)
const busyTransition = ref('')
const createVisible = ref(false)
const newCycle = ref({ name: '' })

const cycle = computed(() => cycles.value.find((c) => c.id === cycleId.value) || null)
const t = computed(() => data.value?.totals || {})
const dist = computed(() => data.value?.letter_distribution || {})
const stageNames: Record<string, string> = {
  'self-review': 'Сбор ачивок', 'peer-review': 'Оценки пиров', 'leader-assessment': 'Предоценки',
  calibration: 'Калибровки', decision: 'Решения', closed: 'Закрыт', preparation: 'Подготовка',
  cancelled: 'Отменён',
}
const stageLabel = computed(() => stageNames[cycle.value?.stage || ''] || cycle.value?.stage)
const colors: Record<string, string> = { A: '#16a34a', B: '#65a30d', C: '#3b82f6', D: '#f59e0b', E: '#dc2626' }

const deptRows = computed(() =>
  Object.entries(data.value?.by_department || {}).map(([dept, v]: [string, any]) => ({ dept, ...v })))

function cycleLabel(c: Cycle): string {
  const stage = stageNames[c.stage] || c.stage
  const period = c.period_end ? ` · до ${c.period_end.slice(0, 10)}` : ''
  return `${c.name}${period} · ${stage}`
}

function pct(L: string) {
  const total = Object.values(dist.value).reduce((a: number, b: any) => a + (b as number), 0) || 1
  return Math.round(((dist.value[L] || 0) / total) * 100)
}

onMounted(async () => {
  await refreshCycles()
  cycleId.value = (cycles.value.find((c) => !['closed', 'imported', 'cancelled'].includes(c.stage))
    || cycles.value[0])?.id || null
  await load()
})

watch(cycleId, load)

async function refreshCycles() {
  cycles.value = await reviewsApi.cycles()
  cycles.value.forEach((c) => { c.label = cycleLabel(c) })
}

async function load() {
  if (!cycleId.value) return
  const [dash, tr] = await Promise.all([
    reviewsApi.dashboard(cycleId.value),
    reviewsApi.transitions(cycleId.value),
  ])
  data.value = dash
  transitions.value = tr.transitions
}

async function applyTransition(trItem: CycleTransition) {
  if (!cycleId.value) return
  if (trItem.name === 'cancel' && !window.confirm(`Отменить цикл «${cycle.value?.name}»?`)) return
  busy.value = true
  busyTransition.value = trItem.name
  try {
    await reviewsApi.applyTransition(cycleId.value, trItem.name)
    toast.add({ severity: 'success', summary: `Стадия: ${stageNames[trItem.to] || trItem.to}`, life: 4000 })
    await refreshCycles()
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Переход не выполнен', detail: errMsg(e), life: 10000 })
    await load()
  } finally { busy.value = false; busyTransition.value = '' }
}

async function createCycle() {
  busy.value = true
  try {
    const r = await reviewsApi.createCycle({ name: newCycle.value.name.trim() })
    createVisible.value = false
    newCycle.value = { name: '' }
    toast.add({ severity: 'success', summary: 'Цикл создан (подготовка)', life: 4000 })
    await refreshCycles()
    cycleId.value = r.id
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}
</script>

<style scoped>
.head-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.head-actions { display: flex; gap: 10px; align-items: center; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1.4fr; gap: 12px; margin-top: 16px; }
.dist-row { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
.dist-row b { width: 16px; }
.dist-bar { flex: 1; background: #f1f5f9; border-radius: 4px; height: 14px; }
.dist-bar > div { height: 100%; border-radius: 4px; }
.transitions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.create-form { display: flex; flex-direction: column; gap: 10px; }
.create-form label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; }
.w100 { width: 100%; box-sizing: border-box; }
@media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
</style>
