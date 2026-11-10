<template>
  <h2 style="margin: 12px 0 8px">Запуск переоценки компетенций</h2>
  <div class="filters">
    <Select v-model="functionalGroup" :options="functionalGroups" option-label="label"
            option-value="value" placeholder="Функциональная группа" show-clear
            data-testid="filter-group" />
    <Select v-model="orgUnitId" :options="orgOptions" option-label="label"
            option-value="value" placeholder="Подразделение" show-clear
            data-testid="filter-unit" />
    <MultiSelect v-model="employeeIds" :options="employeeOptions" option-label="label"
                 option-value="value" filter placeholder="Сотрудники (пересечение фильтров)"
                 :max-selected-labels="3" class="grow" data-testid="filter-employees" />
    <DatePicker v-model="dueDate" date-format="yy-mm-dd" placeholder="Дедлайн"
                data-testid="filter-due" />
    <Button label="Предпросмотр" :loading="busy" data-testid="btn-preview" @click="doPreview" />
  </div>

  <!-- предпросмотр: получат / отсеиваются / незавершённые прежние -->
  <div v-if="preview" class="preview card" data-testid="preview-block">
    <h3 style="margin: 0 0 8px">Предпросмотр: {{ preview.selected }} в выборке</h3>
    <p v-if="totalCreated" style="margin: 4px 0">
      <b>Получат задания: {{ totalCreated }}</b>
      <span class="muted small">
        (селф: {{ preview.created['competency-self'] }};
        рук-ли soft: {{ preview.created['competency-manager-soft'] }};
        рук-ли hard: {{ preview.created['competency-manager-hard'] }})
      </span>
    </p>
    <p v-else class="muted">Новых заданий не будет — у всех свежая оценка, дубли или пропуски.</p>
    <div v-for="(names, reason) in preview.skipped" :key="reason" class="skip-row">
      <Tag :value="SKIP_LABELS[reason] || reason" severity="secondary" />
      <span class="small">{{ names.slice(0, 8).join(', ') }}{{ names.length > 8 ? ` и ещё ${names.length - 8}` : '' }}</span>
    </div>
    <Message v-if="preview.previous_unfinished?.length" severity="warn" data-testid="previous-unfinished" style="margin-top: 8px">
      Незавершённые прежние запуски по этому скоупу (не блокируют):
      <span v-for="p in preview.previous_unfinished" :key="p.launch_id" class="pill">
        запуск #{{ p.launch_id }} — открытых: {{ p.open_count }} ({{ sourceLabel(p.source) }})
      </span>
    </Message>
    <div class="actions">
      <Button label="Запустить переоценку" :disabled="!totalCreated" data-testid="btn-launch"
              @click="doLaunch" />
    </div>
  </div>

  <!-- сводка после запуска -->
  <Message v-if="summary" severity="success" data-testid="launch-summary" style="margin-top: 10px">
    Запуск #{{ summary.launch_id }}: создано заданий — {{ summaryTotal(summary) }};
    уже открыто ранее — {{ summary.preexisting_open ?? 0 }}; отсеяно — {{ skippedTotal(summary) }}.
    Незавершённые прежние: {{ summary.previous_unfinished?.length || 0 }}.
  </Message>

  <h2 style="margin: 18px 0 8px">Запуски</h2>
  <p v-if="!launches.length" class="muted" data-testid="empty-launches">Переоценка ещё не запускалась</p>
  <div v-for="l in launches" :key="l.launch_id" class="card launch">
    <div class="launch-head" @click="openIds.has(l.launch_id)
      ? openIds.delete(l.launch_id) : openIds.add(l.launch_id)">
      <i class="pi pi-play-circle" />
      <div class="launch-title">
        <b>Запуск #{{ l.launch_id }}</b>
        <Tag :value="sourceLabel(l.source)" severity="info" />
        <Tag v-if="l.cycle_id" :value="`цикл #${l.cycle_id}`" severity="secondary" />
        <Tag v-if="l.cancelled_at" value="отменён" severity="warning" />
      </div>
      <div class="muted small">
        выполнено {{ l.counts.done }} из {{ l.counts.done + l.counts.open + l.counts.cancelled }}
        <template v-if="l.counts.open">· открытых: {{ l.counts.open }}</template>
      </div>
      <i :class="openIds.has(l.launch_id) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
         class="chev" />
    </div>
    <div v-if="openIds.has(l.launch_id)" class="launch-body">
      <div v-for="u in l.unfinished" :key="u.assignment_id" class="group-row">
        <span class="row-name">{{ u.subject?.name || u.assignee?.name }}</span>
        <span class="muted small">{{ u.kind === 'competency-self' ? 'самооценка' : `руководителю (${u.matrix_kind})` }}</span>
        <span class="muted small">исполнитель: {{ u.assignee?.name }}</span>
        <Tag v-if="u.overdue" value="просрочено" severity="danger" />
        <template v-if="u.progress?.matrices?.length">
          <span v-for="m in u.progress.matrices" :key="m.matrix_id" class="pill small">
            {{ m.kind }} {{ m.specialty }}: {{ m.complete ? '✓' : `${m.covered}/${m.total}` }}
          </span>
          <Button v-for="m in u.progress.matrices.filter((x) => !x.complete)"
                  :key="`fc-${m.matrix_id}`" label="Закрыть принудительно" size="small"
                  severity="warn" text data-testid="btn-force-close"
                  @click.stop="forceClose(u, m)" />
        </template>
      </div>
      <p v-if="!l.unfinished.length" class="muted small">Незаполненных нет</p>
      <div class="actions" v-if="l.counts.open">
        <Button label="Отменить незаполненные" size="small" severity="danger" text
                :loading="busy" data-testid="btn-cancel-launch"
                @click.stop="cancelLaunch(l)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { staffApi, reassessmentApi, type ReassessmentSummary, type LaunchProgress,
  type AssignmentProgressMatrix } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAppConfirm } from '../composables/useAppConfirm'

