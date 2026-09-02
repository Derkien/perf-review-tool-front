<template>
  <div class="page">
    <div class="head-row">
      <h1 style="margin:0">Сотрудники</h1>
      <div class="head-actions">
        <label v-if="auth.me?.has_subordinates" class="mine-toggle">
          <Checkbox v-model="mineOnly" :binary="true" @update:model-value="load" /> мои
        </label>
        <!-- контекст цикла: доступен управляющим циклами/составом -->
        <Dropdown v-if="canManageCycle" v-model="cycleId" :options="cycleOptions"
                  option-label="label" option-value="id" placeholder="Цикл"
                  style="min-width: 220px" show-clear @change="onCycleChange" />
        <SelectButton v-if="cycleId" v-model="participantFilter" :options="pfOptions"
                      option-label="label" option-value="value" size="small"
                      @change="applyParticipantFilter" />
        <Button v-if="selected.length && cycleId && auth.can('ROLE_U_CYCLE_PARTICIPANTS')"
                label="Исключить из цикла" size="small" severity="danger" text
                :loading="busy" @click="excludeSelected" />
        <Button v-if="selected.length && cycleId && auth.can('ROLE_U_CYCLE_PARTICIPANTS')"
                label="Вернуть в цикл" size="small" severity="success" text
                :loading="busy" :disabled="participantFilter !== 'excluded'"
                @click="includeSelected" />
        <Button v-if="selected.length && cycleId && auth.can('ROLE_C_CYCLE_BROADCAST')"
                label="Уведомить" size="small" severity="info" text
                :loading="busy" @click="notifyVisible = true" />
        <Button v-if="selected.length && auth.can('ROLE_C_PEER_ASSIGNMENT')"
                label="Отправить задания на оценку" size="small" severity="secondary"
                :disabled="!sendWindow" :loading="busy"
                v-tooltip.top="sendWindow
                  ? 'По итоговому набору пиров: новые задания + повторные уведомления несдавшим; отправленные оценки не затрагиваются'
                  : `Отправка возможна только на стадиях сбора ачивок / оценок пиров / предоценок (сейчас: ${activeStageLabel})`"
                @click="confirmSend" />
        <span v-if="selected.length" class="muted small">выбрано: {{ selected.length }}</span>
      </div>
    </div>
    <div class="filters">
      <InputText v-model="q" placeholder="Поиск по ФИО/email" size="small" @input="debounced" />
      <Dropdown v-model="group" :options="groups" placeholder="Специализация" size="small" showClear @change="load" />
      <Dropdown v-model="grade" :options="grades" placeholder="Грейд" size="small" showClear @change="load" />
    </div>
    <DataTable v-model:selection="selected" :value="rows" size="small" paginator :rows="25"
               scrollable stripedRows data-key="id" selection-mode="multiple"
               style="cursor: pointer"
               @row-click="(e: any) => openCard(e.data)">
      <Column selection-mode="multiple" style="width: 34px" />
      <Column field="full_name" header="ФИО" sortable>
        <template #body="{ data: e }">
          <span class="name-link" @click.stop="openCard(e)">{{ e.full_name }}</span>
        </template>
      </Column>
      <Column field="functional_group" header="Специализация">
        <template #body="{ data: e }">
          <Tag v-if="e.functional_group" :value="groupLabel(e.functional_group)" severity="secondary" />
          <span v-else class="muted">—</span>
        </template>
      </Column>
      <Column field="grade" header="Грейд" sortable />
      <Column field="org_unit" header="Команда" />
      <Column field="manager" header="Рукль" />
      <Column header="Действия" style="width: 116px">
        <template #body="{ data: e }">
          <div class="acts">
            <Button icon="pi pi-user" size="small" text outlined rounded
                    v-tooltip.top="'Профиль сотрудника'" @click.stop="openCard(e)" />
            <Button v-if="canEditPeers" icon="pi pi-users" size="small" text outlined rounded
                    severity="success" v-tooltip.top="'Пиры сотрудника'"
                    @click.stop="peersFor = e" />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- масс-уведомление в контексте цикла: пресет по стадии или свой текст -->
    <Dialog v-model:visible="notifyVisible" modal
            :header="`Уведомить выбранных (${selected.length}) — цикл «${cycleLabelOf(cycleId)}»`"
            style="width: 520px">
      <div class="notify-form">
        <label>Пресет (по стадии цикла)
          <Dropdown v-model="notifyTemplate" :options="templateOptions"
                    option-label="label" option-value="value" class="w100" />
        </label>
        <label v-if="notifyTemplate === 'custom'">Текст
          <Textarea v-model="notifyText" rows="3" class="w100"
                    placeholder="Что сообщить выбранным сотрудникам" />
        </label>
        <Button label="Отправить" size="small" :loading="busy" @click="sendNotify" />
      </div>
    </Dialog>

    <PeerEditDialog v-if="peersFor" :employee-id="peersFor.id" :employee-name="peersFor.full_name"
                    :team="peersFor.org_unit" @close="peersFor = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import Textarea from 'primevue/textarea'
