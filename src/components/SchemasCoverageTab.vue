<template>
  <div data-testid="schemas-coverage">
    <div class="toolbar">
      <div>
        <h2 style="margin:0 0 4px">Покрытие схем</h2>
        <p class="muted small" style="margin:0">
          Полная картина: у какой роли какая схема (активная версия, черновик, нет схемы,
          исключена из квалификации). Выбери строки и выгрузи файл разметки — пары без
          схемы уйдут заготовками с проставленными ролью и типом, существующие — своими
          версиями; дозаполни и загрузи штатным импортом.
        </p>
      </div>
    </div>

    <!-- единый фреймворк таблиц: фильтры очищаются точкой в селекте (= «все»)
         и кнопкой полного сброса; число активных фильтров видно -->

    <!-- единый фреймворк таблиц: масс-действия — MassActionBar (попап внизу) -->
    <MassActionBar :count="selected.size" @clear="clearSelection">
      <span v-if="hiddenSelected > 0" class="mass-note">в т.ч. скрыто фильтром: {{ hiddenSelected }}</span>
      <Button label="Выгрузить для разметки" icon="pi pi-download" size="small"
              text data-testid="coverage-export-btn" @click="exportSelected" />
      <Button v-if="canExclude" label="Исключить из квалификации" icon="pi pi-ban"
              size="small" severity="danger" text data-testid="coverage-exclude-btn"
              @click="excludeSelected" />
      <Button v-if="canInclude" label="Вернуть в квалификацию" icon="pi pi-undo"
              size="small" severity="secondary" text data-testid="coverage-include-btn"
              @click="includeSelected" />
    </MassActionBar>

    <!-- системный компонент таблиц: авто-пагинация (>20), выбор по ключам
         (переживает фильтр/страницу — AppTable), счётчик строк -->
    <AppTable :value="filtered" row-key="key" :selected-keys="selectedKeys"
              data-testid="coverage-table" style="max-width: 1080px"
              table-testid="coverage" size="small"
              @toggle-key="toggleKey" @toggle-all="toggleAllVisible">
      <template #filters>
        <Select v-model="statusFilter" :options="statusOptions" option-label="label"
                option-value="value" placeholder="все статусы" show-clear size="small"
                data-testid="coverage-status-filter" />
        <MultiSelect v-model="typeFilter" :options="typeOptions" placeholder="все типы"
                     show-clear :max-selected-labels="2" size="small"
                     data-testid="coverage-type-filter" class="coverage-type-ms" />
        <IconField icon-position="left">
          <InputIcon class="pi pi-search" />
          <InputText v-model="search" size="small" placeholder="поиск по роли"
                     data-testid="coverage-search" />
        </IconField>
        <Button v-if="hasFilters" label="Сбросить фильтры" icon="pi pi-filter-slash"
                size="small" text severity="secondary" data-testid="coverage-reset-filters"
                @click="statusFilter = null; typeFilter = []; search = ''" />
      </template>
      <Column header="Тип">
        <template #body="{ data: r }">
          <Tag :value="r.type_code"
               :severity="r.type_code === 'hard' ? 'warn' : r.type_code === 'soft' ? 'info' : 'secondary'" />
        </template>
      </Column>
      <Column field="specialty" header="Роль" />
      <Column header="Статус">
        <template #body="{ data: r }">
          <Tag :value="statusLabel(r.status)" :severity="statusSeverity(r.status)"
               :data-testid="`coverage-status-${r.type_code}-${r.specialty}`" />
        </template>
      </Column>
      <Column header="Активная">
        <template #body="{ data: r }">
          <template v-if="r.active_version">v{{ r.active_version }}</template>
          <span v-else class="muted small">—</span>
        </template>
      </Column>
      <Column field="versions_count" header="Версий" />
      <Column header="Пунктов">
        <template #body="{ data: r }">{{ r.items_count || '—' }}</template>
      </Column>
      <Column header="Обновлена">
        <template #body="{ data: r }">{{ formatDate(r.updated_at) }}</template>
      </Column>
      <Column header="Действия">
        <template #body="{ data: r }">
          <Button label="Выгрузить" text size="small"
                  :data-testid="`coverage-row-export-${r.key}`" @click="exportOne(r.key)" />
          <Button v-if="!r.excluded" label="Исключить" text size="small" severity="danger"
                  :data-testid="`coverage-row-exclude-${r.key}`" @click="excludeOne(r)" />
          <Button v-else label="Вернуть" text size="small" severity="secondary"
                  :data-testid="`coverage-row-include-${r.key}`" @click="includeOne(r)" />
        </template>
      </Column>
    </AppTable>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import AppTable from './AppTable.vue'
