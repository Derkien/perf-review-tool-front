<template>
  <Dialog :visible="true" modal :header="`Пиры: ${employeeName}`" style="width: 680px" @update:visible="$emit('close')">
    <p class="muted small" style="margin-top:0">
      Обязательные пиры (команда) + выбранные сотрудником + добавленные руководителем −
      удалённые. Отправка заданий выполняется по итоговому набору.
    </p>
    <div v-if="sel" class="peer-grid">
      <div>
        <b class="section-title">Итоговый набор (final)</b>
        <div class="chips">
          <Tag v-for="id in sel.final" :key="id" class="chip" severity="info">
            {{ nameOf(id) }}
            <i v-if="removable(id)" class="pi pi-times chip-x" title="Убрать" @click="removePeer(id)" />
          </Tag>
          <span v-if="!sel.final.length" class="muted small">пусто</span>
        </div>
      </div>
      <div>
        <b class="section-title">Добавить</b>
        <Dropdown v-model="addId" :options="addable" option-label="name" option-value="id"
                  placeholder="Сотрудник" filter size="small" class="w100" />
        <Button label="Добавить" size="small" text :disabled="!addId" style="margin-top:6px"
                @click="addPeer" />
      </div>
    </div>
    <div class="send-row">
      <Button label="Отправить задания на оценку" size="small" :loading="busy"
              :disabled="!cycleId" @click="send" />
      <span v-if="lastSend" class="muted small">{{ lastSend }}</span>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import Tag from 'primevue/tag'
import { reviewsApi, staffApi } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{ employeeId: number; employeeName: string; team?: string | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const toast = useToast()
const cycleId = ref<number | null>(null)
const sel = ref<{ mandatory: number[]; selected: number[]; removed: number[]; final: number[] } | null>(null)
const others = ref<{ id: number; name: string; team: string | null }[]>([])
const addId = ref<number | null>(null)
const busy = ref(false)
const lastSend = ref('')

const addable = computed(() =>
  others.value.filter((o) => !sel.value?.final.includes(o.id)))
// обязательные пиры — члены той же команды: их рукль не снимает через этот диалог
const mandatorySet = computed(() =>
  new Set(others.value.filter((o) => o.team && o.team === props.team).map((o) => o.id)))
const removable = (id: number) => !mandatorySet.value.has(id) && id !== props.employeeId

function nameOf(id: number): string {
  return others.value.find((o) => o.id === id)?.name || `#${id}`
}

onMounted(async () => {
  const cycles = await reviewsApi.cycles()
  cycleId.value = cycles.find((c) => !['closed', 'imported', 'cancelled'].includes(c.stage))?.id
    || cycles[0]?.id || null
  const all = await staffApi.listEmployees({ scope: 'all' })
  others.value = all.map((e: any) => ({ id: e.id, name: e.full_name, team: e.org_unit }))
  await loadSub()
})

async function loadSub() {
  if (!cycleId.value) return
  try {
    const r = await reviewsApi.managerEditPeers(props.employeeId, {
      cycle_id: cycleId.value, add_ids: [], remove_ids: [],
    })
    sel.value = {
      mandatory: [], selected: r.merged.selected, removed: r.merged.removed,
      final: r.merged.final,
    }
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка загрузки пиров', detail: errMsg(e), life: 8000 })
  }
}

async function addPeer() {
  if (!addId.value || !cycleId.value) return
  await reviewsApi.managerEditPeers(props.employeeId, {
    cycle_id: cycleId.value, add_ids: [addId.value], remove_ids: [],
  })
  addId.value = null
  await loadSub()
}

async function removePeer(id: number) {
  if (!cycleId.value) return
  await reviewsApi.managerEditPeers(props.employeeId, {
    cycle_id: cycleId.value, add_ids: [], remove_ids: [id],
  })
  await loadSub()
}

async function send() {
  if (!cycleId.value) return
  busy.value = true
  try {
    const r = await reviewsApi.sendAssignments({
      cycle_id: cycleId.value, employee_ids: [props.employeeId],
    })
    lastSend.value = `Заданий создано: ${r.created}, уведомлено: ${r.notified}`
    toast.add({ severity: 'success', summary: 'Задания отправлены', life: 4000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}
</script>

<style scoped>
.peer-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; }
.section-title { display: block; font-size: 0.82rem; margin-bottom: 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border-radius: 12px; }
.chip-x { margin-left: 6px; cursor: pointer; }
.send-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.w100 { width: 100%; }
@media (max-width: 700px) { .peer-grid { grid-template-columns: 1fr; } }
</style>
