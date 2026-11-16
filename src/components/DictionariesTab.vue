<template>
  <div data-testid="dictionaries">
    <div class="schemas-toolbar">
      <div v-if="!selected">
        <h2 style="margin:0 0 4px">Справочники</h2>
        <p class="muted small" style="margin:0">
          Управление списками значений: грейды (порядок = вес — влияет на расчёты
          калибровки и норм), категории и пункты компетенций, любые новые справочники.
          Валидация шаблона схем идёт по ним. Наполнение — двумя путями одного формата:
          руками здесь или файлом (импорт добавляет новое и создаёт новые справочники;
          существующее не удаляется и не переименовывается).
        </p>
      </div>
      <div v-else>
        <Button label="← Справочники" text size="small" data-testid="dict-back"
                @click="closeDict" />
        <h2 style="margin:2px 0 4px">{{ selected.title }} <Tag class="dict-code-tag" v-if="selected.code_managed" severity="secondary" value="в коде" v-tooltip.top="'Справочник зарегистрирован в коде константой: слаг изменить нельзя'" /></h2>
        <p class="muted small" style="margin:0">
          <code>{{ selected.slug }}</code><span v-if="selected.description"> — {{ selected.description }}</span>
        </p>
      </div>
      <div class="toolbar-actions">
        <template v-if="!selected">
          <Button label="Выгрузить справочники" icon="pi pi-download" size="small" severity="secondary"
                  :loading="busy" data-testid="dict-export-btn" @click="downloadExport()" />
        </template>
        <template v-else>
          <Button label="Выгрузить справочник" icon="pi pi-download" size="small" severity="secondary"
                  :loading="busy" data-testid="dict-export-one-btn" @click="downloadExport(selected ? selected.slug : undefined)" />
          <Button label="Добавить значение" icon="pi pi-plus" size="small" data-testid="dict-item-create-btn"
                  @click="openCreate" />
        </template>
        <FileUpload mode="basic" custom-upload choose-label="Выбрать файл справочников"
                    :accept="'.xlsx'" @select="onFileSelected" />
        <Button label="Импортировать справочники" icon="pi pi-upload" size="small"
                :disabled="!file" :loading="busy" data-testid="dict-import-btn" @click="previewImport" />
        <Button v-if="!selected" label="Новый справочник" icon="pi pi-plus" size="small"
                severity="secondary" data-testid="dict-create-btn" @click="openDictCreate" />
      </div>
    </div>

    <!-- поиск: по справочникам (название/слаг) + глобально по значениям всех справочников;
         внутри справочника — по значениям этого справочника -->
    <div class="dict-search">
      <IconField icon-position="left">
        <InputIcon class="pi pi-search" />
        <InputText v-model="search" size="small" data-testid="dict-search-input"
                   :placeholder="selected ? 'Поиск значений (значение / слаг / тайтл)' : 'Поиск по справочникам и всем значениям (название / слаг)'" />
      </IconField>
      <span v-if="globalMatches.length && !selected" class="muted small">
        Найдено значений во всех справочниках: {{ globalMatches.length }}
      </span>
    </div>

    <!-- список справочников -->
    <template v-if="!selected">
      <DataTable :value="filteredDictionaries" size="small" data-testid="dict-list-table"
                 :row-click="true" style="max-width: 860px" @row-click="openDict">
        <Column field="slug" header="Слаг">
          <template #body="{ data: d }"><code>{{ d.slug }}</code></template>
        </Column>
        <Column field="title" header="Название" />
        <Column field="items_count" header="Значений" />
        <Column header="">
          <template #body="{ data: d }">
            <Tag v-if="d.code_managed" severity="secondary" value="в коде"
                 v-tooltip.top="'Слаг справочника и слаги значений используются системой — изменение недоступно'" />
          </template>
        </Column>
        <Column header="Действия">
          <template #body="{ data: d }">
            <Button label="Значения" text size="small" :data-testid="`dict-open-${d.slug}`"
                    @click.stop="openDict({ data: d })" />
            <Button label="Править" text size="small" :data-testid="`dict-edit-${d.slug}`"
                    @click.stop="openDictEdit(d)" />
          </template>
        </Column>
      </DataTable>

      <!-- глобальный поиск по значениям всех справочников -->
      <template v-if="search.trim() && globalMatches.length">
        <h4 style="margin:16px 0 4px">Значения всех справочников</h4>
        <DataTable :value="globalMatches" size="small" data-testid="dict-global-results"
                   style="max-width: 860px">
          <Column field="value" header="Значение">
            <template #body="{ data: it }"><b>{{ it.value }}</b></template>
          </Column>
          <Column field="slug" header="Слаг">
            <template #body="{ data: it }"><code>{{ it.slug }}</code></template>
          </Column>
          <Column field="dictTitle" header="Справочник" />
          <Column header="Действия">
            <template #body="{ data: it }">
              <Button label="К справочнику" text size="small"
                      :data-testid="`dict-goto-${it.slug}`" @click.stop="gotoDict(it.dictSlug)" />
            </template>
          </Column>
        </DataTable>
      </template>
      <p class="muted small">
        Справочники только растут: переименование значения и удаление недоступны — история
        версий схем и разметки ссылается на строки. Слаги могут использоваться в коде:
        смена слага — только после консультации с разработчиком.
      </p>
    </template>

    <!-- значения выбранного справочника -->
    <template v-else>
      <DataTable :value="filteredItems" size="small" data-testid="dict-items-table" style="max-width: 960px">
        <Column field="slug" header="Слаг">
          <template #body="{ data: it }"><code>{{ it.slug }}</code></template>
        </Column>
        <Column field="value" header="Значение">
          <template #body="{ data: it }"><b>{{ it.value }}</b></template>
        </Column>
        <Column v-if="selected.has_categories" field="category" header="Категория">
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
    </template>

    <!-- модалка импорта справочников (апсерт: новые справочники + добавления/правки) -->
    <Dialog v-model:visible="diffVisible" modal header="Импорт справочников — предпросмотр"
            style="width: 720px">
      <Message v-if="diff && diff.no_changes" severity="info" :sticky="true">
        Без изменений: значения и порядок совпадают с текущими справочниками.
      </Message>
      <template v-if="diff && !diff.no_changes">
        <div v-for="(sheet, slug) in diff.sheets" :key="slug" class="diff-sheet">
          <h4 style="margin:8px 0 4px">
            <template v-if="sheet.new">
              <i class="pi pi-plus-circle" style="font-size:.8em" /> НОВЫЙ справочник
              <code>{{ slug }}</code> — будет создан целиком ({{ sheet.added.length }} знач.)
            </template>
            <template v-else>{{ dictTitle(slug as string) }}</template>
          </h4>
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
        <Button label="Применить импорт" :disabled="!diff || diff.no_changes" :loading="busy"
                data-testid="dict-diff-apply" @click="applyImport" />
      </template>
    </Dialog>

    <!-- блокирующие ошибки импорта: персистентный список + файл ошибок (приёмка 12.11) -->
    <ImportErrorsDialog v-model:visible="importErrorsVisible"
                        :message="importErrors?.message || ''"
                        :errors="importErrors?.errors || []" />

    <!-- модалка справочника (создание/правка) -->
    <Dialog v-model:visible="dictDialogVisible" modal
            :header="dictIsNew ? 'Новый справочник' : 'Правка справочника'" style="width: 520px">
      <div class="type-form">
        <label v-if="dictIsNew">Слаг
          <InputText v-model="dictForm.slug" placeholder="пусто — сгенерируем из названия"
                     data-testid="dict-slug-input" />
          <span class="muted small">
            Латиница/цифры/дефис, до 32 символов; по нему листы выгрузки. Можно оставить
            пустым — сгенерируем транслитерацией названия.
          </span>
        </label>
        <label v-else>Слаг
          <InputText v-model="dictForm.slug" :disabled="dictForm.codeManaged"
                     data-testid="dict-slug-input" />
          <span v-if="dictForm.codeManaged" class="muted small">
            Используется системой (константа в коде) — изменение недоступно.
          </span>
          <span v-else-if="dictForm.slug !== dictForm.origSlug" class="muted small warn-text">
            Слаг может использоваться в коде: смена может сломать систему — обратитесь к разработчику.
          </span>
        </label>
        <label>Название
          <InputText v-model="dictForm.title" data-testid="dict-title-input" />
        </label>
        <label>Описание
          <InputText v-model="dictForm.description" data-testid="dict-desc-input" />
        </label>
      </div>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="dictDialogVisible = false" />
        <Button :label="dictIsNew ? 'Создать' : 'Сохранить'" :loading="busy"
                data-testid="dict-dict-submit" @click="saveDict" />
      </template>
    </Dialog>

    <!-- модалка добавления/правки значения -->
    <Dialog v-model:visible="itemDialogVisible" modal :header="itemIsNew ? 'Новое значение' : 'Правка значения'"
            style="width: 520px">
      <div class="type-form">
        <label v-if="itemIsNew">Значение (неизменяемо после создания)
          <InputText v-model="itemForm.value" data-testid="dict-item-value-input" />
        </label>
        <label v-else>Значение
          <InputText :model-value="itemForm.value" disabled />
        </label>
        <label>Слаг
          <InputText v-model="itemForm.slug" :disabled="isCodeManaged"
                     data-testid="dict-item-slug-input" />
          <span v-if="itemIsNew" class="muted small">
            Пусто — сгенерируется автоматически (транслитерация значения).
          </span>
          <span v-else-if="isCodeManaged" class="muted small">
            Используется системой (константа в коде) — изменение недоступно.
          </span>
          <span v-else-if="itemForm.slug !== itemForm.origSlug" class="muted small warn-text">
            Слаг может использоваться в коде: смена может сломать систему — обратитесь к разработчику.
          </span>
        </label>
        <label>Тайтл
          <InputText v-model="itemForm.title" data-testid="dict-item-title-input" />
        </label>
        <label>Порядок
          <InputText v-model="itemOrderStr" type="number" data-testid="dict-item-order-input" />
        </label>
        <label v-if="hasCategories">Категория{{ itemIsNew && isItemDict ? ' (обязательна для пунктов)' : '' }}
          <Select v-model="itemForm.category" :options="categoryOptions" size="small"
                  data-testid="dict-item-category-input" />
          <span class="muted small">
            Значение родительского справочника «{{ parentTitle }}»; вложенность — один уровень.
          </span>
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
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import FileUpload from 'primevue/fileupload'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { dictionariesApi, trackAction } from '../api/endpoints'
import ImportErrorsDialog from './ImportErrorsDialog.vue'
import type { ImportErrorRow } from './ImportErrorsDialog.vue'
import type { DictionaryItemRow, DictionaryRow, DictDiffSheet } from '../api/endpoints'
import { useAppConfirm } from '../composables/useAppConfirm'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const confirmDialog = useAppConfirm()

