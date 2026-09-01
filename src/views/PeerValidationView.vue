<template>
  <div class="page">
    <h1>Валидация пиров</h1>
    <div class="head">
      <Dropdown v-model="subordinateId" :options="subordinates" option-label="full_name"
                option-value="id" placeholder="Выберите подчинённого" @change="loadSub" />
      <Button v-if="subordinateId" label="Отправить на оценку" :loading="busy" @click="send" />
    </div>
    <Card v-if="sel" style="margin-top: 12px">
      <template #title>Пиры {{ selName }}</template>
      <template #content>
        <p class="muted">Итоговый список: обязательная команда + выбранные + добавленные вами − удалённые.</p>
        <h2>Команда (обязательные)</h2>
        <div class="chips">
          <Tag v-for="m in sel.mandatory" :key="m.id" :value="m.name" severity="info"
               class="chip" icon="pi pi-lock" />
        </div>
        <h2>Выбранные сотрудником</h2>
        <div class="chips">
          <Tag v-for="m in sel.selected" :key="m.id" :value="nameOf(m)"
               :severity="sel.removed.includes(m) ? 'danger' : 'success'" class="chip">
          </Tag>
        </div>
        <div class="grid-2" style="margin-top: 10px">
          <div>
            <h2>Добавить пира</h2>
            <Dropdown v-model="addId" :options="others" option-label="name" option-value="id"
                      filter placeholder="Поиск сотрудника" class="w100" />
            <Button label="Добавить" size="small" style="margin-top: 6px" @click="addPeer" />
          </div>
          <div>
            <h2>Убрать из списка</h2>
            <Dropdown v-model="removeId" :options="finalPeerOptions" option-label="name"
                      option-value="id" placeholder="Кого убрать" class="w100" />
            <Button label="Убрать" size="small" severity="danger" style="margin-top: 6px" @click="removePeer" />
          </div>
        </div>
        <h2>Итог ({{ sel.final.length }})</h2>
        <div class="chips">
          <Tag v-for="f in sel.final" :key="f" :value="nameOf(f)" class="chip" />
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Dropdown from 'primevue/dropdown'
import Tag from 'primevue/tag'
import { api, errMsg } from '../api/http'
import { useAuth } from '../stores/auth'
import { useToast } from 'primevue/usetoast'

const auth = useAuth()
const toast = useToast()
const subordinateId = ref<number | null>(null)
const subordinates = ref<any[]>([])
const others = ref<any[]>([])
const sel = ref<any>(null)
const addId = ref<number | null>(null)
const removeId = ref<number | null>(null)
const busy = ref(false)
const cycleId = ref<number | null>(null)

const selName = computed(() => subordinates.value.find((s) => s.id === subordinateId.value)?.full_name)
const finalPeerOptions = computed(() =>
  (sel.value?.final || []).map((id: number) => ({ id, name: nameOf(id) })))

function nameOf(id: number): string {
  return others.value.find((o) => o.id === id)?.name
    || subordinates.value.find((o) => o.id === id)?.name || `#${id}`
}

onMounted(async () => {
  const cycles = (await api.get('/reviews/cycles')).data
  cycleId.value = cycles.find((c: any) => !['closed', 'imported'].includes(c.stage))?.id || cycles[0]?.id
  const all = (await api.get('/staff/employees')).data
  others.value = all.map((e: any) => ({ id: e.id, name: e.full_name }))
  // рукль видит всех своих: для простоты локально — всех активных
  subordinates.value = all
})

async function loadSub() {
  if (!subordinateId.value || !cycleId.value) return
  const cand = (await api.get('/reviews/peer-candidates', { params: { cycle_id: cycleId.value } })).data
  const mine = await api.get(`/reviews/cycles/${cycleId.value}/peer-stats`)
  // merged-список получаем через PUT-запрос логики: читаем peer-candidates + собственные данные
  // для подчинённого получаем их merged так: используем открытый эндпоинт сотрудников
  const empId = subordinateId.value
  const merged = await api.get(`/reviews/cycles/${cycleId.value}/peer-stats?employee_id=${empId}`)
  // отдаём UI: mandatory из candidates подчинённого не доступны напрямую — используем final
  sel.value = { mandatory: cand.mandatory, selected: [], removed: [], final: [] }
  // загрузка фактического состояния — через stats named доступно только cto; руклю достаточно final
  try {
    const r = await api.put(`/reviews/peer-selections/${empId}`, {
      cycle_id: cycleId.value, add_ids: [], remove_ids: [],
    })
    sel.value.mandatory = cand.mandatory
    sel.value.final = r.data.merged.final
    sel.value.selected = r.data.merged.selected
    sel.value.removed = r.data.merged.removed
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  }
}

async function addPeer() {
  if (!addId.value) return
  await api.put(`/reviews/peer-selections/${subordinateId.value}`, {
    cycle_id: cycleId.value, add_ids: [addId.value], remove_ids: [],
  })
  await loadSub()
}
async function removePeer() {
  if (!removeId.value) return
  await api.put(`/reviews/peer-selections/${subordinateId.value}`, {
    cycle_id: cycleId.value, add_ids: [], remove_ids: [removeId.value],
  })
  await loadSub()
}
async function send() {
  busy.value = true
  try {
    const r = await api.post('/reviews/peer-assignments/send', {
      cycle_id: cycleId.value, employee_ids: [subordinateId.value],
    })
    toast.add({ severity: 'success', summary: `Заданий создано: ${r.data.created}, уведомлено: ${r.data.notified}` })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}
</script>

<style scoped>
.head { display: flex; gap: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border-radius: 12px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.w100 { width: 100%; }
</style>
