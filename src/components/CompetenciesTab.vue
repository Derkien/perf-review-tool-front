<template>
  <div>
    <div class="comp-head">
      <div class="kind-row">
        <SelectButton v-model="kind" :options="kinds" option-label="label" option-value="value" />
        <Tag v-if="radarVersions" :value="`схема v${radarVersions}`" severity="secondary"
             data-testid="schema-version-badge" />
      </div>
      <div class="comp-actions">
        <Button v-if="perms.edit_marks || perms.is_self"
                :label="markMode ? 'Закрыть разметку' : 'Внести разметку'"
                :severity="markMode ? 'secondary' : 'primary'" size="small" @click="markMode = !markMode" />
      </div>
    </div>
    <div class="comp-grid">
      <div class="comp-radar">
        <div class="radar-toolbar">
          <span class="muted small">веса 1–10 · норма грейда — серая{{ radarVersions ? ` · схема v${radarVersions}` : '' }}</span>
          <Button icon="pi pi-search-plus" severity="secondary" size="small" outlined
                  v-tooltip.bottom="'Увеличить'" @click="radarBig = true" />
        </div>
        <RadarChart v-if="radar && radar.axis?.length" :axis="radar.axis" :self="radar.self"
                    :manager="radar.manager" :norm="radar.norm"
                    :session1="sessionSeries[0]" :session2="sessionSeries[1]"
                    :session1-default="sessionDefaults[0]" :session2-default="sessionDefaults[1]"
                    height="620px" />
        <p v-else class="muted">Разметок по этому типу пока нет{{
          markMode ? '' : ' — нажмите «Внести разметку»' }}.</p>
      </div>
      <div class="comp-insights">
        <h2 style="margin-top:0">Комментарии и инсайты</h2>
        <Message v-if="radar?.summary" severity="info" :sticky="true">
          Средние веса (1–10): самооценка <b>{{ radar.summary.avg_self }}</b>,
          руководитель <b>{{ radar.summary.avg_manager }}</b>, норма грейда <b>{{ radar.norm }}</b>
        </Message>
        <Message v-if="radar?.summary?.overestimated?.length" severity="warn" :sticky="true">
          Переоценка (себе выше, чем рукль): {{ radar.summary.overestimated.join(', ') }}
        </Message>
        <Message v-if="radar?.summary?.growth_zones?.length" severity="success" :sticky="true">
          Зоны роста (рукль выше самооценки): {{ radar.summary.growth_zones.join(', ') }}
        </Message>
      </div>
    </div>

    <!-- форма разметки -->
    <Card v-if="markMode" style="margin-top: 12px">
      <template #title>Разметка ({{ perms.is_self && !perms.edit_marks ? 'самооценка' : 'руководитель' }})</template>
      <template #content>
        <div class="mark-form-head">
          <label>Дата <InputText v-model="markDate" type="date" size="small" /></label>
          <span class="muted small" data-testid="date-freshness-hint">
            дата влияет на свежесть оценки — оставьте сегодняшнюю
          </span>
        </div>
        <Message v-if="staleDateWarning" severity="warn" data-testid="stale-date-warning"
                 style="margin-bottom: 8px">
          {{ staleDateWarning }}
        </Message>
        <div class="mark-table">
          <div v-for="row in matrixRows" :key="row.item_id" class="mark-row">
            <span class="mark-name" v-tooltip.top="rowLevel(row)">{{ row.item }}</span>
            <Select v-model="markDraft[row.item_id]" :options="gradeOptions"
                    option-label="label" option-value="value" filter placeholder="—"
                    size="small" class="mark-select" />
          </div>
        </div>
        <Button label="Сохранить разметку" size="small" :loading="busy" @click="saveMarks" />
      </template>
    </Card>

    <!-- история разметок -->
    <h2 style="display:inline-block">История разметок</h2>
    <i class="pi pi-info-circle muted info-ico" data-testid="compare-info"
       v-tooltip.top="'Почему сравниваются не все сессии'"
       @click="compareInfoVisible = !compareInfoVisible" />
    <Message v-if="compareInfoVisible" severity="info" :sticky="true" style="margin-top:8px"
             data-testid="compare-info-text">
      Сравнение возможно только в рамках одной версии схемы: на паутинку добавляются сессии
      текущей активной версии. Сессии архивных версий смотрите по их собственным пунктам.
    </Message>
    <p class="muted" style="margin-top:0">
      Клик по строке — добавить/убрать сессию на паутинку (до двух сравнений).
    </p>
    <DataTable :value="sessions" size="small" style="max-width: 860px"
               :row-class="sessionRowClass" @row-click="toggleCompare($event.data)">
      <Column header="">
        <template #body="{ data: s }">
          <i v-if="s.assessor_kind === 'manager'" class="pi"
             :style="{ color: seriesColor(s), cursor: 'pointer' }"
             :class="compareKeys.includes(sessionKey(s)) ? 'pi-check-circle' : 'pi-circle'" />
          <span v-else class="muted small">self</span>
        </template>
      </Column>
      <Column field="date" header="Дата" />
      <Column field="kind" header="Тип">
        <template #body="{ data: s }">
          <Tag :value="s.kind" :severity="s.kind === 'hard' ? 'warn' : 'info'" />
        </template>
      </Column>
      <Column header="Версия">
        <template #body="{ data: s }">
          <template v-if="s.version">
            <Tag :value="`v${s.version}`" severity="secondary" />
            <span v-if="s.is_current === false" class="muted small"> архив</span>
          </template>
        </template>
      </Column>
      <Column field="assessor_kind" header="Чья">
        <template #body="{ data: s }">{{ s.assessor_kind === 'self' ? 'самооценка' : 'руководитель' }}</template>
      </Column>
      <Column field="assessor" header="Кто заполнял" />
      <Column header="Пунктов">
        <template #body="{ data: s }">
          <span data-testid="session-completeness">{{ completenessText(s) }}</span>
          <Tag v-if="s.system_marks" :value="`${s.system_marks} системой`" severity="warn"
               style="margin-left: 6px" v-tooltip.top="'значения «по умолчанию» — принудительное закрытие'" />
        </template>
      </Column>
      <Column header="Действия">
        <template #body="{ data: s }">
          <span class="acts">
            <i class="pi pi-download act" v-tooltip.top="'Скачать XLSX'"
               @click.stop="downloadSession(s)" />
            <!-- закрытая сессия архивной версии — только просмотр по своим пунктам -->
            <i v-if="isClosedSession(s)" class="pi pi-eye act" data-testid="session-view"
               v-tooltip.top="'Просмотр (закрытая сессия архивной версии)'"
               @click.stop="openSessionEdit(s)" />
            <i v-else-if="perms.edit_marks" class="pi pi-pencil act" v-tooltip.top="'Редактировать'"
               @click.stop="openSessionEdit(s)" />
            <!-- принудительное закрытие — только у незакрытой сессии, по праву оператора -->
            <i v-if="canForceCloseSession(s)" class="pi pi-lock act danger"
               data-testid="session-force-close"
               v-tooltip.top="'Закрыть принудительно (пробелы — уровнем грейда)'"
               @click.stop="forceCloseSession(s)" />
            <i v-if="!isClosedSession(s) && (perms.edit_marks || canHardDelete)"
               class="pi pi-trash act danger"
               v-tooltip.top="canHardDelete ? 'Удалить (soft/hard)' : 'Удалить (soft)'"
               @click.stop="deleteSession(s)" />
          </span>
        </template>
      </Column>
    </DataTable>

    <!-- большая паутинка -->
    <Dialog v-model:visible="radarBig" modal :header="`Паутинка: ${kind === 'hard' ? 'харды' : 'софты'}`"
            :style="{ width: '96vw' }" :content-style="{ height: '88vh' }" :maximizable="true">
      <RadarChart v-if="radar && radar.axis?.length" :axis="radar.axis" :self="radar.self"
                  :manager="radar.manager" :norm="radar.norm"
                  :session1="sessionSeries[0]" :session2="sessionSeries[1]"
                  :session1-default="sessionDefaults[0]" :session2-default="sessionDefaults[1]"
                  height="84vh" />
    </Dialog>

    <!-- редактирование/просмотр сессии (по пунктам её версии схемы) -->
    <Dialog v-model:visible="sessionEditVisible" modal :header="sessionEditReadonly
      ? `Просмотр разметки (${sessionEditSession?.version ? `v${sessionEditSession.version}, архив` : 'историческая'})`
      : 'Редактирование разметки'" style="width: 640px">
      <div class="mark-table" style="max-height: 420px">
        <div v-for="row in sessionEditRows" :key="row.item_id" class="mark-row">
          <span class="mark-name" v-tooltip.top="sessionRowTip(row)">{{ row.item }}</span>
          <Select v-if="!sessionEditReadonly" v-model="sessionEditDraft[row.item_id]"
                  :options="gradeOptions" option-label="label" option-value="value" filter size="small" />
          <span v-else class="muted small">{{ row.level }} (вес {{ row.weight }})</span>
          <!-- системные значения видны и в редактировании — иначе их можно молча перезаписать -->
          <Tag v-if="row.is_default" value="по умолчанию" severity="warn"
               data-testid="default-mark-badge" />
        </div>
      </div>
      <Message v-if="sessionEditReadonly" severity="info" :sticky="true" style="margin-top:8px">
        Закрытая сессия архивной версии схемы — только просмотр по пунктам своей версии.
      </Message>
      <Button v-if="!sessionEditReadonly" label="Сохранить изменения" size="small"
              :loading="busy" @click="saveSessionEdit" />
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
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import RadarChart from './RadarChart.vue'
import { competenciesApi, assignmentsApi, reassessmentApi, staffApi } from '../api/endpoints'
import type { MatrixRow, RadarData } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAuth } from '../stores/auth'
import { useAppConfirm } from '../composables/useAppConfirm'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{ employeeId: string | number
  perms: Record<string, boolean>
  gradeOptions: { label: string; value: string }[] }>()

