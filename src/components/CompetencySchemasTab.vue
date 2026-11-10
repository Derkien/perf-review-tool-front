<template>
  <div data-testid="competency-schemas">
    <div class="schemas-toolbar">
      <div>
        <h2 style="margin:0 0 4px">Матрицы компетенций</h2>
        <p class="muted small" style="margin:0">
          Схема роли — конфигурация с версиями: черновик → активная → архивная.
          Импорт создаёт черновик; активная версия меняется только явной активацией.
        </p>
      </div>
      <div class="toolbar-actions">
        <Button label="Скачать шаблон" icon="pi pi-download" size="small" severity="secondary"
                :loading="busy" @click="downloadTemplate" />
        <FileUpload mode="basic" custom-upload choose-label="Выбрать файл схемы"
                    :accept="'.xlsx'" @select="onFileSelected" />
        <Button label="Загрузить схему" icon="pi pi-upload" size="small"
                :disabled="!file" :loading="busy" @click="uploadSchema" />
      </div>
    </div>

    <DataTable :value="groups" data-key="key" v-model:expanded-rows="expandedRows" size="small">
      <Column expander style="width: 3rem" />
      <Column header="Тип">
        <template #body="{ data: g }">
          <Tag :value="g.kind" :severity="g.kind === 'hard' ? 'warn' : 'info'" />
        </template>
      </Column>
      <Column field="specialty" header="Роль" />
      <Column header="Активная версия">
        <template #body="{ data: g }">
          <template v-if="activeVersion(g)">
            <Tag :value="`v${activeVersion(g)!.version}`" severity="success" />
            <span class="muted small"> · пунктов {{ activeVersion(g)!.items_count }}</span>
          </template>
          <span v-else class="muted small">нет активной</span>
        </template>
      </Column>
      <Column header="Черновик">
        <template #body="{ data: g }">
          <Tag v-if="g.has_draft" value="есть черновик" severity="warn"
               data-testid="draft-badge" />
          <span v-else class="muted small">—</span>
        </template>
      </Column>
      <Column header="Версий всего">
        <template #body="{ data: g }">{{ g.versions.length }}</template>
      </Column>
      <template #expansion="{ data: g }">
        <div class="versions-block">
          <DataTable :value="g.versions" size="small" class="versions-table"
                     :row-class="(v: SchemaVersion) => v.id === selectedId ? 'row-selected' : ''"
                     @row-click="selectVersion(g, $event.data)">
            <Column header="Версия">
              <template #body="{ data: v }"><b>v{{ v.version }}</b></template>
            </Column>
            <Column header="Статус">
              <template #body="{ data: v }">
                <Tag :value="statusLabel(v.status)" :severity="statusSeverity(v.status)"
                     data-testid="schema-status" />
              </template>
            </Column>
            <Column field="items_count" header="Пунктов" />
            <Column header="Создана">
              <template #body="{ data: v }">
                <span class="small">{{ v.created_at ? new Date(v.created_at).toLocaleString('ru') : '—' }}</span>
              </template>
            </Column>
            <Column header="Действия">
              <template #body="{ data: v }">
                <span class="acts">
                  <Button v-if="v.status === 'draft'" label="Активировать" size="small"
                          @click.stop="confirmActivate(g, v)" />
                  <Button v-if="v.status === 'archived'" label="Вернуть активной" size="small"
                          severity="secondary" @click.stop="confirmActivate(g, v)" />
                  <Button v-if="v.status === 'draft'" label="Удалить черновик" size="small"
                          severity="danger" outlined @click.stop="confirmDelete(g, v)" />
                </span>
              </template>
            </Column>
          </DataTable>

          <!-- детали версии: пункты с описаниями по грейдам + демо для черновика -->
          <div v-if="selected && selectedGroup === g.key" class="version-detail">
            <h3 style="margin:12px 0 6px">
              Пункты версии v{{ selected.version }} — {{ g.specialty }}
              <Tag :value="statusLabel(selected.status)" :severity="statusSeverity(selected.status)" />
            </h3>
            <div class="items-list">
              <div v-for="it in versionItems" :key="it.id" class="item-row">
                <span class="item-name" v-tooltip.top="itemTip(it)">{{ it.name }}</span>
                <span v-if="it.category" class="muted small">{{ it.category }}</span>
              </div>
            </div>

            <template v-if="selected.status === 'draft'">
              <h3 style="margin:16px 0 4px">Предпросмотр примера заполнения</h3>
              <Message severity="warn" :sticky="true">
                <b>демо-данные</b> — автозаполнение для оценки схемы, не сохраняются как оценки.
                Схема ещё не опубликована.
              </Message>
              <div v-if="demo" class="demo-grid">
                <RadarChart :axis="demo.axis" :self="demo.self" :manager="demo.manager"
                            :norm="demo.norm" height="480px" />
                <div class="demo-table">
                  <div v-for="(name, i) in demo.axis" :key="name" class="demo-row">
                    <span class="item-name" v-tooltip.top="demoTip(i)">{{ name }}</span>
                    <span class="muted small">самооценка {{ demo.self[i] }} · рукля {{ demo.manager[i] }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </DataTable>

    <h3 style="margin:18px 0 6px">Роли без схем</h3>
    <p class="muted small" style="margin:0 0 6px">
      Должности и функциональные группы из кадровых данных, для которых нет ни одной версии
      схемы — заполнение компетенций по ним недоступно.
    </p>
    <div v-if="withoutSchemas.length" class="without-list">
      <Tag v-for="r in withoutSchemas" :key="r.kind + r.specialty"
           :value="`${r.kind}: ${r.specialty}`"
           :severity="r.kind === 'hard' ? 'warn' : 'info'" />
    </div>
    <p v-else class="muted small">Все роли из кадровых данных покрыты схемами.</p>

    <!-- модалка предпросмотра импорта -->
    <Dialog v-model:visible="previewVisible" modal header="Предпросмотр загрузки схемы"
            style="width: 640px">
      <p v-if="uploadPreview" class="muted small" style="margin-top:0">
        Распознано строк: {{ uploadPreview.rows_total }}. Применение создаст
        <b>черновики</b> новых версий — активные матрицы не изменятся до активации.
      </p>
      <DataTable v-if="uploadPreview" :value="uploadPairs" size="small">
        <Column header="Тип">
          <template #body="{ data: p }">
            <Tag :value="p.kind" :severity="p.kind === 'hard' ? 'warn' : 'info'" />
          </template>
        </Column>
        <Column field="specialty" header="Роль" />
        <Column field="items" header="Пунктов" />
        <Column header="Итог">
          <template #body="{ data: p }">
            будет создан черновик v{{ p.nextVersion }}
          </template>
        </Column>
      </DataTable>
      <Message v-for="w in uploadPreview?.warnings || []" :key="w.specialty" severity="warn"
               :sticky="true" style="margin-top:8px">
        «{{ w.specialty }}» ({{ w.kind }}): {{ w.warning }}
      </Message>
      <Message v-for="c in uploadPreview?.conflicts || []" :key="c.row" severity="error"
               :sticky="true" style="margin-top:8px">
        Строка {{ c.row }}: {{ c.error }} — строка пропущена
      </Message>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="previewVisible = false" />
        <Button label="Применить (создать черновики)" :loading="busy" @click="applyUpload" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import FileUpload from 'primevue/fileupload'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import RadarChart from './RadarChart.vue'
import { competenciesApi } from '../api/endpoints'
import type { RadarData, SchemasOverview, SchemaGroup, SchemaVersion } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAppConfirm } from '../composables/useAppConfirm'
import { trackAction } from '../api/endpoints'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const confirmDialog = useAppConfirm()

