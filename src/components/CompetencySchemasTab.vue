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

    <DataTable :value="groups" data-key="key" v-model:expanded-rows="expandedRows" size="small" paginator :rows="20" :rows-per-page-options="[20, 50, 100]">
      <Column expander style="width: 3rem" />
      <Column header="Тип">
        <template #body="{ data: g }">
          <Tag :value="g.type_code"
               :severity="g.type_code === 'hard' ? 'warn' : g.type_code === 'soft' ? 'info' : 'secondary'" />
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
      <Column header="Действия">
        <template #body="{ data: g }">
          <Button v-if="activeVersion(g)" label="Скачать текущую схему" text size="small"
                  :data-testid="`schema-export-${g.type_code}-${g.specialty}`"
                  @click="downloadActiveSchema(g)" />
        </template>
      </Column>
      <template #expansion="{ data: g }">
        <div class="versions-block">
          <DataTable :value="g.versions" size="small" class="versions-table"
                     paginator :rows="20" :rows-per-page-options="[20, 50, 100]"
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

    <!-- реестр типов: вкладки профиля и валидация импорта строятся по нему (change 2) -->
    <h3 style="margin:18px 0 6px">Типы компетенций</h3>
    <p class="muted small" style="margin:0 0 6px">
      Реестр типов: вкладки профиля сотрудников и валидация импорта строятся по нему.
      Деактивация скрывает тип из интерфейсов, схемы и разметки сохраняются; удаление не предусмотрено.
    </p>
    <div style="margin-bottom:6px">
      <Button label="Добавить тип" icon="pi pi-plus" size="small" data-testid="type-create-btn"
              @click="openTypeCreate" />
    </div>
    <DataTable :value="registryTypes" size="small" data-testid="types-table" style="max-width: 720px" paginator :rows="20" :rows-per-page-options="[20, 50, 100]">
      <Column field="code" header="Код" />
      <Column field="title" header="Название" />
      <Column field="order_no" header="Порядок" />
      <Column header="Статус">
        <template #body="{ data: t }">
          <Tag :value="t.is_active ? 'активен' : 'деактивирован'"
               :severity="t.is_active ? 'success' : 'secondary'" data-testid="type-status" />
        </template>
      </Column>
      <Column header="Действия">
        <template #body="{ data: t }">
          <Button label="Править" text size="small" :data-testid="`type-edit-${t.code}`"
                  @click="openTypeEdit(t)" />
        </template>
      </Column>
    </DataTable>

    <!-- модалка предпросмотра импорта: дифф по парам из API + явный override -->
    <Dialog v-model:visible="previewVisible" modal header="Предпросмотр загрузки схемы"
            style="width: 720px">
      <p v-if="uploadPreview" class="muted small" style="margin-top:0">
        Распознано строк: {{ uploadPreview.rows_total }}. Применение создаст
        <b>черновики</b> изменившихся пар — активные матрицы не изменятся до активации.
      </p>
      <DataTable v-if="uploadPreview" :value="uploadPreview.pairs || []" size="small"
                 data-testid="upload-pairs" paginator :rows="20" :rows-per-page-options="[20, 50, 100]">
        <Column header="Тип">
          <template #body="{ data: p }">
            <Tag :value="p.type_code"
                 :severity="p.type_code === 'hard' ? 'warn' : p.type_code === 'soft' ? 'info' : 'secondary'" />
          </template>
        </Column>
        <Column field="specialty" header="Роль" />
        <Column field="items_count" header="Пунктов" />
        <Column header="Статус">
          <template #body="{ data: p }">
            <Tag :value="pairStatusLabel(p.status)" :severity="pairStatusSeverity(p.status)"
                 :data-testid="`pair-status-${p.specialty}`" />
            <span v-if="p.status === 'changed' && p.diff" class="muted small diff-counts"
                  data-testid="pair-diff-counts">
              +{{ p.diff.added.length }} −{{ p.diff.removed.length }} ~{{ p.diff.changed.length }}
            </span>
          </template>
        </Column>
        <Column header="Итог">
          <template #body="{ data: p }">
            <span v-if="p.status === 'unchanged'" class="muted small">без изменений — версия не поднимется</span>
            <span v-else>черновик v{{ p.next_version }}</span>
          </template>
        </Column>
      </DataTable>
      <!-- структурные детали изменившихся пар: добавлено/удалено/изменено по пунктам -->
      <details v-for="p in changedPairs" :key="p.type_code + p.specialty"
               class="diff-details" :data-testid="`pair-diff-${p.specialty}`">
        <summary>{{ p.type_code }}: {{ p.specialty }}</summary>
        <p v-if="p.diff?.added.length" class="small" style="margin:4px 0">
          Добавлены: {{ p.diff.added.map((i) => diffItem(i)).join('; ') }}
        </p>
        <p v-if="p.diff?.removed.length" class="small" style="margin:4px 0">
          Удалены: {{ p.diff.removed.map((i) => diffItem(i)).join('; ') }}
        </p>
        <p v-for="c in p.diff?.changed || []" :key="c.name" class="small" style="margin:4px 0">
          Изменён «{{ diffItem(c) }}»: {{ c.changes.join('; ') }}
        </p>
      </details>
      <div v-if="hasUnchangedPairs" class="force-row" data-testid="force-row">
        <Checkbox v-model="forceUpload" :binary="true" input-id="force-upload" />
        <label for="force-upload" class="small">
          Создать версии и для неизменившихся пар (явный override администратора)
        </label>
      </div>
      <Message v-for="w in uploadPreview?.warnings || []" :key="w.specialty" severity="warn"
               :sticky="true" style="margin-top:8px">
        «{{ w.specialty }}» ({{ w.type_code }}): {{ w.warning }}
      </Message>
      <Message v-for="c in uploadPreview?.conflicts || []" :key="c.row" severity="error"
               :sticky="true" style="margin-top:8px">
        Строка {{ c.row }}: {{ c.error }} — строка пропущена
      </Message>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="previewVisible = false" />
        <Button label="Применить (создать черновики)" :loading="busy" data-testid="apply-import"
                @click="applyUpload" />
      </template>
    </Dialog>

    <!-- диалог создания/правки типа реестра -->
    <Dialog v-model:visible="typeDialogVisible" modal
            :header="typeIsNew ? 'Новый тип компетенций' : `Тип «${typeForm.code}»`"
            style="width: 480px">
      <div class="type-form">
        <label>Код (строчные латиница/цифры/дефис, неизменяем)
          <InputText v-model="typeForm.code" :disabled="!typeIsNew" data-testid="type-code-input" />
        </label>
        <label>Название (заголовок вкладки)
          <InputText v-model="typeForm.title" data-testid="type-title-input" />
        </label>
        <label>Порядок во вкладках
          <InputText v-model="typeOrderStr" type="number" data-testid="type-order-input" />
        </label>
        <label v-if="!typeIsNew" class="switch-row">
          <Checkbox v-model="typeForm.is_active" :binary="true" input-id="type-active" />
          Активен (деактивация скрывает тип, данные сохраняются)
        </label>
      </div>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="typeDialogVisible = false" />
        <Button :label="typeIsNew ? 'Создать' : 'Сохранить'" :loading="busy"
                data-testid="type-submit" @click="saveType" />
      </template>
    </Dialog>

    <!-- блокирующие ошибки импорта: персистентный список + файл ошибок (приёмка 12.11) -->
    <ImportErrorsDialog v-model:visible="importErrorsVisible"
                        :message="importErrors?.message || ''"
                        :errors="importErrors?.errors || []" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import FileUpload from 'primevue/fileupload'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import RadarChart from './RadarChart.vue'
