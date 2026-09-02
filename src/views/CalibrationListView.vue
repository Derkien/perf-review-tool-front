<template>
  <div class="page">
    <h1>Калибровочные сессии</h1>
    <div v-if="auth.can('ROLE_C_CALIBRATION')" class="head">
      <Dropdown v-model="cycleId" :options="cycles" option-label="name" option-value="id" placeholder="Цикл" />
      <Dropdown v-model="group" :options="groups" placeholder="Функц. группа" />
      <Dropdown v-model="hostId" :options="users" option-label="full_name" option-value="id" placeholder="Ведущий" filter />
      <Button label="Создать сессию" :loading="busy" @click="create" />
      <Button label="AI-пакет (xlsx)" severity="secondary" :disabled="!cycleId" @click="exportAi" />
      <FileUpload mode="basic" custom-upload choose-label="Импорт AI-ответов" @select="importAi" />
    </div>
    <DataTable :value="sessions" size="small" style="margin-top: 12px"
               @row-click="(e: any) => $router.push(`/calibration/${e.data.id}`)"
               style-cursor="cursor:pointer">
      <Column field="title" header="Сессия" />
      <Column field="group" header="Группа" />
      <Column field="status" header="Статус">
        <template #body="{ data: s }">
          <Tag :value="({ voting: 'голосование', finalizing: 'финализация', closed: 'закрыта' } as Record<string,string>)[s.status] || s.status" />
        </template>
      </Column>
      <Column header="Прогресс">
        <template #body="{ data: s }">{{ s.items_final }} / {{ s.items_total }}</template>
      </Column>
      <Column field="host" header="Ведущий" />
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dropdown from 'primevue/dropdown'
import FileUpload from 'primevue/fileupload'
import Tag from 'primevue/tag'
import { adminApi, calibrationApi, reviewsApi } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAuth } from '../stores/auth'
import { useToast } from 'primevue/usetoast'

const auth = useAuth()
const toast = useToast()
const sessions = ref<any[]>([])
const cycles = ref<any[]>([])
const users = ref<any[]>([])
const cycleId = ref<number | null>(null)
const group = ref('backend')
const groups = ['backend', 'frontend', 'qa', 'ios', 'android', 'devops', 'management', 'other']
const hostId = ref<number | null>(null)
const busy = ref(false)

onMounted(async () => {
  cycles.value = await reviewsApi.cycles()
  cycleId.value = cycles.value.find((c: any) => !['closed', 'imported'].includes(c.stage))?.id || null
  await loadSessions()
  if (auth.can('ROLE_R_USERS')) {
    users.value = await adminApi.users()
  }
})

async function loadSessions() {
  sessions.value = await calibrationApi.sessions(cycleId.value || undefined)
}

async function create() {
  if (!cycleId.value || !hostId.value) {
    toast.add({ severity: 'warn', summary: 'Выберите цикл и ведущего' })
    return
  }
  busy.value = true
  try {
    await calibrationApi.createSession({
      cycle_id: cycleId.value, group: group.value, host_user_id: hostId.value, participant_ids: [],
    })
    await loadSessions()
    toast.add({ severity: 'success', summary: 'Сессия создана' })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}

async function exportAi() {
  if (!cycleId.value) return
  downloadBlob(await calibrationApi.aiExport(cycleId.value), `ai-pack-cycle${cycleId.value}.xlsx`)
}

async function importAi(ev: any) {
  const file = ev.files[0]
  try {
    const r = await calibrationApi.aiImport(file)
    const conflicts = (r.conflicts as unknown[])?.length || 0
    toast.add({ severity: conflicts ? 'warn' : 'success',
      summary: `AI-ответы: ${r.imported} импортировано, конфликтов ${conflicts}` })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка импорта', detail: errMsg(e) })
  }
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.head { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
</style>