const toast = useToast()
const confirmDialog = useAppConfirm()
const auth = useAuth()

const kind = ref<'hard' | 'soft'>('hard')
const kinds = [{ label: 'Харды', value: 'hard' }, { label: 'Софты', value: 'soft' }]
const radar = ref<RadarData | null>(null)
const matrixRows = ref<MatrixRow[]>([])
const sessions = ref<any[]>([])
const compareInfoVisible = ref(false)
const markMode = ref(false)
const markDate = ref(new Date().toISOString().slice(0, 10))
const markDraft = ref<Record<number, string>>({})
const radarBig = ref(false)
const compareKeys = ref<string[]>([])
const sessionSeries = ref<any[]>([null, null])
/** системные значения сравниваемых сессий — полые точки на паутинке */
const sessionDefaults = ref<(boolean[] | null)[]>([null, null])
/** моё открытое задание переоценки по этому сотруднику (предупреждение о дате, 9.8) */
const openAssignmentHere = ref<boolean>(false)
const sessionEditVisible = ref(false)
const sessionEditRows = ref<SessionDetailRow[]>([])
const sessionEditDraft = ref<Record<number, string>>({})
const sessionEditReadonly = ref(false)
const sessionEditSession = ref<any>(null)
/** число пунктов версий схем — для признака «закрыта» у сессий архивных версий */
const versionItemsCount = ref<Record<number, number>>({})
const busy = ref(false)