import { competenciesApi, competencyTypesApi } from '../api/endpoints'
import ImportErrorsDialog from './ImportErrorsDialog.vue'
import type { ImportErrorRow } from './ImportErrorsDialog.vue'
import type { CompetencyTypeAllRow, RadarData, SchemasOverview, SchemaDiffPair, SchemaGroup, SchemaVersion } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAppConfirm } from '../composables/useAppConfirm'
import { trackAction } from '../api/endpoints'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const confirmDialog = useAppConfirm()

const overview = ref<SchemasOverview | null>(null)
const registryTypes = ref<CompetencyTypeAllRow[]>([])
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
  (overview.value?.groups || []).map((g) => ({ ...g, key: `${g.type_code}|${g.specialty}` })))
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
  try {
    registryTypes.value = await competencyTypesApi.all()
  } catch { registryTypes.value = [] }
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

// --- загрузка схемы: файл → предпросмотр с диффом → apply (с опциональным force) ---

const file = ref<File | null>(null)
const previewVisible = ref(false)
const uploadPreview = ref<Awaited<ReturnType<typeof competenciesApi.previewSchemaImport>> | null>(null)
/** явный override администратора: черновики и для неизменившихся пар */
const forceUpload = ref(false)

function onFileSelected(e: { files: File[] }) {
  file.value = e.files?.[0] || null
}