import Checkbox from 'primevue/checkbox'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import PeerEditDialog from '../components/PeerEditDialog.vue'
import { reviewsApi, staffApi } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAuth } from '../stores/auth'
import { useToast } from 'primevue/usetoast'

const auth = useAuth()
const router = useRouter()
const toast = useToast()
const rows = ref<any[]>([])
const selected = ref<any[]>([])
const q = ref('')
const group = ref<string | null>(null)
const grade = ref<string | null>(null)
const mineOnly = ref(false)
const peersFor = ref<any>(null)
const busy = ref(false)
const groups = ['backend', 'frontend', 'qa', 'ios', 'android', 'devops', 'management', 'other']
const grades = ['Стажёр', 'Младший', 'Основной 1', 'Основной 2', 'Старший 1', 'Старший 2', 'Ведущий 1', 'Ведущий 2', 'Ключевой 1', 'Ключевой 2']

// правка пиров: линейный рукль/админ/cto или делегат (настройка delegation)
const canEditPeers = computed(() =>
  auth.can('ROLE_U_PEER_SELECTION') || auth.role === 'admin' || auth.role === 'cto')

// --- контекст цикла (fixes: управление составом участников) ---
const canManageCycle = computed(() =>
  auth.can('ROLE_U_CYCLE_PARTICIPANTS') || auth.can('ROLE_C_CYCLE'))
const cycles = ref<any[]>([])
const cycleId = ref<number | null>(null)
const excludedIds = ref<Set<number>>(new Set())
const participantFilter = ref<'included' | 'excluded' | 'all'>('included')
const pfOptions = [
  { label: 'В цикле', value: 'included' },
  { label: 'Исключены', value: 'excluded' },
  { label: 'Все', value: 'all' },
]
const cycleOptions = computed(() =>
  cycles.value.map((c) => ({ id: c.id, label: `${c.name} · ${stageNames[c.stage] || c.stage}` })))
const cycleLabelOf = (id: number | null) =>
  cycles.value.find((c) => c.id === id)?.name || ''
const notifyVisible = ref(false)
const notifyTemplate = ref('')
const notifyText = ref('')
const templateOptions = computed(() => {
  const stage = cycles.value.find((c) => c.id === cycleId.value)?.stage
  const byStage: Record<string, string> = {
    'self-review': 'self-review-reminder',
    'peer-review': 'peer-review-reminder',
    'leader-assessment': 'leader-assessment-reminder',
    calibration: 'calibration-reminder',
    decision: 'decision-reminder',
  }
  const preset = byStage[stage || '']
  return [
    ...(preset ? [{ label: `Умный пресет стадии (${stageNames[stage || ''] || stage})`, value: preset }] : []),
    { label: 'Свой текст', value: 'custom' },
  ]
})

async function loadCycles() {
  cycles.value = await reviewsApi.cycles()
  cycleId.value = cycles.value.find(
    (c) => !['closed', 'imported', 'cancelled'].includes(c.stage))?.id || null
  if (cycleId.value) await reloadParticipants()
}

async function reloadParticipants() {
  if (!cycleId.value || !auth.can('ROLE_U_CYCLE_PARTICIPANTS')) return
  const info = await reviewsApi.participants(cycleId.value)
  excludedIds.value = new Set(info.excluded.map((x) => x.employee_id))
  applyParticipantFilter()
}

function onCycleChange() {
  selected.value = []
  excludedIds.value = new Set()
  participantFilter.value = 'included'
  reloadParticipants()
}

/** Фильтр участия: в цикле / исключённые / все (поверх загруженного списка). */
const baseRows = ref<any[]>([])
function applyParticipantFilter() {
  if (!cycleId.value || participantFilter.value === 'all') {
    rows.value = baseRows.value
    return
  }
  rows.value = baseRows.value.filter((e: any) =>
    participantFilter.value === 'excluded'
      ? excludedIds.value.has(e.id)
      : !excludedIds.value.has(e.id))
}

async function excludeSelected() {
  if (!cycleId.value) return
  const note = window.prompt(
    `Исключить ${selected.value.length} сотр. из цикла «${cycleLabelOf(cycleId.value)}»?\nПричина (необязательно):`, '') ?? ''
  if (note === null) return
  const ids = selected.value.map((e: any) => e.id)
  await reviewsApi.excludeParticipants(cycleId.value, ids, note)
  toast.add({ severity: 'success', summary: `Исключено: ${ids.length}`, life: 4000 })
  selected.value = []
  await reloadParticipants()
}