const dictionaries = ref<DictionaryRow[]>([])
const selectedSlug = ref('')
const items = ref<DictionaryItemRow[]>([])
const busy = ref(false)
const file = ref<File | null>(null)
const search = ref('')
const diff = ref<{ sheets: Record<string, DictDiffSheet>; no_changes: boolean } | null>(null)
const diffVisible = ref(false)
/** ленивый кэш значений всех справочников для глобального поиска */
const globalItems = ref<(DictionaryItemRow & { dictSlug: string; dictTitle: string })[]>([])
const globalLoaded = ref(false)

const dictDialogVisible = ref(false)
const dictIsNew = ref(true)
const dictForm = ref({ slug: '', title: '', description: '', origSlug: '', codeManaged: false })

const itemDialogVisible = ref(false)
const itemIsNew = ref(true)
const itemForm = ref<{ id: number; value: string; slug: string; origSlug: string; title: string; order: number | null; category: string }>(
  { id: 0, value: '', slug: '', origSlug: '', title: '', order: null, category: '' })
const itemOrderStr = ref('')

const selected = computed(() => dictionaries.value.find((d) => d.slug === selectedSlug.value) || null)
const isGrades = computed(() => selectedSlug.value === 'grade')
const isItemDict = computed(() => selectedSlug.value === 'competency-item')
const isCodeManaged = computed(() => selected.value?.code_managed ?? false)
const hasCategories = computed(() => selected.value?.has_categories ?? false)
const parentSlug = computed(() => selected.value?.parent_slug || '')
const parentTitle = computed(() =>
  dictionaries.value.find((d) => d.slug === parentSlug.value)?.title || parentSlug.value)
