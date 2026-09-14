<template>
  <div class="page">
    <div class="head-row">
      <h1 style="margin:0">Сотрудники</h1>
      <Dropdown v-if="canManageCycle" v-model="cycleId" :options="cycleOptions"
                option-label="label" option-value="id" placeholder="Цикл"
                style="min-width: 230px" show-clear @change="onCycleChange" />
    </div>

    <!-- фильтры: лаконичная шапка над таблицей, всё в одной линии -->
    <div class="filter-bar">
      <span class="filter-field grow">
        <i class="pi pi-search" />
        <InputText v-model="q" placeholder="Поиск по ФИО / email" size="small"
                   class="w100" @input="debounced" />
      </span>
      <Dropdown v-model="group" :options="groups" placeholder="Специализация" size="small"
                showClear class="filter-field" @change="load" />
      <Dropdown v-model="grade" :options="grades" placeholder="Грейд" size="small"
                showClear class="filter-field" @change="load" />
      <label v-if="auth.me?.has_subordinates" class="mine-toggle">
        <Checkbox v-model="mineOnly" :binary="true" @update:model-value="load" /> мои
      </label>
      <SelectButton v-if="cycleId" v-model="participantFilter" :options="pfOptions"
                    option-label="label" option-value="value" size="small"
                    @change="applyParticipantFilter" />
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
          <Tag v-if="e.functional_group" :value="groupLabel(e.functional_group)"
               severity="secondary" />
          <span v-else class="muted">—</span>
        </template>
      </Column>
      <Column field="grade" header="Грейд" sortable />
      <Column field="org_unit" header="Команда" />
      <Column field="manager" header="Рукль" />
      <Column header="Действия" style="width: 190px">
        <template #body="{ data: e }">
          <StaffRowActions :excluded="excludedIds.has(e.id)"
                           :can-toggle-cycle="!!cycleId && auth.can('ROLE_U_CYCLE_PARTICIPANTS')"
                           :can-broadcast="!!cycleId && auth.can('ROLE_C_CYCLE_BROADCAST')"
                           :can-send="auth.can('ROLE_C_PEER_ASSIGNMENT')"
                           :send-window="sendWindow" :stage-label="activeStageLabel"
                           @profile="openCard(e)" @peers="peersFor = e"
                           @notify="notifyTargets = [e]"
                           @send="sendTo([e.id])"
                           @toggle-cycle="toggleCycleFor(e)" />
        </template>
      </Column>
    </DataTable>

    <!-- плавающая панель масс-действий: фильтры не двигаются -->
    <MassActionBar :count="selected.length" :busy="busy"
                   :can-toggle-cycle="!!cycleId && auth.can('ROLE_U_CYCLE_PARTICIPANTS')"
                   :can-broadcast="!!cycleId && auth.can('ROLE_C_CYCLE_BROADCAST')"
                   :can-send="auth.can('ROLE_C_PEER_ASSIGNMENT')"
                   :send-window="sendWindow" :stage-label="activeStageLabel"
                   :disabled-include="participantFilter !== 'excluded'"
                   @exclude="excludeFrom(excludedSelection)"
                   @include="includeBack(excludedSelection)"
                   @notify="notifyTargets = [...selected]"
                   @send="sendTo(selected.map((e: any) => e.id))"
                   @clear="selected = []" />

    <!-- масс-уведомление: пресет по стадии или свой текст -->
    <Dialog :visible="notifyTargets !== null" modal
            :header="`Уведомить (${notifyTargets?.length || 0}) — цикл «${cycleLabelOf(cycleId)}»`"
            style="width: 520px" @update:visible="notifyTargets = null">
      <div class="notify-form">
        <label>Пресет (по стадии цикла)
          <Dropdown v-model="notifyTemplate" :options="templateOptions"
                    option-label="label" option-value="value" class="w100"
                    placeholder="Выберите шаблон" />
        </label>
        <label v-if="notifyTemplate === 'custom'">Текст
          <Textarea v-model="notifyText" rows="3" class="w100"
                    placeholder="Что сообщить сотрудникам" />
        </label>
        <Button label="Отправить" size="small" :loading="busy"
                :disabled="!notifyTemplate || (notifyTemplate === 'custom' && !notifyText.trim())"
                @click="sendNotify" />
      </div>
    </Dialog>

    <PeerEditDialog v-if="peersFor" :employee-id="peersFor.id"
                    :employee-name="peersFor.full_name" :team="peersFor.org_unit"
                    @close="peersFor = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import MassActionBar from '../components/MassActionBar.vue'
import PeerEditDialog from '../components/PeerEditDialog.vue'
import StaffRowActions from '../components/StaffRowActions.vue'
import { reviewsApi, staffApi } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAuth } from '../stores/auth'
import { useToast } from 'primevue/usetoast'

const auth = useAuth()
const router = useRouter()
const toast = useToast()
const rows = ref<any[]>([])
const baseRows = ref<any[]>([])
const selected = ref<any[]>([])
const q = ref('')
const group = ref<string | null>(null)
const grade = ref<string | null>(null)
const mineOnly = ref(false)
const peersFor = ref<any>(null)
const busy = ref(false)
const notifyTargets = ref<any[] | null>(null)
const notifyTemplate = ref('')
const notifyText = ref('')
const groups = ['backend', 'frontend', 'qa', 'ios', 'android', 'devops', 'management', 'other']
const grades = ['Стажёр', 'Младший', 'Основной 1', 'Основной 2', 'Старший 1', 'Старший 2', 'Ведущий 1', 'Ведущий 2', 'Ключевой 1', 'Ключевой 2']

