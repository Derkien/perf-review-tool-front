<template>
  <div class="page">
    <div class="head-row">
      <h1 style="margin:0">Сотрудники</h1>
      <div class="head-actions">
        <label v-if="auth.me?.has_subordinates" class="mine-toggle">
          <Checkbox v-model="mineOnly" :binary="true" @update:model-value="load" /> мои
        </label>
        <Button v-if="selected.length && auth.can('ROLE_C_PEER_ASSIGNMENT')"
                label="Отправить задания на оценку" size="small" severity="secondary"
                :loading="busy" @click="sendAssignments" />
        <span v-if="selected.length" class="muted small">выбрано: {{ selected.length }}</span>
      </div>
    </div>
    <div class="filters">
      <InputText v-model="q" placeholder="Поиск по ФИО/email" size="small" @input="debounced" />
      <Dropdown v-model="group" :options="groups" placeholder="Специализация" size="small" showClear @change="load" />
      <Dropdown v-model="grade" :options="grades" placeholder="Грейд" size="small" showClear @change="load" />
    </div>
    <DataTable v-model:selection="selected" :value="rows" size="small" paginator :rows="25"
               scrollable stripedRows data-key="id" selection-mode="multiple"
               style="cursor: pointer"
               @row-click="(e: any) => openCard(e.data)">
      <Column selection-mode="multiple" style="width: 34px" />
      <Column field="full_name" header="ФИО" sortable>
        <template #body="{ data: e }">
          <span class="name-link" @click.stop="openCard(e)">{{ e.full_name }}</span>
        </template>
      </Column>
      <Column field="functional_group" header="Специализация">
        <template #body="{ data: e }">
          <Tag v-if="e.functional_group" :value="groupLabel(e.functional_group)" severity="secondary" />
          <span v-else class="muted">—</span>
        </template>
      </Column>
      <Column field="grade" header="Грейд" sortable />
      <Column field="org_unit" header="Команда" />
      <Column field="manager" header="Рукль" />
      <Column header="Действия" style="width: 90px">
        <template #body="{ data: e }">
          <span class="acts">
            <i class="pi pi-user act" v-tooltip.top="'Профиль'" @click.stop="openCard(e)" />
            <i v-if="canEditPeers" class="pi pi-users act" v-tooltip.top="'Пиры сотрудника'"
               @click.stop="peersFor = e" />
          </span>
        </template>
      </Column>
    </DataTable>

    <PeerEditDialog v-if="peersFor" :employee-id="peersFor.id" :employee-name="peersFor.full_name"
                    :team="peersFor.org_unit" @close="peersFor = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import PeerEditDialog from '../components/PeerEditDialog.vue'
import { reviewsApi, staffApi } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAuth } from '../stores/auth'
import { useToast } from 'primevue/usetoast'

const auth = useAuth()
const router = useRouter()
const toast = useToast()
const rows = ref<any[]>([])
const selected = ref<any[]>([])
const q = ref('')
const group = ref<string | null>(null)
const grade = ref<string | null>(null)
const mineOnly = ref(false)
const peersFor = ref<any>(null)
const busy = ref(false)
const groups = ['backend', 'frontend', 'qa', 'ios', 'android', 'devops', 'management', 'other']
const grades = ['Стажёр', 'Младший', 'Основной 1', 'Основной 2', 'Старший 1', 'Старший 2', 'Ведущий 1', 'Ведущий 2', 'Ключевой 1', 'Ключевой 2']

// правка пиров: линейный рукль/админ/cto или делегат (настройка delegation)
const canEditPeers = computed(() =>
  auth.can('ROLE_U_PEER_SELECTION') || auth.role === 'admin' || auth.role === 'cto')

const groupLabels: Record<string, string> = {
  backend: 'бэкенд', frontend: 'фронтенд', qa: 'QA', ios: 'iOS', android: 'Android',
  devops: 'DevOps', management: 'менеджмент', other: 'другое',
}
function groupLabel(g: string): string { return groupLabels[g] || g }

let timer: number | undefined
function debounced() { clearTimeout(timer); timer = window.setTimeout(load, 300) }

onMounted(load)
async function load() {
  const params: any = {}
  if (q.value) params.q = q.value
  if (group.value) params.functional_group = group.value
  if (grade.value) params.grade = grade.value
  // по умолчанию рукль видит подчинённых, сотрудник — свою команду; «мои» — явный фильтр
  if (mineOnly.value) params.scope = 'mine'
  rows.value = await staffApi.listEmployees(params)
}

function openCard(e: any) {
  router.push(`/staff/${e.id}`)
}

async function sendAssignments() {
  const cycles = await reviewsApi.cycles()
  const cycle = cycles.find((c) => !['closed', 'imported', 'cancelled'].includes(c.stage))
  if (!cycle) {
    toast.add({ severity: 'warn', summary: 'Нет активного цикла', life: 6000 })
    return
  }
  busy.value = true
  try {
    const r = await reviewsApi.sendAssignments({
      cycle_id: cycle.id, employee_ids: selected.value.map((e: any) => e.id),
    })
    toast.add({
      severity: 'success', life: 6000,
      summary: `Заданий создано: ${r.created}, уведомлено: ${r.notified} (цикл «${cycle.name}»)`,
    })
    selected.value = []
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}
</script>

<style scoped>
.head-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.head-actions { display: flex; align-items: center; gap: 12px; }
.mine-toggle { display: flex; align-items: center; gap: 6px; font-size: 0.88rem; cursor: pointer; }
.filters { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.name-link { color: #2563eb; cursor: pointer; }
.name-link:hover { text-decoration: underline; }
.acts { display: flex; gap: 10px; }
.act { cursor: pointer; color: #2563eb; }
.act:hover { color: #1d4ed8; }
</style>