const canHardDelete = computed(() => auth.can('ROLE_D_COMPETENCY_SESSION'))
const canReassess = computed(() => auth.can('ROLE_U_COMPETENCY_REASSESSMENT'))
/** вид разметки, которым сохраняет этот пользователь (для предупреждения о дате) */
const myAssessorKind = computed(() =>
  props.perms.is_self && !props.perms.edit_marks ? 'self' : 'manager')

/** предупреждение 9.8: открыто задание переоценки, а дата — уже существующей сессии */
const staleDateWarning = computed(() => {
  if (!openAssignmentHere.value) return ''
  if (markDate.value === new Date().toISOString().slice(0, 10)) return ''
  const clash = sessions.value.some((s: any) => s.date === markDate.value
    && s.assessor_kind === myAssessorKind.value)
  if (!clash) return ''
  return 'Разметка этой датой не закроет задание: отметки на уже созданную дату обновляются, а не создаются'
})

/** счётчик полноты сессии: «15/20 пользователем» — если есть пробелы или системные отметки */
function completenessText(s: any): string {
  const total = versionItemsCount.value[s.matrix_id]
  if (total === undefined || (total === s.marks && !s.system_marks)) return String(s.marks)
  return `${s.user_marks}/${total} пользователем`
}

/** версии активных схем текущего типа — бейдж у переключателя и в подписи радара */
const radarVersions = computed(() => {
  const vs = (radar.value?.matrices || []).filter((m) => m.kind === kind.value).map((m) => m.version)
  return vs.length ? [...new Set(vs)].join(', ') : ''
})

/** закрытая сессия архивной версии: все пункты версии покрыты — read-only (реш. 6) */
function isClosedSession(s: any): boolean {
  if (s.is_current !== false || !s.matrix_id) return false
  const total = versionItemsCount.value[s.matrix_id]
  return total !== undefined && s.marks >= total
}

onMounted(load)
watch(kind, load)

