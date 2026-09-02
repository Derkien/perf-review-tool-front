<template>
  <Dialog :visible="true" modal :header="`Пиры: ${employeeName}`" :style="{ width: '860px' }"
          @update:visible="$emit('close')">
    <p class="muted small" style="margin-top:0">
      Итоговый набор: обязательные пиры из команды + дополнительные.
      «Сохранить» фиксирует список; задания рассылаются отдельно кнопкой «Отправить» —
      она доступна руклям только на стадиях сбора ачивок / оценок пиров / предоценок.
    </p>

    <div v-if="cycle" class="cycle-line">
      Цикл: <b>{{ cycle.name }}</b> · {{ stageLabel }}
      <Tag v-if="!canSend" severity="secondary">отправка закрыта стадией</Tag>
    </div>

    <div v-if="current.length || baseline.length" class="peer-grid">
      <div class="peer-col">
        <b class="section-title">Команда / обязательные</b>
        <div class="chips">
          <Tag v-for="p in mandatoryPeers" :key="p.id" v-tooltip.top="p.team || ''"
               class="chip" severity="info">{{ p.name }}</Tag>
          <span v-if="!mandatoryPeers.length" class="muted small">нет обязательных</span>
        </div>

        <b class="section-title" style="margin-top:14px">Дополнительно
          <span class="muted small">({{ extraPeers.length }})</span></b>
        <div class="chips">
          <Tag v-for="p in extraPeers" :key="p.id" class="chip" severity="success">
            {{ p.name }}
            <i class="pi pi-times chip-x" title="Убрать из списка" @click="removeLocal(p.id)" />
          </Tag>
          <span v-if="!extraPeers.length" class="muted small">
            только обязательные пиры из команды
          </span>
        </div>
      </div>

      <div class="peer-col">
        <b class="section-title">Добавить сотрудника</b>
        <Dropdown v-model="addId" :options="addable" option-label="name" option-value="id"
                  placeholder="Поиск по ФИО" filter size="small" class="w100" append-to="body"
                  :filter-fields="['name']" />
        <Button label="Добавить в список" size="small" text :disabled="!addId"
                style="margin-top:8px" @click="addLocal" />

        <div class="hint-box muted small">
          Отправка заданий: новые пиры получают задания, по несданным оценкам приходит
          повторное уведомление; уже отправленные оценки не затрагиваются.
        </div>
      </div>
    </div>

    <div class="actions-row">
      <Button label="Сохранить" size="small" :disabled="!dirty" :loading="busy"
              v-tooltip.top="dirty ? 'Сохранить изменения списка' : 'Изменений нет'"
              @click="save" />
      <Button label="Отправить" size="small" severity="info" :disabled="!canSend || dirty"
              :loading="sendBusy" v-tooltip.top="sendTooltip" @click="send" />
      <span v-if="dirty" class="muted small">есть несохранённые изменения</span>
      <span v-if="lastResult" class="muted small">{{ lastResult }}</span>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import Tag from 'primevue/tag'