/** изменившиеся пары — для структурных деталей под таблицей */
const changedPairs = computed(() =>
  (uploadPreview.value?.pairs || []).filter((p) => p.status === 'changed'))
const hasUnchangedPairs = computed(() =>
  (uploadPreview.value?.pairs || []).some((p) => p.status === 'unchanged'))

function pairStatusLabel(s: SchemaDiffPair['status']): string {
  return ({ new: 'новая', changed: 'изменилось', unchanged: 'без изменений' } as const)[s]
}
function pairStatusSeverity(s: SchemaDiffPair['status']): 'info' | 'warn' | 'secondary' {
  return ({ new: 'info', changed: 'warn', unchanged: 'secondary' } as const)[s]
}
/** пункт диффа — «категория/имя» (категория может быть пустой) */
function diffItem(i: { category: string; name: string }): string {
  return i.category ? `${i.category}/${i.name}` : i.name
}

async function uploadSchema() {
  if (!file.value) return
  busy.value = true
  try {
    uploadPreview.value = await competenciesApi.previewSchemaImport(file.value)
    forceUpload.value = false
    previewVisible.value = true
  } catch (e) {
    showImportErrors(e, 'Ошибка разбора файла')
  } finally { busy.value = false }
}

/** Блокирующие ошибки импорта — персистентная модалка со списком + файл ошибок
 * (приёмка 12.11), не исчезающий тост. Строчный detail (словарные импорты) — текстом. */
const importErrorsVisible = ref(false)
const importErrors = ref<{ message: string; errors: ImportErrorRow[] } | null>(null)

function showImportErrors(e: unknown, fallbackSummary: string) {
  const detail = (e as { detail?: unknown })?.detail
  if (detail && typeof detail === 'object' && 'errors' in detail) {
    const d = detail as { message?: string; errors: ImportErrorRow[] }
    importErrors.value = { message: d.message || fallbackSummary, errors: d.errors || [] }
    importErrorsVisible.value = true
    return
  }
  toast.add({ severity: 'error', summary: fallbackSummary, detail: errMsg(e), life: 10000 })
}

async function applyUpload() {
  if (!uploadPreview.value) return
  busy.value = true
  try {
    await competenciesApi.applySchemaImport(uploadPreview.value.batch_id, forceUpload.value)
    trackAction('admin.competency-schemas', { action: 'apply-import', batch_id: uploadPreview.value.batch_id })
    toast.add({ severity: 'success',
                summary: 'Схемы загружены: созданы черновики. Активация — вручную в этом разделе.', life: 8000 })
    previewVisible.value = false
    file.value = null
    await load()
  } catch (e) {
    showImportErrors(e, 'Не удалось применить')
  } finally { busy.value = false }
}