const categoryValues = ref<string[]>([])
const categoryOptions = computed(() =>
  hasCategories.value ? categoryValues.value : [])

const filteredDictionaries = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return dictionaries.value
  return dictionaries.value.filter((d) =>
    d.title.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q))
})

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((it) =>
    it.value.toLowerCase().includes(q) || it.slug.toLowerCase().includes(q)
    || it.title.toLowerCase().includes(q))
})

/** Глобальный поиск по значениям всех справочников (в режиме списка справочников). */
const globalMatches = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q || !globalLoaded.value) return []
  return globalItems.value.filter((it) =>
    it.value.toLowerCase().includes(q) || it.slug.toLowerCase().includes(q)
    || it.title.toLowerCase().includes(q)).slice(0, 50)
})

function dictTitle(slug: string): string {
  return dictionaries.value.find((d) => d.slug === slug)?.title || slug
}

onMounted(load)

async function load() {
  try {
    dictionaries.value = await dictionariesApi.list()
  } catch (e) {
  }
}

async function loadGlobalItems() {
  if (globalLoaded.value) return
  const all = await Promise.all(dictionaries.value.map(async (d) => {
    try {
      const rows = await dictionariesApi.items(d.slug)
      return rows.map((r) => ({ ...r, dictSlug: d.slug, dictTitle: d.title }))
    } catch { return [] }
  }))
  globalItems.value = all.flat()
  globalLoaded.value = true
}

