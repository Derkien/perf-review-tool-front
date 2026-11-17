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

    <div class="filters">
      <Select v-model="statusFilter" :options="statusOptions" option-label="label"
              option-value="value" placeholder="статус" size="small"
              data-testid="coverage-status-filter" />
      <Select v-model="typeFilter" :options="typeOptions" placeholder="тип" size="small"
              data-testid="coverage-type-filter" />
      <IconField icon-position="left">
        <InputIcon class="pi pi-search" />
        <InputText v-model="search" size="small" placeholder="поиск по роли"
                   data-testid="coverage-search" />
      </IconField>
      <span class="muted small">строк: {{ filtered.length }}</span>
    </div>

    <!-- масс-действия: панель по паттерну MassActionBar, кнопки применимы к составу выборки -->
    <div v-if="selected.size" class="mass-bar" role="toolbar" data-testid="coverage-mass-bar">
      <span>выбрано: <b>{{ selected.size }}</b></span>
      <Button label="Выгрузить для разметки" icon="pi pi-download" size="small" text
              data-testid="coverage-export-btn" @click="exportSelected" />
      <Button v-if="canExclude" label="Исключить из квалификации" icon="pi pi-ban"
              size="small" severity="danger" text data-testid="coverage-exclude-btn"
              @click="excludeSelected" />
      <Button v-if="canInclude" label="Вернуть в квалификацию" icon="pi pi-undo"
              size="small" severity="secondary" text data-testid="coverage-include-btn"
              @click="includeSelected" />
      <Button label="Снять выбор" size="small" text @click="selection = []" />
    </div>

    <DataTable :value="filtered" v-model:selection="selection" data-key="key" size="small"
               data-testid="coverage-table" style="max-width: 1080px">
      <Column selection-mode="multiple" />
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
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { competenciesApi, trackAction } from '../api/endpoints'
import type { SchemasCoverageRow } from '../api/endpoints'
import { useAppConfirm } from '../composables/useAppConfirm'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const confirmDialog = useAppConfirm()

const rows = ref<SchemasCoverageRow[]>([])
const selection = ref<(SchemasCoverageRow & { key: string })[]>([])
const statusFilter = ref<string | null>(null)
const typeFilter = ref<string | null>(null)
const search = ref('')

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
    && (!typeFilter.value || r.type_code === typeFilter.value)
    && (!q || r.specialty.toLowerCase().includes(q)))
})
const selected = computed(() => new Set(selection.value.map((r) => r.key)))
const selectedPairs = computed(() => selection.value.map((r) => r.key))
const canExclude = computed(() => selection.value.some((r) => !r.excluded))
const canInclude = computed(() => selection.value.some((r) => r.excluded))

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
  const names = selection.value.map((r) => `${r.type_code}: ${r.specialty}`)
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

async function excludeSelected() {
  if (!(await confirmPairs('Исключить из квалификации?', 'Кого'))) return
  await competenciesApi.coverageExclude(
    selection.value.filter((r) => !r.excluded).map((r) => r.key))
  toast.add({ severity: 'success', summary: 'Исключено из квалификации', life: 4000 })
  selection.value = []
  await load()
}

async function includeSelected() {
  if (!(await confirmPairs('Вернуть в квалификацию?', 'Кого'))) return
  await competenciesApi.coverageInclude(
    selection.value.filter((r) => r.excluded).map((r) => r.key))
  toast.add({ severity: 'success', summary: 'Возвращено в квалификацию', life: 4000 })
  selection.value = []
  await load()
}
</script>

<style scoped>
.toolbar { margin-bottom: 10px; }
.filters { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.muted { color: #64748b; }
.mass-bar { display: flex; gap: 8px; align-items: center; padding: 8px 10px; margin-bottom: 10px;
            border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; flex-wrap: wrap; }
.small { font-size: 0.82rem; }
</style>
