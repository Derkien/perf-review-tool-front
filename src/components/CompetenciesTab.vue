<template>
  <div>
    <div class="comp-head">
      <SelectButton v-model="kind" :options="kinds" option-label="label" option-value="value" />
      <div class="comp-actions">
        <Button v-if="perms.edit_marks || perms.is_self"
                :label="markMode ? 'Закрыть разметку' : 'Внести разметку'"
                :severity="markMode ? 'secondary' : 'primary'" size="small" @click="markMode = !markMode" />
      </div>
    </div>
    <div class="comp-grid">
      <div class="comp-radar">
        <div class="radar-toolbar">
          <span class="muted small">веса 1–10 · норма грейда — серая</span>
          <Button icon="pi pi-search-plus" severity="secondary" size="small" outlined
                  v-tooltip.bottom="'Увеличить'" @click="radarBig = true" />
        </div>
        <RadarChart v-if="radar && radar.axis?.length" :axis="radar.axis" :self="radar.self"
                    :manager="radar.manager" :norm="radar.norm"
                    :session1="sessionSeries[0]" :session2="sessionSeries[1]" height="620px" />
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
        </div>
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
    <h2>История разметок</h2>
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
      <Column field="assessor_kind" header="Чья">
        <template #body="{ data: s }">{{ s.assessor_kind === 'self' ? 'самооценка' : 'руководитель' }}</template>
      </Column>
      <Column field="assessor" header="Кто заполнял" />
      <Column field="marks" header="Пунктов" />
      <Column header="Действия">
        <template #body="{ data: s }">
          <span class="acts">
            <i class="pi pi-download act" v-tooltip.top="'Скачать XLSX'"
               @click.stop="downloadSession(s)" />
            <i v-if="perms.edit_marks" class="pi pi-pencil act" v-tooltip.top="'Редактировать'"
               @click.stop="openSessionEdit(s)" />
            <i v-if="perms.edit_marks || canHardDelete" class="pi pi-trash act danger"
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
                  :session1="sessionSeries[0]" :session2="sessionSeries[1]" height="84vh" />
    </Dialog>

    <!-- редактирование сессии -->
    <Dialog v-model:visible="sessionEditVisible" modal header="Редактирование разметки" style="width: 640px">
      <div class="mark-table" style="max-height: 420px">
        <div v-for="row in sessionEditRows" :key="row.item_id" class="mark-row">
          <span class="mark-name">{{ row.item }}</span>
          <Select v-model="sessionEditDraft[row.item_id]" :options="gradeOptions"
                  option-label="label" option-value="value" filter size="small" />
        </div>
      </div>
      <Button label="Сохранить изменения" size="small" :loading="busy" @click="saveSessionEdit" />
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
import { competenciesApi } from '../api/endpoints'
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
const markMode = ref(false)
const markDate = ref(new Date().toISOString().slice(0, 10))
const markDraft = ref<Record<number, string>>({})
const radarBig = ref(false)
const compareKeys = ref<string[]>([])
const sessionSeries = ref<any[]>([null, null])
const sessionEditVisible = ref(false)
const sessionEditRows = ref<MatrixRow[]>([])
const sessionEditDraft = ref<Record<number, string>>({})
const busy = ref(false)

const canHardDelete = computed(() => auth.can('ROLE_D_COMPETENCY_SESSION'))

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
  compareKeys.value = []
  sessionSeries.value = [null, null]
}

function sessionKey(s: any): string { return `${s.kind}|${s.date}` }
function seriesColor(s: any): string {
  const idx = compareKeys.value.indexOf(sessionKey(s))
  return idx === 0 ? '#9333ea' : idx === 1 ? '#0d9488' : '#94a3b8'
}
function sessionRowClass(data: any) {
  if (data.assessor_kind !== 'manager') return 'row-disabled'
  return compareKeys.value.includes(sessionKey(data)) ? 'row-selected' : ''
}
function rowLevel(row: any): string {
  const lvl = row.manager?.level || row.self?.level
  return (lvl && row.descriptions?.[lvl]) || 'описания нет'
}

async function toggleCompare(s: any) {
  if (s.assessor_kind !== 'manager') return
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
    return
  }
  const dates = compareKeys.value.map((k) => k.split('|')[1])
  const r = await competenciesApi.radar(props.employeeId, kind.value, dates)
  sessionSeries.value = [r.session_1 || null, r.session_2 || null]
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

async function openSessionEdit(s: any) {
  sessionEditDraft.value = {}
  const rows = await competenciesApi.matrix(props.employeeId, s.kind as 'hard' | 'soft')
  sessionEditRows.value = rows
  rows.forEach((r: any) => {
    const lvl = s.assessor_kind === 'self' ? r.self?.level : r.manager?.level
    if (lvl && r.self?.date === s.date || r.manager?.date === s.date) sessionEditDraft.value[r.item_id] = lvl
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