// глобальный поиск лениво тянет значения всех справочников (один раз)
watch(search, (v) => { if (v.trim()) void loadGlobalItems() })

function openDict(ev: { data: DictionaryRow }) {
  selectedSlug.value = ev.data.slug
  search.value = ''
  void loadItems()
}

async function gotoDict(slug: string) {
  const d = dictionaries.value.find((x) => x.slug === slug)
  if (d) openDict({ data: d })
}

function closeDict() {
  selectedSlug.value = ''
  items.value = []
}

async function loadItems() {
  if (!selectedSlug.value) return
  try {
    items.value = await dictionariesApi.items(selectedSlug.value)
    if (parentSlug.value) {
      categoryValues.value = await dictionariesApi.items(parentSlug.value)
        .then((rows) => rows.map((r) => r.value))
    }
  } catch (e) {
  }
}

async function downloadExport(slug?: string) {
  busy.value = true
  try {
    const blob = await dictionariesApi.export(slug)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = slug ? `dictionary-${slug}.xlsx` : 'dictionaries.xlsx'
    a.click()
    URL.revokeObjectURL(url)
    trackAction('dictionaries', { action: 'export', slug: slug || 'all' })
  } catch (e) {
  } finally {
    busy.value = false
  }
}

function onFileSelected(ev: { files: File[] }) {
  file.value = ev.files?.[0] || null
}

/** Блокирующие ошибки импорта справочников — персистентная модалка (приёмка 12.11):
 *  структурный detail {message, errors[]} таблицей + файл ошибок; строчный — текстом. */
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
}

async function previewImport() {
  if (!file.value) return
  busy.value = true
  try {
    diff.value = await dictionariesApi.importPreview(file.value)
    diffVisible.value = true
  } catch (e) {
    showImportErrors(e, 'Файл не принят')
  } finally {
    busy.value = false
  }
}

async function applyImport() {
  if (!file.value || !diff.value) return
  busy.value = true
  try {
    const res = await dictionariesApi.importApply(file.value)
    toast.add({ severity: 'success',
                summary: `Справочники обновлены: создано ${res.created || 0}, `
                          + `добавлено ${res.added}, правок ${res.edited}`, life: 5000 })
    diffVisible.value = false
    file.value = null
    globalLoaded.value = false
    await load()
    await loadItems()
  } catch (e) {
    showImportErrors(e, 'Не применено')
  } finally {
    busy.value = false
  }
}

