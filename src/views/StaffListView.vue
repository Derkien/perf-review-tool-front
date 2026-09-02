<template>
  <div class="page">
    <h1>Сотрудники</h1>
    <div class="filters">
      <InputText v-model="q" placeholder="Поиск по ФИО/email" size="small" @input="debounced" />
      <Dropdown v-model="group" :options="groups" placeholder="Функц. группа" size="small" showClear @change="load" />
      <Dropdown v-model="grade" :options="grades" placeholder="Грейд" size="small" showClear @change="load" />
    </div>
    <DataTable :value="rows" size="small" paginator :rows="25" scrollable stripedRows
               @row-click="(e: any) => $router.push(`/staff/${e.data.id}`)"
               style="cursor: pointer">
      <Column field="full_name" header="ФИО" sortable />
      <Column field="position" header="Должность" />
      <Column field="grade" header="Грейд" sortable>
        <template #body="{ data: e }"><Tag :value="e.grade" severity="secondary" /></template>
      </Column>
      <Column field="org_unit" header="Команда" />
      <Column field="manager" header="Рукль" />
      <Column v-if="auth.can('ROLE_R_STAFF')" field="email" header="Email" />
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import { staffApi } from '../api/endpoints'
import { useAuth } from '../stores/auth'

const auth = useAuth()
const rows = ref<any[]>([])
const q = ref('')
const group = ref<string | null>(null)
const grade = ref<string | null>(null)
const groups = ['backend', 'frontend', 'qa', 'ios', 'android', 'devops', 'management', 'other']
const grades = ['Стажёр', 'Младший', 'Основной 1', 'Основной 2', 'Старший 1', 'Старший 2', 'Ведущий 1', 'Ведущий 2', 'Ключевой 1', 'Ключевой 2']

let timer: number | undefined
function debounced() { clearTimeout(timer); timer = window.setTimeout(load, 300) }

async function load() {
  const params: any = {}
  if (q.value) params.q = q.value
  if (group.value) params.functional_group = group.value
  if (grade.value) params.grade = grade.value
  rows.value = await staffApi.listEmployees(params)
}
onMounted(load)
</script>

<style scoped>
.filters { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
</style>
