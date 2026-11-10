<template>
  <AssignmentGuide />
  <div class="head-row">
    <h2 style="margin:0">Реестр заданий</h2>
    <Button label="Обновить" size="small" text @click="load" />
  </div>

  <div class="filter-bar">
    <Select v-model="kind" :options="KIND_OPTIONS" option-label="label" option-value="value"
            placeholder="Тип" size="small" show-clear class="filter-field" data-testid="filter-kind"
            @change="reload" />
    <Select v-model="status" :options="STATUS_OPTIONS" option-label="label" option-value="value"
            placeholder="Статус" size="small" show-clear class="filter-field" data-testid="filter-status"
            @change="reload" />
    <span class="filter-field grow">
      <i class="pi pi-search" />
      <InputText v-model="q" placeholder="Исполнитель (ФИО)" size="small" class="w100"
                 data-testid="filter-q" @input="debounced" />
    </span>
    <InputNumber v-model="launchId" placeholder="Запуск #" size="small" class="filter-field"
                 data-testid="filter-launch" input-id="filter-launch" @update:model-value="reload" />
    <label class="mine-toggle">
      <Checkbox v-model="overdueOnly" :binary="true" data-testid="filter-overdue" @update:model-value="reload" />
      только просроченные
    </label>
  </div>

  <DataTable :value="items" size="small" stripedRows data-key="id" v-model:selection="selected"
             selection-mode="multiple" :loading="loading" lazy paginator :rows="pageSize"
             :total-records="total" :first="(page - 1) * pageSize"
             @page="onPage($event.page + 1)" data-testid="assignments-table">
    <Column selection-mode="multiple" style="width: 34px" />
    <Column header="Тип">
      <template #body="{ data: a }">{{ a.kind_title }}</template>
    </Column>
    <Column header="Исполнитель">
      <template #body="{ data: a }">{{ a.assignee?.name || `#${a.assignee?.id}` }}</template>
    </Column>
    <Column header="Объект">
      <template #body="{ data: a }">
        <span v-if="a.subject?.id" class="ulink" role="link" data-testid="subject-link"
              @click="$router.push(`/staff/${a.subject.id}`)">{{ a.subject.name }}</span>
        <span v-else class="muted">—</span>
      </template>
    </Column>
    <Column header="Статус">
      <template #body="{ data: a }">
        <Tag :value="STATUS_LABEL[a.status] || a.status"
             :severity="a.status === 'done' ? 'success' : a.status === 'cancelled' ? 'secondary' : 'info'" />
      </template>
    </Column>
    <Column header="Срок">
      <template #body="{ data: a }">
        <span>{{ a.due_date || '—' }}</span>
        <Tag v-if="a.overdue" value="просрочено" severity="danger" style="margin-left: 6px" />
      </template>
    </Column>
    <Column header="Запуск">
      <template #body="{ data: a }">
        <span v-if="a.launch_id" class="muted">#{{ a.launch_id }}</span>
        <span v-else class="muted">—</span>
      </template>
    </Column>
    <Column header="Обновлено">
      <template #body="{ data: a }">{{ a.done_at || a.created_at || '' }}</template>
    </Column>
    <Column header="Действия" style="width: 260px">
      <template #body="{ data: a }">
        <AssignmentRowActions :assignment="a" @cancel="cancelOne(a)" @remind="remindOne(a)"
                              @force-close="(m) => forceClose(a, m)" />
      </template>
    </Column>
  </DataTable>

  <!-- плавающая панель массовых действий: применимы только открытые из выбранных -->
  <Transition name="mass-bar">
    <div v-if="selected.length > 0" class="mass-bar" role="toolbar" aria-label="Действия с выбранными заданиями">
      <span class="mass-count">выбрано: <b>{{ selected.length }}</b>
        <span v-if="applicable.length !== selected.length" class="muted-small">
          (применимы: {{ applicable.length }})
        </span>
      </span>
      <Button label="Напомнить выбранным" size="small" severity="info" text :disabled="!applicable.length"
              :loading="busy" data-testid="bulk-remind" @click="bulk('remind')" />
      <Button label="Отменить выбранные" size="small" severity="danger" text :disabled="!applicable.length"
              :loading="busy" data-testid="bulk-cancel" @click="bulk('cancel')" />
      <Button label="Снять выбор" size="small" text @click="selected = []" />
    </div>
  </Transition>
</template>

<script setup lang="ts">
// shortcut: сортировка DataTable — в пределах загруженной страницы (сервер отдаёт по id desc)
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import AssignmentGuide from './AssignmentGuide.vue'
import AssignmentRowActions from './AssignmentRowActions.vue'
import { adminAssignmentsApi, reassessmentApi, type AssignmentDto,
  type AssignmentProgressMatrix } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAppConfirm } from '../composables/useAppConfirm'

const router = useRouter()
const toast = useToast()
const confirmDialog = useAppConfirm()

const KIND_OPTIONS = [
  { label: 'Самооценка компетенций', value: 'competency-self' },
  { label: 'Оценка подчинённых', value: 'competency-manager' },
  { label: 'Селф-ревью', value: 'self-review' },
  { label: 'Оценка коллеги', value: 'peer-review' },
]
const STATUS_OPTIONS = [
  { label: 'открыто (ждёт)', value: 'pending' },
  { label: 'открыто (уведомлено)', value: 'notified' },
  { label: 'выполнено', value: 'done' },
  { label: 'отменено', value: 'cancelled' },
]
const STATUS_LABEL: Record<string, string> = {
  pending: 'ждёт', notified: 'уведомлено', done: 'выполнено', cancelled: 'отменено',
}