const overview = ref<SchemasOverview | null>(null)
// при data-key PrimeVue ждёт объект-мапу { rowKey: rowData } (тип any[] в дататипах неточен)
const expandedRows = ref<any>({})
const selectedId = ref<number | null>(null)
const selectedGroup = ref<string | null>(null)
const versionItems = ref<MatrixItemRow[]>([])
const demo = ref<RadarData | null>(null)
const busy = ref(false)

type MatrixItemRow = Awaited<ReturnType<typeof competenciesApi.matrixItems>>[number]

type GroupRow = SchemaGroup & { key: string }
const groups = computed<GroupRow[]>(() =>
  (overview.value?.groups || []).map((g) => ({ ...g, key: `${g.kind}|${g.specialty}` })))
const withoutSchemas = computed(() => overview.value?.roles_without_schemas || [])
const selected = computed(() => {
  for (const g of groups.value) {
    const v = g.versions.find((x) => x.id === selectedId.value)
    if (v) return v
  }
  return null
})

onMounted(load)

async function load() {
  try {
    overview.value = await competenciesApi.schemas()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось загрузить схемы', detail: errMsg(e), life: 8000 })
  }
}

function activeVersion(g: SchemaGroup): SchemaVersion | undefined {
  return g.versions.find((v) => v.status === 'active')
}

function statusLabel(status: string): string {
  return { draft: 'черновик', active: 'активная', archived: 'архивная' }[status] || status
}
function statusSeverity(status: string): 'warn' | 'success' | 'secondary' {
  return ({ draft: 'warn', active: 'success', archived: 'secondary' } as const)[status as 'draft'] || 'secondary'
}

async function selectVersion(g: GroupRow, v: SchemaVersion) {
  selectedGroup.value = g.key
  selectedId.value = v.id
  demo.value = null
  try {
    versionItems.value = await competenciesApi.matrixItems(v.id)
  } catch (e) {
    versionItems.value = []
    toast.add({ severity: 'error', summary: 'Не удалось загрузить пункты', detail: errMsg(e), life: 8000 })
  }
  if (v.status === 'draft') {
    try {
      demo.value = await competenciesApi.schemaDemo(v.id)
    } catch { /* демо недоступно — блок просто не покажется */ }
  }
}

function itemTip(it: Record<string, unknown>): string {
  const desc = it.level_descriptions as Record<string, string> | undefined
  if (!desc || !Object.keys(desc).length) return 'описания по грейдам не заданы'
  return Object.entries(desc).map(([g, t]) => `${g}: ${t}`).join('\n')
}
function demoTip(i: number): string {
  const it = versionItems.value[i]
  return it ? itemTip(it) : ''
}

