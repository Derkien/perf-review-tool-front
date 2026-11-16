<template>
  <Dialog :visible="visible" modal header="Файл не принят — ошибки импорта" style="width: 720px"
          data-testid="import-errors-dialog" @update:visible="$emit('update:visible', $event)">
    <p style="margin:0 0 8px">{{ message }}</p>
    <DataTable v-if="errors.length" :value="errors" size="small" scrollable
               scroll-height="320px" data-testid="import-errors-table">
      <Column field="sheet" header="Лист" />
      <Column field="row" header="Строка">
        <template #body="{ data: e }">{{ e.row ?? '—' }}</template>
      </Column>
      <Column field="reason" header="Причина" />
    </DataTable>
    <p class="muted small" style="margin-top:8px">
      Список остаётся на экране до закрытия. Исправьте строки в файле и загрузите заново —
      частичного применения не происходит.
    </p>
    <template #footer>
      <Button label="Скачать ошибки (CSV)" icon="pi pi-download" severity="secondary"
              data-testid="import-errors-download" @click="download" />
      <Button label="Закрыть" data-testid="import-errors-close" @click="$emit('update:visible', false)" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'

export interface ImportErrorRow { sheet?: string; row?: number | null; reason: string }

const props = withDefaults(
  defineProps<{ visible: boolean; message: string; errors?: ImportErrorRow[] }>(),
  { errors: () => [] },
)
defineEmits<{ 'update:visible': [value: boolean] }>()

/** CSV с BOM (открывается Excel с кириллицей) — файл ошибок для обработки админом. */
function download() {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = ['Лист;Строка;Причина',
    ...props.errors.map((e) => [e.sheet || '', e.row ?? '', e.reason].map(esc).join(';'))]
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'import-errors.csv'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.muted { color: #64748b; }
.small { font-size: 0.82rem; }
</style>
