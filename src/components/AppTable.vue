<template>
  <div class="app-table" :data-testid="tableTestid">
    <!-- фильтры: единая строка над таблицей; счётчик N из M — всегда -->
    <div v-if="$slots.filters" class="app-table-filters">
      <slot name="filters" />
      <span class="app-table-count muted small">строк: {{ value.length }}</span>
    </div>

    <DataTable ref="dt" v-bind="$attrs" :value="value"
               :data-key="($attrs['data-key'] as string) || rowKey" :loading="loading"
               :paginator="value.length > rows" :rows="rows"
               :rows-per-page-options="[20, 50, 100]"
               paginator-template="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink RowsPerPageDropdown"
               :current-page-report-template="'{first}–{last} из {totalRecords}'">
      <!-- выбор по ключам: переживает фильтр/страницу (события DataTable-селекции
           unreliable при смене :value — инцидент 17.11, см. docs/standards/02-TABLES) -->
      <Column v-if="selectedKeys" :style="{ width: '3rem' }">
        <template #header>
          <Checkbox :model-value="allChecked" binary
                    :indeterminate="someChecked && !allChecked"
                    :data-testid="`${tableTestid}-check-all`"
                    @update:model-value="(v: boolean) => $emit('toggle-all', v)" />
        </template>
        <template #body="{ data: row }">
          <Checkbox :model-value="selectedKeys.has(String(row[rowKey]))" binary
                    :data-testid="`${tableTestid}-check-${keyOf(row)}`"
                    @update:model-value="$emit('toggle-key', keyOf(row))" />
        </template>
      </Column>
      <slot />
      <template v-if="$slots.expansion" #expansion="scope">
        <slot name="expansion" v-bind="scope" />
      </template>
      <template v-if="$slots.groupheader" #groupheader="scope">
        <slot name="groupheader" v-bind="scope" />
      </template>

    </DataTable>

    <div v-if="!value.length && !loading" class="app-table-empty muted small"
         :data-testid="`${tableTestid}-empty`">
      {{ emptyText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Checkbox from 'primevue/checkbox'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'

/**
 * Единственный системный компонент таблиц (docs/standards/02-TABLES.md).
 * Внутри — готовый PrimeVue DataTable; обёртка фиксирует поведение системы:
 * авто-пагинация (>rows — показ, ≤rows — скрыта), выбор по ключам ( переживает
 * фильтр/страницу), строка фильтров со счётчиком, пустое состояние, loading.
 * Колонки передаются слотом; прочие пропсы DataTable — через v-bind="$attrs".
 */
const props = withDefaults(defineProps<{
  value: object[]
  rowKey?: string
  rows?: number
  loading?: boolean
  emptyText?: string
  /** Set ключей выбранных строк; отсутствие пропа = без колонки выбора */
  selectedKeys?: Set<string> | null
  tableTestid?: string
}>(), {
  rowKey: 'id', rows: 20, loading: false,
  emptyText: 'Нет данных', selectedKeys: null, tableTestid: 'app-table',
})

defineEmits<{ (e: 'toggle-key', key: string): void; (e: 'toggle-all', checked: boolean): void }>()
defineOptions({ inheritAttrs: false })

const keys = computed(() =>
  new Set(props.value.map((r) => String((r as Record<string, unknown>)[props.rowKey]))))
const allChecked = computed(() =>
  props.value.length > 0 && [...keys.value].every((k) => props.selectedKeys?.has(k)))
function keyOf(row: object): string {
  return String((row as Record<string, unknown>)[props.rowKey])
}

const someChecked = computed(() =>
  [...keys.value].some((k) => props.selectedKeys?.has(k)) && !allChecked.value)
</script>

<style scoped>
.app-table-filters { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.app-table-count { margin-left: auto; white-space: nowrap; }
.app-table-empty { padding: 18px 4px; text-align: left; }
.muted { color: #64748b; }
.small { font-size: 0.82rem; }
</style>