async function load() {
  try {
    radar.value = await competenciesApi.radar(props.employeeId, kind.value)
  } catch { radar.value = null }
  try {
    matrixRows.value = await competenciesApi.matrix(props.employeeId, kind.value)
    matrixRows.value.forEach((r) => {
      markDraft.value[r.item_id] = (props.perms.edit_marks ? r.manager?.level : r.self?.level) || ''
    })
  } catch { matrixRows.value = [] }
  try {
    sessions.value = await competenciesApi.sessions(props.employeeId, kind.value)
  } catch { sessions.value = [] }
  // пункты версий сессий — признак «закрыта» (read-only) и счётчик полноты «X/Y»
  const counts: Record<number, number> = {}
  for (const mid of [...new Set(sessions.value
    .filter((s: any) => s.matrix_id)
    .map((s: any) => s.matrix_id as number))]) {
    try { counts[mid] = (await competenciesApi.matrixItems(mid)).length
    } catch { /* нет доступа — считаем сессию незакрытой */ }
  }
  versionItemsCount.value = counts
  compareKeys.value = []
  sessionSeries.value = [null, null]
  sessionDefaults.value = [null, null]
  // есть ли открытое задание переоценки по этому сотруднику у меня (9.8)
  try {
    const mine = await assignmentsApi.mine()
    openAssignmentHere.value = mine.some((a) =>
      ['pending', 'notified'].includes(a.status)
      && a.kind.startsWith('competency-')
      && a.subject?.id === Number(props.employeeId))
  } catch { openAssignmentHere.value = false }
}

function sessionKey(s: any): string { return `${s.kind}|${s.date}` }
function seriesColor(s: any): string {
  const idx = compareKeys.value.indexOf(sessionKey(s))
  return idx === 0 ? '#9333ea' : idx === 1 ? '#0d9488' : '#94a3b8'
}
function sessionRowClass(data: any) {
  // сравнение — только manager-сессии активной версии схемы (реш. 6)
  if (data.assessor_kind !== 'manager' || data.is_current === false) return 'row-disabled'
  return compareKeys.value.includes(sessionKey(data)) ? 'row-selected' : ''
}
function rowLevel(row: any): string {
  const lvl = row.manager?.level || row.self?.level
  return (lvl && row.descriptions?.[lvl]) || 'описания нет'
}

async function toggleCompare(s: any) {
  // сессии других версий схемы на паутинку не добавляются (одна версия — одно сравнение)
  if (s.assessor_kind !== 'manager' || s.is_current === false) return
  const key = sessionKey(s)
  if (compareKeys.value.includes(key)) {
    compareKeys.value = compareKeys.value.filter((k) => k !== key)
  } else {
    compareKeys.value = [...compareKeys.value, key].slice(-2)
  }
  await refreshCompareSeries()
}

async function refreshCompareSeries() {
  if (!compareKeys.value.length) {
    sessionSeries.value = [null, null]
    sessionDefaults.value = [null, null]
    return
  }
  const dates = compareKeys.value.map((k) => k.split('|')[1])
  const r = await competenciesApi.radar(props.employeeId, kind.value, dates)
  sessionSeries.value = [r.session_1 || null, r.session_2 || null]
  sessionDefaults.value = [r.session_1_default || null, r.session_2_default || null]
}