function openDictCreate() {
  dictIsNew.value = true
  dictForm.value = { slug: '', title: '', description: '', origSlug: '', codeManaged: false }
  dictDialogVisible.value = true
}

function openDictEdit(d: DictionaryRow) {
  dictIsNew.value = false
  dictForm.value = { slug: d.slug, title: d.title, description: d.description || '',
                     origSlug: d.slug, codeManaged: d.code_managed }
  dictDialogVisible.value = true
}

async function saveDict() {
  const form = dictForm.value
  busy.value = true
  try {
    if (dictIsNew.value) {
      await dictionariesApi.createDictionary({
        slug: form.slug.trim(), title: form.title.trim(), description: form.description.trim(),
      })
      toast.add({ severity: 'success', summary: `Справочник создан: ${form.title}`, life: 4000 })
      trackAction('dictionaries', { action: 'create-dictionary', slug: form.slug })
    } else {
      const slugChanged = form.slug.trim() !== form.origSlug && !form.codeManaged
      if (slugChanged) {
        const ok = await confirmDialog.ask({
          header: 'Изменить слаг справочника?',
          message: `Слаг «${form.origSlug}» → «${form.slug.trim()}». Слаг может использоваться `
            + 'в коде системы — смена может её сломать. За изменением нужно обратиться '
            + 'к разработчику.',
          okLabel: 'Изменить слаг',
          danger: true,
        })
        if (ok === null) { busy.value = false; return }
      }
      await dictionariesApi.patchDictionary(form.origSlug, {
        title: form.title.trim(),
        description: form.description,
        ...(slugChanged ? { slug: form.slug.trim() } : {}),
      })
      toast.add({ severity: 'success', summary: `Справочник сохранён: ${form.title}`, life: 4000 })
      trackAction('dictionaries', { action: 'patch-dictionary', slug: form.origSlug })
    }
    dictDialogVisible.value = false
    globalLoaded.value = false
    await load()
    if (selectedSlug.value) await loadItems()
  } catch (e) {
  } finally {
    busy.value = false
  }
}

function openCreate() {
  itemIsNew.value = true
  itemForm.value = { id: 0, value: '', slug: '', origSlug: '', title: '', order: null, category: '' }
  itemOrderStr.value = ''
  itemDialogVisible.value = true
}

function openEdit(it: DictionaryItemRow) {
  itemIsNew.value = false
  itemForm.value = { id: it.id, value: it.value, slug: it.slug, origSlug: it.slug,
                     title: it.title, order: it.order_no, category: it.category }
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
        category: hasCategories.value ? form.category : '',
        slug: form.slug.trim(),
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
      const slugChanged = !isCodeManaged.value && form.slug.trim() !== form.origSlug
      if (slugChanged) {
        const ok = await confirmDialog.ask({
          header: 'Изменить слаг значения?',
          message: `Слаг «${form.origSlug}» → «${form.slug.trim()}» у значения «${form.value}». `
            + 'Слаг может использоваться в коде системы — смена может её сломать. '
            + 'За изменением нужно обратиться к разработчику.',
          okLabel: 'Изменить слаг',
          danger: true,
        })
        if (ok === null) { busy.value = false; return }
      }
      await dictionariesApi.patchItem(selectedSlug.value, form.id, {
        title: form.title.trim() || form.value,
        ...(order !== null ? { order_no: order } : {}),
        ...(slugChanged ? { slug: form.slug.trim() } : {}),
        ...(hasCategories.value ? { category: form.category } : {}),
      })
      toast.add({ severity: 'success', summary: `Сохранено: ${form.value}`, life: 4000 })
      trackAction('dictionaries', { action: 'patch-item', dictionary: selectedSlug.value })
    }
    itemDialogVisible.value = false
    globalLoaded.value = false
    await loadItems()
  } catch (e) {
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
.warn-text { color: #b45309; }
.dict-search { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
.dict-code-tag { margin-left: 6px; }
.diff-sheet { margin-bottom: 10px; }
.type-form { display: flex; flex-direction: column; gap: 10px; }
.type-form label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; }
</style>