async function includeSelected() {
  if (!cycleId.value) return
  const ids = selected.value.map((e: any) => e.id)
  const r = await reviewsApi.includeParticipants(cycleId.value, ids)
  toast.add({ severity: 'success', summary: `Возвращено: ${r.included}`, life: 4000 })
  selected.value = []
  await reloadParticipants()
}

async function sendNotify() {
  if (!cycleId.value || !notifyTemplate.value) return
  if (notifyTemplate.value === 'custom' && !notifyText.value.trim()) {
    toast.add({ severity: 'warn', summary: 'Введите текст уведомления', life: 6000 })
    return
  }
  busy.value = true
  try {
    const r = await reviewsApi.broadcast(cycleId.value, {
      employee_ids: selected.value.map((e: any) => e.id),
      template: notifyTemplate.value,
      text: notifyText.value,
    })
    toast.add({ severity: 'success', summary: `Уведомление отправлено (${r.sent})`, life: 4000 })
    notifyVisible.value = false
    notifyText.value = ''
    notifyTemplate.value = ''
    selected.value = []
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}

// окно отправки заданий: только стадии оценок действующего цикла (стейт-машина)
const stageNames: Record<string, string> = {
  'self-review': 'сбор ачивок', 'peer-review': 'оценки пиров', 'leader-assessment': 'предоценки',
  calibration: 'калибровки', decision: 'решения', closed: 'закрыт', preparation: 'подготовка',
  cancelled: 'отменён', imported: 'импорт',
}
const sendStages = ['self-review', 'peer-review', 'leader-assessment']
const activeStage = ref('')
const activeStageLabel = computed(() => stageNames[activeStage.value] || activeStage.value || '—')
const sendWindow = computed(() => sendStages.includes(activeStage.value))

async function refreshActiveStage() {
  const cycles = await reviewsApi.cycles()
  const c = cycles.find((x) => !['closed', 'imported', 'cancelled'].includes(x.stage))
  activeStage.value = c?.stage || ''
}

function confirmSend() {
  const ok = window.confirm(
    `Отправить задания на оценку для ${selected.value.length} сотр.?\n` +
    'По итоговому набору пиров каждого: новые пиры получат задания, ' +
    'несдавшим придёт повторное уведомление; уже отправленные оценки не затрагиваются.')
  if (ok) sendAssignments()
}

const groupLabels: Record<string, string> = {
  backend: 'бэкенд', frontend: 'фронтенд', qa: 'QA', ios: 'iOS', android: 'Android',
  devops: 'DevOps', management: 'менеджмент', other: 'другое',
}
function groupLabel(g: string): string { return groupLabels[g] || g }

let timer: number | undefined
function debounced() { clearTimeout(timer); timer = window.setTimeout(load, 300) }

onMounted(() => { refreshActiveStage(); loadCycles(); load() })
async function load() {
  const params: any = {}
  if (q.value) params.q = q.value
  if (group.value) params.functional_group = group.value
  if (grade.value) params.grade = grade.value
  // по умолчанию рукль видит подчинённых, сотрудник — свою команду; «мои» — явный фильтр
  if (mineOnly.value) params.scope = 'mine'
  baseRows.value = await staffApi.listEmployees(
    canManageCycle.value ? { ...params, scope: 'all' } : params)
  applyParticipantFilter()
}

function openCard(e: any) {
  router.push(`/staff/${e.id}`)
}

async function sendAssignments() {
  const cycles = await reviewsApi.cycles()
  const cycle = cycles.find((c) => !['closed', 'imported', 'cancelled'].includes(c.stage))
  if (!cycle) {
    toast.add({ severity: 'warn', summary: 'Нет активного цикла', life: 6000 })
    return
  }
  if (!sendStages.includes(cycle.stage)) {
    toast.add({
      severity: 'warn', life: 8000,
      summary: `Отправка закрыта стадией «${stageNames[cycle.stage] || cycle.stage}»`,
      detail: 'Задания рассылаются только на стадиях сбора ачивок / оценок пиров / предоценок',
    })
    return
  }
  busy.value = true
  try {
    const r = await reviewsApi.sendAssignments({
      cycle_id: cycle.id, employee_ids: selected.value.map((e: any) => e.id),
    })
    toast.add({
      severity: 'success', life: 6000,
      summary: `Заданий создано: ${r.created}, уведомлено: ${r.notified} (цикл «${cycle.name}»)`,
    })
    selected.value = []
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}
</script>

<style scoped>
.head-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.head-actions { display: flex; align-items: center; gap: 12px; }
.mine-toggle { display: flex; align-items: center; gap: 6px; font-size: 0.88rem; cursor: pointer; }
.notify-form { display: flex; flex-direction: column; gap: 10px; }
.notify-form label { display: flex; flex-direction: column; gap: 5px; font-size: 0.85rem; }
.filters { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.name-link { color: #2563eb; cursor: pointer; }
.name-link:hover { text-decoration: underline; }
.acts { display: flex; gap: 8px; align-items: center; }
</style>