const kind = ref<string | null>(null)
const status = ref<string | null>(null)
const q = ref('')
const launchId = ref<number | null>(null)
const overdueOnly = ref(false)
const items = ref<AssignmentDto[]>([])
const selected = ref<AssignmentDto[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 50
const loading = ref(false)
const busy = ref(false)

const isOpen = (a: AssignmentDto) => ['pending', 'notified'].includes(a.status)
const applicable = computed(() => selected.value.filter(isOpen))

let debounce: ReturnType<typeof setTimeout> | undefined
function debounced() {
  clearTimeout(debounce)
  debounce = setTimeout(reload, 300)
}

function reload() {
  page.value = 1
  load()
}

async function load() {
  loading.value = true
  try {
    const res = await adminAssignmentsApi.list({
      kind: kind.value || undefined, status: status.value || undefined,
      q: q.value.trim() || undefined, launch_id: launchId.value || undefined,
      overdue: overdueOnly.value || undefined, page: page.value, page_size: pageSize,
    })
    items.value = res.items
    total.value = res.total
    selected.value = selected.value.filter((s) => items.value.some((i) => i.id === s.id))
  } finally {
    loading.value = false
  }
}

function onPage(p: number) {
  page.value = p
  load()
}

async function cancelOne(a: AssignmentDto) {
  const ok = await confirmDialog.ask({
    header: 'Отменить задание?',
    message: `Что: отмена задания «${a.kind_title}»\nКого: исполнитель ${a.assignee?.name || '—'}`
      + `${a.subject?.name ? `, объект ${a.subject.name}` : ''}`,
    okLabel: 'Отменить задание', danger: true,
  })
  if (ok === null) return
  try {
    await adminAssignmentsApi.cancel(a.id)
    toast.add({ severity: 'success', summary: 'Задание отменено', life: 4000 })
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  }
}

async function remindOne(a: AssignmentDto) {
  const ok = await confirmDialog.ask({
    header: 'Напомнить вне графика?',
    message: `Что: напоминание по заданию «${a.kind_title}»\nКого: ${a.assignee?.name || '—'}`
      + '\nСчётчик напоминаний задания обновится.',
    okLabel: 'Напомнить',
  })
  if (ok === null) return
  try {
    await adminAssignmentsApi.remind(a.id)
    toast.add({ severity: 'success', summary: 'Напоминание отправлено', life: 4000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  }
}

async function forceClose(a: AssignmentDto, m: AssignmentProgressMatrix) {
  const kindOf = a.kind === 'competency-self' ? 'self' : 'manager'
  const ok = await confirmDialog.ask({
    header: 'Закрыть разметку принудительно?',
    message: `Кого: ${a.subject?.name}\nСхема: ${m.kind} ${m.specialty} (v${m.version})`
      + `\nВид: ${kindOf === 'self' ? 'самооценка' : 'руководительская'}`
      + `\nНепокрыто: ${m.total - m.covered} из ${m.total}`
      + '\nБудет проставлен уровень грейда оцениваемого (отметки «по умолчанию»)',
    okLabel: 'Закрыть принудительно', danger: true,
  })
  if (ok === null) return
  try {
    const res = await reassessmentApi.forceClose({
      employee_id: a.subject?.id as number, matrix_id: m.matrix_id, assessor_kind: kindOf,
    })
    toast.add({ severity: 'success', summary: `Проставлено системных отметок: ${res.system_marks}`,
                life: 5000 })
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  }
}

async function bulk(action: 'cancel' | 'remind') {
  const rows = applicable.value
  if (!rows.length) return
  const assignees = [...new Set(rows.map((r) => r.assignee?.name).filter(Boolean))] as string[]
  const ok = await confirmDialog.ask({
    header: action === 'cancel' ? 'Отменить выбранные задания?' : 'Напомнить выбранным?',
    message: `Что: ${action === 'cancel' ? 'отмена' : 'напоминание'} ${rows.length} заданий`
      + `\nКому: ${assignees.slice(0, 5).join(', ')}${assignees.length > 5 ? ` и ещё ${assignees.length - 5}` : ''}`
      + (action === 'cancel' ? '\nВыполненные задания не затрагиваются.' : ''),
    okLabel: action === 'cancel' ? 'Отменить' : 'Напомнить', danger: action === 'cancel',
  })
  if (ok === null) return
  busy.value = true
  try {
    const res = await adminAssignmentsApi.bulk(action, rows.map((r) => r.id))
    toast.add({ severity: 'success',
                summary: `Применено: ${res.applied} из ${res.requested}`, life: 4000 })
    selected.value = []
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  } finally {
    busy.value = false
  }
}

onMounted(() => { load().catch(() => undefined) })
</script>

<style scoped>
.head-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.filter-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
.filter-field { min-width: 150px; }
.filter-field.grow { flex: 1; display: flex; align-items: center; gap: 6px;
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 8px; background: #fff; }
.mine-toggle { display: flex; gap: 6px; align-items: center; font-size: .85rem; white-space: nowrap; }
.w100 { width: 100%; }
.ulink { color: #2563eb; cursor: pointer; }
.ulink:hover { text-decoration: underline; }
/* плавающая панель над таблицей — паттерн MassActionBar (StaffListView) */
.mass-bar { position: fixed; left: 50%; transform: translateX(-50%); bottom: 22px; z-index: 30;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  background: #0f172a; color: #e2e8f0; border-radius: 14px;
  padding: 10px 16px; box-shadow: 0 12px 32px rgba(15, 23, 42, .35); }
.mass-count { font-size: .85rem; }
.muted-small { font-size: .75rem; opacity: .8; }
.mass-bar :deep(.p-button) { color: #e2e8f0; }
.mass-bar-enter-active, .mass-bar-leave-active { transition: all .18s ease; }
.mass-bar-enter-from, .mass-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(12px); }
</style>
