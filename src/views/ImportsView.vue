<template>
  <div class="page">
    <h1>Импорт данных</h1>
    <Card>
      <template #content>
        <div class="upload-row">
          <Dropdown v-model="type" :options="types" option-label="label" option-value="value" placeholder="Тип импорта" />
          <FileUpload mode="basic" custom-upload :choose-label="'Выбрать файл'" @select="onSelect" />
          <Button label="Предпросмотр" :disabled="!file || !type" :loading="busy" @click="preview" />
          <InputText v-if="type === 'traffic' || type === 'efficiency'" v-model="month"
                     placeholder="YYYY-MM (если не в имени файла)" size="small" />
        </div>
        <div v-if="previewData" class="preview">
          <h2>{{ previewData.rows_total }} строк распознано, конфликтов: {{ previewData.conflicts.length }}</h2>
          <div v-for="(c, i) in previewData.conflicts.slice(0, 10)" :key="i" class="muted">! {{ c.error }}</div>
          <DataTable :value="previewData.preview.slice(0, 10)" size="small">
            <Column v-for="f of previewFields" :key="f" :field="f" :header="f" />
          </DataTable>
          <Button label="Применить" severity="success" :loading="busy" @click="apply"
                  :disabled="!previewData" />
        </div>
      </template>
    </Card>
    <h2 style="margin-top:18px">История импортов</h2>
    <DataTable :value="batches" size="small">
      <Column field="id" header="#" />
      <Column field="type" header="Тип" />
      <Column field="filename" header="Файл" />
      <Column field="status" header="Статус">
        <template #body="{ data: b }">
          <Tag :value="b.status" :severity="b.status === 'applied' ? 'success' : 'info'" />
        </template>
      </Column>
      <Column header="Строк">
        <template #body="{ data: b }">{{ b.rows_ok }}/{{ b.rows_total }}</template>
      </Column>
      <Column field="summary" header="Итог" style="max-width: 400px" />
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dropdown from 'primevue/dropdown'
import FileUpload from 'primevue/fileupload'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import { importsApi } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const types = [
  { value: 'amt', label: 'АМТ-справочник (4 листа)' },
  { value: 'staff', label: 'Кадровая матрица' },
  { value: 'traffic', label: 'Светофор (месячный)' },
  { value: 'efficiency', label: 'Эффективность (месячный)' },
  { value: 'history', label: 'MasterFile final (история ревью)' },
  { value: 'competency', label: 'Матрица компетенций' },
]
const type = ref<string | null>(null)
const file = ref<File | null>(null)
const month = ref('')
const previewData = ref<any>(null)
const batches = ref<any[]>([])
const busy = ref(false)
const previewFields = computed(() =>
  Object.keys(previewData.value?.preview?.[0] || {}).slice(0, 8))

onMounted(load)
async function load() { batches.value = await importsApi.list() }

function onSelect(ev: any) { file.value = ev.files[0] }

async function preview() {
  if (!file.value || !type.value) return
  busy.value = true
  try {
    const params: Record<string, unknown> = {}
    if (month.value && ['traffic', 'efficiency'].includes(type.value)) params.month = month.value
    previewData.value = await importsApi.preview(type.value, file.value, params)
  } catch (e) { toast.add({ severity: 'error', summary: 'Ошибка разбора', detail: errMsg(e), life: 10000 }) }
  finally { busy.value = false }
}

async function apply() {
  busy.value = true
  try {
    const params: Record<string, unknown> = {}
    if (month.value && ['traffic', 'efficiency'].includes(type.value!)) params.month = month.value
    const r = await importsApi.apply(previewData.value.batch_id, params)
    toast.add({ severity: 'success', summary: 'Применено', detail: String(r.summary || ''), life: 8000 })
    previewData.value = null
    file.value = null
    await load()
  } catch (e) { toast.add({ severity: 'error', summary: 'Ошибка применения', detail: errMsg(e), life: 10000 }) }
  finally { busy.value = false }
}
</script>

<style scoped>
.upload-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.preview { margin-top: 16px; }
</style>