async function saveMarks() {
  busy.value = true
  const assessorKind = props.perms.is_self && !props.perms.edit_marks ? 'self' : 'manager'
  try {
    let saved = 0
    for (const row of matrixRows.value) {
      const level = markDraft.value[row.item_id]
      if (!level) continue
      await competenciesApi.createMark({
        employee_id: Number(props.employeeId), item_id: row.item_id, level,
        assessed_on: markDate.value, assessor_kind: assessorKind,
      })
      saved++
    }
    toast.add({ severity: 'success', summary: `Разметка сохранена (${saved} пунктов)`, life: 4000 })
    markMode.value = false
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}

async function downloadSession(s: any) {
  try {
    const blob = await competenciesApi.sessionXlsx(props.employeeId, s.kind, s.date)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `marking-${props.employeeId}-${s.kind}-${s.date}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось выгрузить', detail: errMsg(e), life: 8000 })
  }
}

/** строка просмотра сессии: пункты версии сессии + выставленные уровни */
type SessionDetailRow = {
  item_id: number; item: string; category: string
  descriptions: Record<string, string>
  assessor_kind: 'self' | 'manager'; level: string; weight: number
  is_default?: boolean
}

function sessionRowTip(row: SessionDetailRow): string {
  return row.descriptions?.[row.level] || 'описания нет'
}

async function openSessionEdit(s: any) {
  sessionEditSession.value = s
  sessionEditReadonly.value = isClosedSession(s)
  sessionEditDraft.value = {}
  // сессия показывается по пунктам своей версии схемы (у архивной — свои пункты)
  const rows = await competenciesApi.sessionDetail(props.employeeId, s.kind, s.date)
  sessionEditRows.value = rows.filter((r: SessionDetailRow) => r.assessor_kind === s.assessor_kind)
  rows.forEach((r: SessionDetailRow) => {
    if (r.assessor_kind === s.assessor_kind) sessionEditDraft.value[r.item_id] = r.level
  })
  sessionEditVisible.value = true
}

async function saveSessionEdit() {
  const s = sessions.value.find((x) => sessionKey(x) === compareKeys.value[0]) || sessions.value[0]
  if (!s) return
  busy.value = true
  try {
    const r = await competenciesApi.editSession(props.employeeId, s.kind, s.date, sessionEditDraft.value)
    toast.add({ severity: 'success', summary: `Изменено пунктов: ${Object.keys(r.changed || {}).length} (аудит записан)`, life: 4000 })
    sessionEditVisible.value = false
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}

/** принудительное закрытие доступно оператору у незакрытой сессии (для закрытых кнопки нет) */
function canForceCloseSession(s: any): boolean {
  if (!canReassess.value || !s.matrix_id) return false
  const total = versionItemsCount.value[s.matrix_id]
  return total !== undefined && s.marks < total
}

async function forceCloseSession(s: any) {
  const total = versionItemsCount.value[s.matrix_id]
  if (!total) return
  let name = ''
  let grade = ''
  try {
    const card = await staffApi.card(props.employeeId)
    name = card.full_name
    grade = card.grade || ''
  } catch { /* имя/грейд в подтверждении не критичны */ }
  const ok = await confirmDialog.ask({
    header: 'Закрыть разметку принудительно?',
    message: `Кого: ${name || `сотрудник #${props.employeeId}`}`
      + `\nСхема: ${s.kind} (v${s.version || '—'}, #${s.matrix_id})`
      + `\nВид: ${s.assessor_kind === 'self' ? 'самооценка' : 'руководительская'}`
      + `\nНепокрыто: ${total - s.marks} из ${total}`
      + (grade ? `\nБудет проставлен грейд: ${grade}` : ''),
    okLabel: 'Закрыть принудительно', danger: true,
  })
  if (ok === null) return
  try {
    const res = await reassessmentApi.forceClose({
      employee_id: Number(props.employeeId), matrix_id: s.matrix_id,
      assessor_kind: s.assessor_kind,
    })
    toast.add({ severity: 'success',
                summary: `Проставлено системных отметок: ${res.system_marks}`, life: 5000 })
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  }
}

async function deleteSession(s: any) {
  const mode = await confirmDialog.ask({
    header: `Удалить разметку ${s.kind} от ${s.date}?`,
    message: 'Скрытая сессия исчезает из истории и сравнений; восстановить может админ.',
    choices: [
      { label: 'Скрыть (soft)', value: 'soft' },
      ...(canHardDelete.value ? [{ label: 'Удалить навсегда', value: 'hard' }] : []),
    ],
    okLabel: 'Удалить',
    danger: true,
  })
  if (mode === null) return
  try {
    await competenciesApi.deleteSession(props.employeeId, s.kind, s.date, mode === 'hard')
    toast.add({ severity: 'success', summary: mode === 'hard' ? 'Удалено навсегда' : 'Скрыто (soft delete)', life: 4000 })
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  }
}
</script>

<style scoped>
.comp-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
.kind-row { display: flex; align-items: center; gap: 10px; }
.info-ico { cursor: help; margin-left: 8px; font-size: 0.9rem; }
.comp-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; }
.comp-radar { position: relative; }
.radar-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
.comp-insights { min-width: 0; }
.mark-form-head { display: flex; gap: 12px; margin-bottom: 8px; }
.mark-table { max-width: 620px; }
.mark-row { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
.mark-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mark-select { width: 200px; flex-shrink: 0; }
.acts { display: flex; gap: 10px; }
.act { cursor: pointer; color: #2563eb; }
.act:hover { color: #1d4ed8; }
.act.danger { color: #dc2626; }
.small { font-size: 0.78rem; }
@media (max-width: 1000px) { .comp-grid { grid-template-columns: 1fr; } }
</style>