import Column from 'primevue/column'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { competenciesApi, trackAction } from '../api/endpoints'
import type { SchemasCoverageRow } from '../api/endpoints'
import { useAppConfirm } from '../composables/useAppConfirm'
import { useToast } from 'primevue/usetoast'
import MassActionBar from './MassActionBar.vue'

const toast = useToast()
const confirmDialog = useAppConfirm()

const rows = ref<SchemasCoverageRow[]>([])
const statusFilter = ref<string | null>(null)
const typeFilter = ref<string[]>([])
const search = ref('')
/** Выбор живёт по ключам пар: переживает смену фильтра/страницы (PrimeVue
 *  DataTable выкидывает из v-model строки вне текущего :value — инцидент 17.11:
 *  выбор тихо терялся, выгрузка уходила усечённой). */
const selectedKeys = ref<Set<string>>(new Set())

const withKeys = computed(() =>
  rows.value.map((r) => ({ ...r, key: `${r.type_code}:${r.specialty}` })))
const statusOptions = [
  { label: 'активна', value: 'active' },
  { label: 'черновик', value: 'draft' },
  { label: 'нет схемы', value: 'missing' },
  { label: 'исключена', value: 'excluded' },
]
const typeOptions = computed(() => [...new Set(rows.value.map((r) => r.type_code))])

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return withKeys.value.filter((r) =>
    (!statusFilter.value || r.status === statusFilter.value)
    && (!typeFilter.value.length || typeFilter.value.includes(r.type_code))
    && (!q || r.specialty.toLowerCase().includes(q)))
})
const selected = computed(() => selectedKeys.value)
const selectedPairs = computed(() => [...selectedKeys.value])
const selectedRows = computed(() =>
  withKeys.value.filter((r) => selectedKeys.value.has(r.key)))
const visibleChecked = computed(() =>
  filtered.value.filter((r) => selectedKeys.value.has(r.key)))
const hiddenSelected = computed(() =>
  selectedRows.value.length - visibleChecked.value.length)
const canExclude = computed(() => selectedRows.value.some((r) => !r.excluded))
const canInclude = computed(() => selectedRows.value.some((r) => r.excluded))

const allVisibleChecked = computed(() =>
  filtered.value.length > 0 && filtered.value.every((r) => selectedKeys.value.has(r.key)))
function toggleKey(key: string) {
  const next = new Set(selectedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedKeys.value = next
}
function toggleAllVisible(checked: boolean) {
  const next = new Set(selectedKeys.value)
  for (const r of filtered.value) {
    if (checked) next.add(r.key)
    else next.delete(r.key)
  }
  selectedKeys.value = next
}
function selectKey(key: string) { toggleKey(key) }
function clearSelection() {
  selectedKeys.value = new Set()
}
const hasFilters = computed(() =>
  statusFilter.value !== null || typeFilter.value.length > 0 || search.value.trim() !== '')

function statusLabel(s: string): string {
  return ({ active: 'активна', draft: 'черновик', missing: 'нет схемы',
            excluded: 'исключена' } as const)[s] || s
}
function statusSeverity(s: string): 'success' | 'warn' | 'secondary' | 'danger' {
  return ({ active: 'success', draft: 'warn', missing: 'secondary',
            excluded: 'danger' } as const)[s] || 'secondary'
}
function formatDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—'
}

