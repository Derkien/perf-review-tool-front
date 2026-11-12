<template>
  <div data-testid="dictionaries">
    <div class="schemas-toolbar">
      <div>
        <h2 style="margin:0 0 4px">Справочники</h2>
        <p class="muted small" style="margin:0">
          Универсальный контур списков значений: грейды (порядок = вес — влияет на расчёты
          калибровки и норм), категории и пункты компетенций. Валидация шаблона схем
          идёт по ним: новые значения сначала добавляются сюда.
          Workflow: выгрузка словарей → наполнение → импорт диффа → импорт схемы.
        </p>
      </div>
      <div class="toolbar-actions">
        <MultiSelect v-model="exportTypes" :options="typeCodes" placeholder="все типы"
                     :max-selected-labels="2" size="small" data-testid="dict-export-types"
                     class="dict-types" />
        <Button label="Выгрузить словари" icon="pi pi-download" size="small" severity="secondary"
                :loading="busy" data-testid="dict-export-btn" @click="downloadExport" />
        <FileUpload mode="basic" custom-upload choose-label="Выбрать файл словарей"
                    :accept="'.xlsx'" @select="onFileSelected" />
        <Button label="Загрузить дифф" icon="pi pi-upload" size="small"
                :disabled="!file" :loading="busy" data-testid="dict-import-btn" @click="previewImport" />
      </div>
    </div>

    <div class="dict-picker">
      <Select v-model="selectedSlug" :options="dictionaries" option-label="title"
              option-value="slug" size="small" data-testid="dict-select"
              @change="loadItems" />
      <span v-if="current" class="muted small">{{ current.description }}</span>
    </div>

    <div style="margin-bottom:6px">
      <Button label="Добавить значение" icon="pi pi-plus" size="small" data-testid="dict-item-create-btn"
              @click="openCreate" />
    </div>
    <DataTable :value="items" size="small" data-testid="dict-items-table" style="max-width: 860px">
      <Column field="value" header="Значение">
        <template #body="{ data: it }">
          <b>{{ it.value }}</b>
        </template>
      </Column>
      <Column field="category" header="Категория">
        <template #body="{ data: it }">{{ it.category || '—' }}</template>
      </Column>
      <Column field="title" header="Тайтл" />
      <Column field="order_no" header="Порядок">
        <template #body="{ data: it }">
          <span v-if="isGrades" v-tooltip.top="' порядок = вес грейда (расчёты калибровки и норм)'">
            {{ it.order_no }}
          </span>
          <span v-else>{{ it.order_no }}</span>
        </template>
      </Column>
      <Column header="Действия">
        <template #body="{ data: it }">
          <Button label="Править" text size="small" :data-testid="`dict-item-edit-${it.id}`"
                  @click="openEdit(it)" />
        </template>
      </Column>
    </DataTable>
    <p class="muted small">
      Справочники только растут: переименование значения и удаление недоступны — история
      версий схем и разметки ссылается на строки.
    </p>

    <!-- модалка диффа импорта словарей -->
    <Dialog v-model:visible="diffVisible" modal header="Предпросмотр импорта словарей"
            style="width: 720px">
      <Message v-if="diff && diff.no_changes" severity="info" :sticky="true">
        Без изменений: значения и порядок совпадают с текущими справочниками.
      </Message>
      <template v-if="diff && !diff.no_changes">
        <div v-for="(sheet, slug) in diff.sheets" :key="slug" class="diff-sheet">
          <h4 style="margin:8px 0 4px">{{ dictTitle(slug as string) }}</h4>
          <p v-if="!sheet.added.length && !sheet.edited.length" class="muted small">без изменений</p>
          <ul v-if="sheet.added.length" class="small">
            <li v-for="a in sheet.added" :key="a.value" data-testid="dict-diff-added">
              + {{ a.value }}<span v-if="a.category"> ({{ a.category }})</span>
            </li>
          </ul>
          <ul v-if="sheet.edited.length" class="small">
            <li v-for="e in sheet.edited" :key="e.value">
              ~ {{ e.value }}<span v-if="e.title">: тайтл → «{{ e.title }}»</span><span v-if="e.order_no">: порядок → {{ e.order_no }}</span>
            </li>
          </ul>
        </div>
      </template>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="diffVisible = false" />
        <Button label="Применить дифф" :disabled="!diff || diff.no_changes" :loading="busy"
                data-testid="dict-diff-apply" @click="applyImport" />
      </template>
    </Dialog>

    <!-- модалка добавления/правки значения -->
    <Dialog v-model:visible="itemDialogVisible" modal :header="itemIsNew ? 'Новое значение' : 'Правка значения'"
            style="width: 480px">
      <div class="type-form">
        <label v-if="itemIsNew">Значение (неизменяемо после создания)
          <InputText v-model="itemForm.value" data-testid="dict-item-value-input" />
        </label>
        <label v-else>Значение
          <InputText :model-value="itemForm.value" disabled />
        </label>
        <label>Тайтл
          <InputText v-model="itemForm.title" data-testid="dict-item-title-input" />
        </label>
        <label>Порядок
          <InputText v-model="itemOrderStr" type="number" data-testid="dict-item-order-input" />
        </label>
        <label v-if="itemIsNew && isItems">Категория (обязательна для пунктов)
          <Select v-model="itemForm.category" :options="categoryOptions" size="small"
                  data-testid="dict-item-category-input" />
        </label>
      </div>
      <p v-if="!itemIsNew && isGrades" class="muted small">
        Правка порядка грейда = правка веса: влияет на расчёты калибровки и норм.
      </p>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="itemDialogVisible = false" />
        <Button :label="itemIsNew ? 'Добавить' : 'Сохранить'" :loading="busy"
                data-testid="dict-item-submit" @click="saveItem" />
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
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import { competencyTypesApi, dictionariesApi, trackAction } from '../api/endpoints'
import type { DictionaryItemRow, DictionaryRow, DictDiffSheet } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAppConfirm } from '../composables/useAppConfirm'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const confirmDialog = useAppConfirm()