import { reviewsApi, staffApi } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAuth } from '../stores/auth'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{ employeeId: number; employeeName: string; team?: string | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const auth = useAuth()
const toast = useToast()
const cycle = ref<{ id: number; name: string; stage: string } | null>(null)
// baseline — сохранённый на сервере итоговый набор; current — редактируемый локально
const baseline = ref<number[]>([])
const current = ref<number[]>([])
const people = ref<Map<number, { id: number; name: string; team: string | null }>>(new Map())
const addId = ref<number | null>(null)
const busy = ref(false)
const sendBusy = ref(false)
const lastResult = ref('')
const loaded = ref(false)

function diff(a: number[], b: number[]): number[] {
  const sb = new Set(b)
  return a.filter((x) => !sb.has(x))
}

const dirty = computed(() =>
  diff(baseline.value, current.value).length > 0
  || diff(current.value, baseline.value).length > 0)
const mandatoryPeers = computed(() =>
  current.value
    .filter((id) => people.value.get(id)?.team === props.team)
    .map((id) => people.value.get(id)!)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru')))
const extraPeers = computed(() =>
  current.value
    .filter((id) => people.value.get(id)?.team !== props.team)
    .map((id) => people.value.get(id)!)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru')))
const addable = computed(() =>
  [...people.value.values()]
    .filter((p) => p.id !== props.employeeId && !current.value.includes(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru')))

const stageNames: Record<string, string> = {
  'self-review': 'сбор ачивок', 'peer-review': 'оценки пиров',
  'leader-assessment': 'предоценки', calibration: 'калибровки', decision: 'решения',
  closed: 'закрыт', preparation: 'подготовка', cancelled: 'отменён',
}
const stageLabel = computed(() => stageNames[cycle.value?.stage || ''] || cycle.value?.stage)
// отправлять можно только в окне стадий оценок; позже — «кто не успел, тот опоздал»
const sendStages = ['self-review', 'peer-review', 'leader-assessment']
const canSend = computed(() =>
  auth.can('ROLE_C_PEER_ASSIGNMENT') && sendStages.includes(cycle.value?.stage || ''))
const sendTooltip = computed(() => {
  if (dirty.value) return 'Сначала сохраните список'
  if (!auth.can('ROLE_C_PEER_ASSIGNMENT')) return 'Доступно руклям'
  return canSend.value
    ? 'Разослать задания по итоговому набору пиров'
    : `Недоступно на стадии «${stageLabel.value}»`
})

function addLocal() {
  if (!addId.value || current.value.includes(addId.value)) return
  current.value = [...current.value, addId.value]
  addId.value = null
}

function removeLocal(id: number) {
  current.value = current.value.filter((x) => x !== id)
}

onMounted(async () => {
  const cycles = await reviewsApi.cycles()
  cycle.value = cycles.find((c) => !['closed', 'imported', 'cancelled'].includes(c.stage))
    || cycles[0] || null
  const all = await staffApi.listEmployees({ scope: 'all' })
  people.value = new Map(all.map((e: any) =>
    [e.id, { id: e.id, name: e.full_name, team: e.org_unit }]))
  await reloadBaseline()
  loaded.value = true
})

async function reloadBaseline() {
  if (!cycle.value) return
  try {
    const r = await reviewsApi.managerEditPeers(props.employeeId, {
      cycle_id: cycle.value.id, add_ids: [], remove_ids: [],
    })
    baseline.value = [...r.merged.final]
    current.value = [...r.merged.final]
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка загрузки пиров', detail: errMsg(e), life: 8000 })
  }
}

async function save() {
  if (!cycle.value) return
  busy.value = true
  try {
    await reviewsApi.managerEditPeers(props.employeeId, {
      cycle_id: cycle.value.id,
      add_ids: diff(current.value, baseline.value),
      remove_ids: diff(baseline.value, current.value),
    })
    baseline.value = [...current.value]
    lastResult.value = 'список сохранён'
    toast.add({ severity: 'success', summary: 'Список пиров сохранён', life: 4000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не сохранено', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}

async function send() {
  if (!cycle.value || !canSend.value || dirty.value) return
  sendBusy.value = true
  try {
    const r = await reviewsApi.sendAssignments({
      cycle_id: cycle.value.id, employee_ids: [props.employeeId],
    })
    lastResult.value = `заданий создано: ${r.created}, уведомлено: ${r.notified}`
    toast.add({ severity: 'success', summary: 'Задания отправлены', life: 4000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка отправки', detail: errMsg(e), life: 8000 })
  } finally { sendBusy.value = false }
}
</script>

<style scoped>
.cycle-line { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 0.88rem; }
.peer-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 18px; }
.section-title { display: block; font-size: 0.82rem; margin-bottom: 6px; color: #475569; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border-radius: 12px; }
.chip-x { margin-left: 6px; cursor: pointer; }
.hint-box { margin-top: 14px; border: 1px dashed #e2e8f0; border-radius: 8px; padding: 8px 10px; }
.actions-row { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
.w100 { width: 100%; }
@media (max-width: 760px) { .peer-grid { grid-template-columns: 1fr; } }
</style>