async function load() {
  rows.value = await competenciesApi.schemasCoverage()
}

onMounted(load)

async function exportSelected() {
  const blob = await competenciesApi.coverageExport(selectedPairs.value)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'schemas-coverage.xlsx'
  a.click()
  URL.revokeObjectURL(url)
  trackAction('admin.schemas-coverage', { action: 'export', pairs: selectedPairs.value.length })
}

/** Подтверждение с объектом действия: пары до 5 имён, дальше счётчик. */
async function confirmPairs(header: string, actionLabel: string): Promise<boolean> {
  const names = selectedRows.value.map((r) => `${r.type_code}: ${r.specialty}`)
  const list = names.slice(0, 5).join(', ') + (names.length > 5 ? ` … (всего ${names.length})` : '')
  const ok = await confirmDialog.ask({
    header,
    message: `${actionLabel}: ${list}. ${header.includes('Исключить')
      ? 'Пары перестанут требоваться в заданиях разметки; схемы и история сохранятся.'
      : 'Пары снова будут требоваться в заданиях разметки.'}`,
    okLabel: header.includes('Исключить') ? 'Исключить' : 'Вернуть',
    danger: header.includes('Исключить'),
  })
  return ok !== null
}

async function excludeOne(r: SchemasCoverageRow & { key: string }) {
  const ok = await confirmDialog.ask({
    header: 'Исключить из квалификации?',
    message: `Кого: ${r.type_code}: ${r.specialty}. Пара перестанет требоваться `
      + 'в заданиях разметки; схема и история сохранятся.',
    okLabel: 'Исключить', danger: true,
  })
  if (ok === null) return
  await competenciesApi.coverageExclude([r.key])
  toast.add({ severity: 'success', summary: 'Исключено из квалификации', life: 4000 })
  await load()
}
async function includeOne(r: SchemasCoverageRow & { key: string }) {
  const ok = await confirmDialog.ask({
    header: 'Вернуть в квалификацию?',
    message: `Кого: ${r.type_code}: ${r.specialty}. Пара снова будет требоваться `
      + 'в заданиях разметки.',
    okLabel: 'Вернуть',
  })
  if (ok === null) return
  await competenciesApi.coverageInclude([r.key])
  toast.add({ severity: 'success', summary: 'Возвращено в квалификацию', life: 4000 })
  await load()
}
async function exportOne(key: string) {
  const blob = await competenciesApi.coverageExport([key])
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'schemas-coverage.xlsx'
  a.click()
  URL.revokeObjectURL(url)
  trackAction('admin.schemas-coverage', { action: 'export', pairs: 1 })
}

async function excludeSelected() {
  if (!(await confirmPairs('Исключить из квалификации?', 'Кого'))) return
  await competenciesApi.coverageExclude(
    selectedRows.value.filter((r) => !r.excluded).map((r) => r.key))
  toast.add({ severity: 'success', summary: 'Исключено из квалификации', life: 4000 })
  clearSelection()
  await load()
}

async function includeSelected() {
  if (!(await confirmPairs('Вернуть в квалификацию?', 'Кого'))) return
  await competenciesApi.coverageInclude(
    selectedRows.value.filter((r) => r.excluded).map((r) => r.key))
  toast.add({ severity: 'success', summary: 'Возвращено в квалификацию', life: 4000 })
  clearSelection()
  await load()
}
</script>

<style scoped>
.toolbar { margin-bottom: 10px; }
.muted { color: #64748b; }
.mass-note { font-size: 0.8rem; opacity: 0.85; margin-right: 4px; }
.coverage-type-ms { min-width: 140px; }
.small { font-size: 0.82rem; }
</style>