const toast = useToast()
const confirmDialog = useAppConfirm()

const functionalGroup = ref<string | null>(null)
const orgUnitId = ref<number | null>(null)
const employeeIds = ref<number[]>([])
const dueDate = ref<Date | null>(null)
const busy = ref(false)
const preview = ref<ReassessmentSummary | null>(null)
const summary = ref<ReassessmentSummary | null>(null)
const launches = ref<LaunchProgress[]>([])
const openIds = reactive(new Set<number>())

const functionalGroups = ref<{ label: string; value: string }[]>([])
const orgOptions = ref<{ label: string; value: number }[]>([])
const employeeOptions = ref<{ label: string; value: number }[]>([])

const SKIP_LABELS: Record<string, string> = {
  'свежая оценка': 'свежая оценка',
  'уже открытое задание': 'уже открытое задание',
  'нет активной схемы': 'нет активной схемы скоупа',
  'нет руководителя': 'нет руководителя вида',
  'нет права у руководителя': 'у руководителя нет права разметки',
}

const totalCreated = computed(() => preview.value
  ? Object.values(preview.value.created).reduce((s, n) => s + n, 0) : 0)

function sourceLabel(source: string): string {
  return ({ manual: 'вручную', schema_activation: 'активация схемы',
            cycle_start: 'цикл' } as Record<string, string>)[source] || source
}

function summaryTotal(s: ReassessmentSummary): number {
  return Object.values(s.created).reduce((acc, n) => acc + n, 0)
}

function skippedTotal(s: ReassessmentSummary): number {
  return Object.values(s.skipped).reduce((acc, names) => acc + names.length, 0)
}

function filtersText(): string {
  const parts: string[] = []
  if (functionalGroup.value) parts.push(`группа: ${functionalGroup.value}`)
  if (orgUnitId.value) {
    parts.push(`подразделение: ${orgOptions.value.find((o) => o.value === orgUnitId.value)?.label || orgUnitId.value}`)
  }
  if (employeeIds.value.length) parts.push(`сотрудников: ${employeeIds.value.length}`)
  return parts.join('; ') || 'без фильтров (все активные)'
}

async function doPreview() {
  busy.value = true
  try {
    preview.value = await reassessmentApi.preview({
      functional_group: functionalGroup.value,
      org_unit_id: orgUnitId.value,
      employee_ids: employeeIds.value,
      due_date: dueDate.value ? dueDate.value.toISOString().slice(0, 10) : null,
    })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка предпросмотра', detail: errMsg(e), life: 8000 })
  } finally {
    busy.value = false
  }
}