const dictionaries = ref<DictionaryRow[]>([])
const selectedSlug = ref('')
const items = ref<DictionaryItemRow[]>([])
const busy = ref(false)
const file = ref<File | null>(null)
const exportTypes = ref<string[]>([])
const typeCodes = ref<string[]>([])
const diff = ref<{ sheets: Record<string, DictDiffSheet>; no_changes: boolean } | null>(null)
const diffVisible = ref(false)

const itemDialogVisible = ref(false)
const itemIsNew = ref(true)
const itemForm = ref<{ id: number; value: string; title: string; order: number | null; category: string }>(
  { id: 0, value: '', title: '', order: null, category: '' })
const itemOrderStr = ref('')

const isGrades = computed(() => selectedSlug.value === 'grade')
const isItems = computed(() => selectedSlug.value === 'competency-item')
const current = computed(() => dictionaries.value.find((d) => d.slug === selectedSlug.value))
const categoryValues = ref<string[]>([])
const categoryOptions = computed(() =>
  isItems.value ? categoryValues.value : [])

function dictTitle(slug: string): string {
  return dictionaries.value.find((d) => d.slug === slug)?.title || slug
}

onMounted(load)

async function load() {
  try {
    dictionaries.value = await dictionariesApi.list()
    if (!selectedSlug.value && dictionaries.value.length) selectedSlug.value = dictionaries.value[0].slug
    await loadItems()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось загрузить справочники', detail: errMsg(e), life: 8000 })
  }
  try {
    typeCodes.value = (await competencyTypesApi.all()).filter((t) => t.is_active).map((t) => t.code)
  } catch { typeCodes.value = [] }
}