const groupLabels: Record<string, string> = {
  backend: 'бэкенд', frontend: 'фронтенд', qa: 'QA', ios: 'iOS', android: 'Android',
  devops: 'DevOps', management: 'менеджмент', other: 'другое',
}
function groupLabel(g: string): string { return groupLabels[g] || g }

// --- контекст цикла ---
const stageNames: Record<string, string> = {
  'self-review': 'сбор ачивок', 'peer-review': 'оценки пиров', 'leader-assessment': 'предоценки',
  calibration: 'калибровки', decision: 'решения', closed: 'закрыт', preparation: 'подготовка',
  cancelled: 'отменён', imported: 'импорт',
}
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

const sendStages = ['self-review', 'peer-review', 'leader-assessment']
const activeStage = ref('')
const activeStageLabel = computed(() => stageNames[activeStage.value] || activeStage.value || '—')
const sendWindow = computed(() => sendStages.includes(activeStage.value))

// для масс-возврата берём только реально исключённых из выбранных
const excludedSelection = computed(() =>
  selected.value.filter((e: any) => excludedIds.value.has(e.id)).map((e: any) => e.id))

let timer: number | undefined
function debounced() { clearTimeout(timer); timer = window.setTimeout(load, 300) }

onMounted(() => { refreshActiveStage(); loadCycles(); load() })

async function refreshActiveStage() {
  const cs = await reviewsApi.cycles()
  const c = cs.find((x) => !['closed', 'imported', 'cancelled'].includes(x.stage))
  activeStage.value = c?.stage || ''
}

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

async function load() {
  const params: any = {}
  if (q.value) params.q = q.value
  if (group.value) params.functional_group = group.value
  if (grade.value) params.grade = grade.value
  if (mineOnly.value) params.scope = 'mine'
  baseRows.value = await staffApi.listEmployees(
    canManageCycle.value ? { ...params, scope: 'all' } : params)
  applyParticipantFilter()
}

function openCard(e: any) {
  router.push(`/staff/${e.id}`)
}

// --- действия: единые для одиночного и массового (fixes8) ---
async function toggleCycleFor(e: any) {
  if (!cycleId.value) return
  if (excludedIds.value.has(e.id)) await includeBack([e.id])
  else await excludeFrom([e.id])
}

async function excludeFrom(ids: number[]) {
  if (!cycleId.value || !ids.length) return
  const note = window.prompt(
    `Исключить ${ids.length} сотр. из цикла «${cycleLabelOf(cycleId.value)}»?` +
    '\nПричина (необязательно):', '') ?? ''
  await reviewsApi.excludeParticipants(cycleId.value, ids, note)
  toast.add({ severity: 'success', summary: `Исключено: ${ids.length}`, life: 4000 })
  selected.value = []
  await reloadParticipants()
}

async function includeBack(ids: number[]) {
  if (!cycleId.value || !ids.length) return
  const r = await reviewsApi.includeParticipants(cycleId.value, ids)
  toast.add({ severity: 'success', summary: `Возвращено: ${r.included}`, life: 4000 })
  selected.value = []
  await reloadParticipants()
}

async function sendTo(ids: number[]) {
  const cs = await reviewsApi.cycles()
  const cycle = cs.find((c) => !['closed', 'imported', 'cancelled'].includes(c.stage))
  if (!cycle) {
    toast.add({ severity: 'warn', summary: 'Нет активного цикла', life: 6000 })
    return
  }
  if (!sendStages.includes(cycle.stage)) {
    toast.add({
      severity: 'warn', life: 8000,
      summary: `Отправка закрыта стадией «${stageNames[cycle.stage] || cycle.stage}»`,
      detail: 'Задания рассылаются на стадиях сбора ачивок / оценок пиров / предоценок',
    })
    return
  }
  busy.value = true
  try {
    const r = await reviewsApi.sendAssignments({
      cycle_id: cycle.id, employee_ids: ids,
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

async function sendNotify() {
  if (!cycleId.value || !notifyTemplate.value || !notifyTargets.value?.length) return
  busy.value = true
  try {
    const r = await reviewsApi.broadcast(cycleId.value, {
      employee_ids: notifyTargets.value.map((e: any) => e.id),
      template: notifyTemplate.value,
      text: notifyText.value,
    })
    toast.add({ severity: 'success', summary: `Уведомление отправлено (${r.sent})`, life: 4000 })
    notifyTargets.value = null
    notifyText.value = ''
    notifyTemplate.value = ''
    selected.value = []
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}
</script>

<style scoped>
.head-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
/* фильтры — лаконичная шапка над таблицей */
.filter-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 8px 12px; margin-bottom: 12px;
}
.filter-field { min-width: 150px; }
.filter-field.grow {
  flex: 1; min-width: 220px; display: flex; align-items: center; gap: 8px;
}
.filter-field.grow .pi { color: #94a3b8; }
.mine-toggle { display: flex; align-items: center; gap: 6px; font-size: 0.88rem; cursor: pointer; white-space: nowrap; }
.name-link { color: #2563eb; cursor: pointer; }
.name-link:hover { text-decoration: underline; }
.notify-form { display: flex; flex-direction: column; gap: 10px; }
.notify-form label { display: flex; flex-direction: column; gap: 5px; font-size: 0.85rem; }
.w100 { width: 100%; box-sizing: border-box; }
</style>