async function doLaunch() {
  if (!preview.value) return
  const ok = await confirmDialog.ask({
    header: 'Запустить переоценку?',
    message: `Кого: ${preview.value.selected} в выборке (${totalCreated.value} получат задания)`
      + `\nФильтры: ${filtersText()}`
      + `\nДедлайн: ${dueDate.value ? dueDate.value.toISOString().slice(0, 10) : 'без срока'}`
      + `\nОкно свежести: ${preview.value.freshness_days ?? '—'} дн.`,
    okLabel: 'Запустить',
  })
  if (ok === null) return
  busy.value = true
  try {
    summary.value = await reassessmentApi.launch({
      functional_group: functionalGroup.value,
      org_unit_id: orgUnitId.value,
      employee_ids: employeeIds.value,
      due_date: dueDate.value ? dueDate.value.toISOString().slice(0, 10) : null,
    })
    preview.value = null
    toast.add({ severity: 'success', summary: 'Переоценка запущена', life: 4000 })
    await loadLaunches()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка запуска', detail: errMsg(e), life: 8000 })
  } finally {
    busy.value = false
  }
}

async function cancelLaunch(l: LaunchProgress) {
  const names = l.unfinished.map((u) => u.subject?.name || u.assignee?.name || '—')
  const ok = await confirmDialog.ask({
    header: 'Отменить незаполненные задания?',
    message: `Что: отмена ${l.counts.open} открытых заданий запуска #${l.launch_id} (${sourceLabel(l.source)})`
      + `\nКого: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` и ещё ${names.length - 5}` : ''}`
      + '\nВыполненные не затрагиваются.',
    okLabel: 'Отменить', danger: true,
  })
  if (ok === null) return
  try {
    await reassessmentApi.cancelLaunch(l.launch_id)
    toast.add({ severity: 'success', summary: 'Задания отменены', life: 4000 })
    await loadLaunches()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  }
}

async function forceClose(
  u: LaunchProgress['unfinished'][number], m: AssignmentProgressMatrix,
) {
  const kind = u.kind === 'competency-self' ? 'self' : 'manager'
  const kindLabel = kind === 'self' ? 'самооценка' : `руководительская (${u.matrix_kind})`
  const ok = await confirmDialog.ask({
    header: 'Закрыть разметку принудительно?',
    message: `Кого: ${u.subject?.name}\nСхема: ${m.kind} ${m.specialty} (v${m.version})`
      + `\nВид: ${kindLabel}`
      + `\nНепокрыто: ${m.total - m.covered} из ${m.total}`
      + `\nБудет проставлен грейд: ${u.grade || '—'} (отметки «по умолчанию»)`,
    okLabel: 'Закрыть принудительно', danger: true,
  })
  if (ok === null) return
  try {
    const res = await reassessmentApi.forceClose({
      employee_id: u.subject?.id as number, matrix_id: m.matrix_id, assessor_kind: kind,
    })
    toast.add({ severity: 'success', summary: `Проставлено системных отметок: ${res.system_marks}`,
                life: 5000 })
    await loadLaunches()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  }
}

async function loadLaunches() {
  launches.value = await reassessmentApi.launches()
}

onMounted(async () => {
  loadLaunches().catch(() => undefined)
  try {
    const [employees, units] = await Promise.all([
      staffApi.listEmployees({ active: true }),
      staffApi.orgUnits(),
    ])
    employeeOptions.value = employees.map((e) => ({ label: e.full_name, value: e.id }))
    functionalGroups.value = [...new Set(employees.map((e) => e.functional_group).filter(Boolean))]
      .map((g) => ({ label: g as string, value: g as string }))
    orgOptions.value = units.map((u) => ({ label: u.name, value: u.id }))
  } catch {
    toast.add({ severity: 'warn', summary: 'Не загрузились списки фильтров', life: 6000 })
  }
})
</script>

<style scoped>
.filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
.filters .grow { min-width: 260px; flex: 1; }
.card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 10px; background: #fff; }
.preview { background: #f8fafc; }
.skip-row { display: flex; gap: 8px; align-items: baseline; margin: 2px 0; }
.launch-head { display: flex; gap: 10px; align-items: center; cursor: pointer; }
.launch-title { flex: 1; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.launch-body { margin-top: 10px; border-top: 1px solid #f1f5f9; padding-top: 8px; }
.group-row { display: flex; gap: 10px; align-items: center; padding: 4px 0; flex-wrap: wrap; }
.row-name { min-width: 180px; }
.pill { display: inline-block; background: #eef2ff; border-radius: 999px; padding: 2px 8px; margin-right: 4px; }
.actions { display: flex; gap: 10px; margin-top: 8px; }
.chev { color: #94a3b8; }
</style>