async function loadItems() {
  if (!selectedSlug.value) return
  try {
    items.value = await dictionariesApi.items(selectedSlug.value)
    if (selectedSlug.value === 'competency-item') {
      categoryValues.value = await dictionariesApi.items('competency-category').then((rows) => rows.map((r) => r.value))
    }
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось загрузить значения', detail: errMsg(e), life: 8000 })
  }
}

async function downloadExport() {
  busy.value = true
  try {
    const blob = await dictionariesApi.export(exportTypes.value)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dictionaries.xlsx'
    a.click()
    URL.revokeObjectURL(url)
    trackAction('dictionaries', { action: 'export', types: exportTypes.value })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка выгрузки', detail: errMsg(e), life: 8000 })
  } finally {
    busy.value = false
  }
}

function onFileSelected(ev: { files: File[] }) {
  file.value = ev.files?.[0] || null
}

async function previewImport() {
  if (!file.value) return
  busy.value = true
  try {
    diff.value = await dictionariesApi.importPreview(file.value)
    diffVisible.value = true
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Файл не принят', detail: errMsg(e), life: 12000 })
  } finally {
    busy.value = false
  }
}

async function applyImport() {
  if (!file.value || !diff.value) return
  busy.value = true
  try {
    const res = await dictionariesApi.importApply(file.value)
    toast.add({ severity: 'success', summary: `Словари обновлены: +${res.added}, правок ${res.edited}`, life: 5000 })
    diffVisible.value = false
    file.value = null
    await load()
    await loadItems()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не применено', detail: errMsg(e), life: 12000 })
  } finally {
    busy.value = false
  }
}

function openCreate() {
  itemIsNew.value = true
  itemForm.value = { id: 0, value: '', title: '', order: null, category: '' }
  itemOrderStr.value = ''
  itemDialogVisible.value = true
}

function openEdit(it: DictionaryItemRow) {
  itemIsNew.value = false
  itemForm.value = { id: it.id, value: it.value, title: it.title, order: it.order_no, category: it.category }
  itemOrderStr.value = String(it.order_no)
  itemDialogVisible.value = true
}

async function saveItem() {
  const form = itemForm.value
  const order = itemOrderStr.value === '' ? null : Number(itemOrderStr.value)
  busy.value = true
  try {
    if (itemIsNew.value) {
      await dictionariesApi.createItem(selectedSlug.value, {
        value: form.value.trim(), title: form.title.trim() || form.value.trim(),
        order_no: order,
        category: isItems.value ? form.category : '',
      })
      toast.add({ severity: 'success', summary: `Значение добавлено: ${form.value}`, life: 4000 })
      trackAction('dictionaries', { action: 'create-item', dictionary: selectedSlug.value })
    } else {
      // правка порядка грейда = правка веса: предупреждение до сохранения
      if (isGrades.value && order !== null && order !== form.order) {
        const ok = await confirmDialog.ask({
          header: 'Изменить вес грейда?',
          message: `Порядок грейда «${form.value}»: ${form.order} → ${order}. Вес грейда участвует `
            + 'в расчётах калибровки и норм — числа на живых данных изменятся.',
          okLabel: 'Изменить вес',
          danger: true,
        })
        if (ok === null) { busy.value = false; return }
      }
      await dictionariesApi.patchItem(selectedSlug.value, form.id, {
        title: form.title.trim() || form.value,
        ...(order !== null ? { order_no: order } : {}),
      })
      toast.add({ severity: 'success', summary: `Сохранено: ${form.value}`, life: 4000 })
      trackAction('dictionaries', { action: 'patch-item', dictionary: selectedSlug.value })
    }
    itemDialogVisible.value = false
    await loadItems()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не сохранено', detail: errMsg(e), life: 10000 })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.schemas-toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 12px; }
.toolbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.muted { color: #64748b; }
.small { font-size: 0.82rem; }
.dict-picker { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
.dict-types { min-width: 140px; }
.diff-sheet { margin-bottom: 10px; }
.type-form { display: flex; flex-direction: column; gap: 10px; }
.type-form label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; }
</style>