/** «Скачать текущую схему» (приёмка 12.11): активная версия пары (тип, роль)
 * в формате импорта — правь и загружай обратно; повторный импорт без правок
 * не поднимает версию. */
async function downloadActiveSchema(g: GroupRow) {
  const v = activeVersion(g)
  if (!v) return
  busy.value = true
  try {
    const blob = await competenciesApi.schemaExport(v.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schema-${g.type_code}-${g.specialty}-v${v.version}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    trackAction('admin.competency-schemas', { action: 'export-schema', matrix_id: v.id })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось выгрузить схему', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}

// --- реестр типов: создание/правка/деактивация ---

const typeDialogVisible = ref(false)
const typeIsNew = ref(true)
const typeWasActive = ref(true)
const typeForm = ref<CompetencyTypeAllRow>({ code: '', title: '', order_no: 0, is_active: true })
/** InputText держит строку — число разбираем на запись */
const typeOrderStr = computed({
  get: () => String(typeForm.value.order_no),
  set: (v: string) => { typeForm.value.order_no = Number(v) || 0 },
})

function openTypeCreate() {
  typeIsNew.value = true
  typeForm.value = { code: '', title: '', order_no: (registryTypes.value.length + 1) * 10, is_active: true }
  typeDialogVisible.value = true
}
function openTypeEdit(t: CompetencyTypeAllRow) {
  typeIsNew.value = false
  typeWasActive.value = t.is_active
  typeForm.value = { ...t }
  typeDialogVisible.value = true
}

async function saveType() {
  busy.value = true
  try {
    if (typeIsNew.value) {
      await competencyTypesApi.create({
        code: typeForm.value.code, title: typeForm.value.title, order_no: typeForm.value.order_no,
      })
      toast.add({ severity: 'success', summary: `Тип «${typeForm.value.code}» создан`, life: 4000 })
    } else {
      if (typeWasActive.value && !typeForm.value.is_active) {
        const ok = await confirmDialog.ask({
          header: `Деактивировать тип «${typeForm.value.code}»?`,
          message: 'Вкладка типа скроется из профилей; схемы, разметки и история сохранятся.',
          okLabel: 'Деактивировать', danger: true,
        })
        if (ok === null) return
      }
      await competencyTypesApi.patch(typeForm.value.code, {
        title: typeForm.value.title, order_no: typeForm.value.order_no,
        is_active: typeForm.value.is_active,
      })
      toast.add({ severity: 'success', summary: 'Тип сохранён', life: 4000 })
    }
    trackAction('admin.competency-types', { action: typeIsNew.value ? 'create' : 'update', code: typeForm.value.code })
    typeDialogVisible.value = false
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось сохранить тип', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}

// --- активация и удаление черновика (модалки подтверждений) ---

async function confirmActivate(g: GroupRow, v: SchemaVersion) {
  const active = activeVersion(g)
  const ok = await confirmDialog.ask({
    header: `Активировать схему «${g.specialty}» (${g.type_code})?`,
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
    header: `Удалить черновик схемы «${g.specialty}» (${g.type_code})?`,
    message: `Роль: ${g.specialty} (${g.type_code})\nУдалить черновик: v${v.version} (${v.items_count} пунктов)\n\n`
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
.diff-counts { margin-left: 6px; }
.diff-details { margin: 6px 0; font-size: 0.85rem; }
.diff-details summary { cursor: pointer; color: #2563eb; }
.force-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.type-form { display: flex; flex-direction: column; gap: 10px; }
.type-form label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; }
.type-form .switch-row { flex-direction: row; align-items: center; }
.small { font-size: 0.78rem; }
:deep(.row-selected) { background: #eff6ff !important; }
@media (max-width: 900px) { .demo-grid { grid-template-columns: 1fr; } }
</style>