async function downloadTemplate() {
  busy.value = true
  try {
    const blob = await competenciesApi.schemaTemplate()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'competency-schema-template.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось скачать шаблон', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}

// --- загрузка схемы: файл → предпросмотр → apply ---

const file = ref<File | null>(null)
const previewVisible = ref(false)
const uploadPreview = ref<Awaited<ReturnType<typeof competenciesApi.previewSchemaImport>> | null>(null)

function onFileSelected(e: { files: File[] }) {
  file.value = e.files?.[0] || null
}

/** пары файла + итоговые номера версий — то же правило, что в apply бэка:
 *  существующий черновик пары заменяется и его номер переиспользуется. */
const uploadPairs = computed(() => {
  const rows = (uploadPreview.value?.preview || []) as Record<string, unknown>[]
  const byPair = new Map<string, { kind: string; specialty: string; items: number; nextVersion: number }>()
  for (const g of groups.value) {
    // без черновика пары: max по оставшимся + 1; versions пусты → 1 (новая роль)
    const kept = g.versions.filter((v) => v.status !== 'draft')
    byPair.set(`${g.kind}|${g.specialty}`, {
      kind: g.kind, specialty: g.specialty, items: 0,
      nextVersion: (kept.length ? Math.max(...kept.map((v) => v.version)) : 0) + 1,
    })
  }
  for (const r of rows) {
    const key = `${r.kind}|${r.specialty}`
    const cur = byPair.get(key)
      || { kind: String(r.kind), specialty: String(r.specialty), items: 0, nextVersion: 1 }
    cur.items += 1
    byPair.set(key, cur)
  }
  return [...byPair.values()].filter((p) => p.items > 0)
})

async function uploadSchema() {
  if (!file.value) return
  busy.value = true
  try {
    uploadPreview.value = await competenciesApi.previewSchemaImport(file.value)
    previewVisible.value = true
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка разбора файла', detail: errMsg(e), life: 10000 })
  } finally { busy.value = false }
}

async function applyUpload() {
  if (!uploadPreview.value) return
  busy.value = true
  try {
    await competenciesApi.applySchemaImport(uploadPreview.value.batch_id)
    trackAction('admin.competency-schemas', { action: 'apply-import', batch_id: uploadPreview.value.batch_id })
    toast.add({ severity: 'success',
      summary: 'Схемы загружены: созданы черновики. Активация — вручную в этом разделе.', life: 8000 })
    previewVisible.value = false
    file.value = null
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось применить', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}

// --- активация и удаление черновика (модалки подтверждений) ---

async function confirmActivate(g: GroupRow, v: SchemaVersion) {
  const active = activeVersion(g)
  const ok = await confirmDialog.ask({
    header: `Активировать схему «${g.specialty}» (${g.kind})?`,
    message:
      'Заполнение перейдёт на эту версию; прежняя активная уйдёт в архив, история сохранится.\n\n'
      + `Активировать версию: v${v.version}\n`
      + `Сейчас активна: ${active ? `v${active.version}` : 'нет'}`,
    okLabel: 'Активировать',
  })
  if (ok === null) return
  try {
    await competenciesApi.activateSchema(v.id)
    trackAction('admin.competency-schemas', { action: 'activate', matrix_id: v.id })
    toast.add({ severity: 'success', summary: `Версия v${v.version} активна`, life: 4000 })
    selectedId.value = null
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось активировать', detail: errMsg(e), life: 8000 })
  }
}

async function confirmDelete(g: GroupRow, v: SchemaVersion) {
  const ok = await confirmDialog.ask({
    header: `Удалить черновик схемы «${g.specialty}» (${g.kind})?`,
    message: `Роль: ${g.specialty} (${g.kind})\nУдалить черновик: v${v.version} (${v.items_count} пунктов)\n\n`
      + 'Черновик можно перезалить повторным импортом; опубликованные версии затронуты не будут.',
    okLabel: 'Удалить черновик',
    danger: true,
  })
  if (ok === null) return
  try {
    await competenciesApi.deleteSchemaDraft(v.id)
    trackAction('admin.competency-schemas', { action: 'delete-draft', matrix_id: v.id })
    toast.add({ severity: 'success', summary: `Черновик v${v.version} удалён`, life: 4000 })
    if (selectedId.value === v.id) selectedId.value = null
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось удалить', detail: errMsg(e), life: 8000 })
  }
}
</script>

<style scoped>
.schemas-toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.toolbar-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.versions-block { padding: 4px 8px 8px; }
.versions-table { margin-bottom: 6px; }
.acts { display: flex; gap: 8px; }
.items-list { max-width: 720px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; }
.item-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
.item-name { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.demo-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; margin-top: 8px; }
.demo-table { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; align-self: start; }
.demo-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
.without-list { display: flex; flex-wrap: wrap; gap: 8px; }
.small { font-size: 0.78rem; }
:deep(.row-selected) { background: #eff6ff !important; }
@media (max-width: 900px) { .demo-grid { grid-template-columns: 1fr; } }
</style>
