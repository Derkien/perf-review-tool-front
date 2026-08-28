<template>
  <div class="page">
    <h1>Моё ревью</h1>
    <Card v-if="cycle">
      <template #title>Достижения ({{ achievements.length }}/{{ limits.self_max_ach }})</template>
      <template #content>
        <AchievementEditor v-model="achievements" :limits="limits" :locked="locked" />
        <div class="actions">
          <Button label="+ Добавить достижение" text size="small" :disabled="locked || achievements.length >= limits.self_max_ach"
                  @click="achievements.push({ text: '', self_rating: null })" />
          <div style="flex:1"></div>
          <Button label="Сохранить черновик" severity="secondary" :disabled="locked" :loading="busy" @click="save(false)" />
          <Button label="Отправить" :disabled="locked" :loading="busy" @click="save(true)" />
        </div>
        <Message v-if="status === 'submitted'" severity="success" closable>
          Селф-ревью отправлено. Спасибо!
        </Message>
        <Message severity="info" :sticky="true">
          Хорошее достижение: конкретное действие + измеримый результат + бизнес-польза.
          Пример: «Ускорил прогоны на 20% за счёт рефакторинга — прогон сократился с 75 до 15 минут».
        </Message>
      </template>
    </Card>
    <Message v-else severity="warn">Активного цикла ревью нет.</Message>

    <Card style="margin-top: 16px">
      <template #title>Пиры: кого попросить оценить меня</template>
      <template #content>
        <p class="muted">Члены команды — обязательные пиры:</p>
        <div class="chips">
          <Tag v-for="m in candidates.mandatory" :key="m.id" :value="m.name" severity="info" class="chip" />
        </div>
        <p class="muted">Дополнительные пиры ({{ selectedPeers.length }}/{{ limits.peers_max }}):</p>
        <MultiSelect v-model="selectedPeers" :options="candidates.others" option-label="name"
                     option-value="id" filter placeholder="Выберите коллег" class="w100"
                     :disabled="lockedPeerPick" />
        <Button label="Сохранить выбор пиров" size="small" style="margin-top:8px" :loading="busyPeers"
                @click="savePeers" />
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import AchievementEditor from '../components/AchievementEditor.vue'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { api, errMsg } from '../api'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const cycle = ref<any>(null)
const achievements = ref<{ text: string; self_rating: string | null }[]>([{ text: '', self_rating: null }, { text: '', self_rating: null }])
const status = ref('empty')
const limits = ref<any>({ self_min_ach: 2, self_max_ach: 4, self_max_chars: 300, peers_min: 3, peers_max: 8 })
const letterWords: Record<string, string> = {
  A: 'Превосходит ожидания', B: 'Выше ожиданий', C: 'Соответствует ожиданиям',
  D: 'Ниже ожиданий', E: 'Не соответствует ожиданиям',
}
const letters = ['A', 'B', 'C', 'D', 'E'].map((v) => ({ v, l: `${v} — ${letterWords[v]}` }))
const candidates = ref<any>({ mandatory: [], others: [] })
const selectedPeers = ref<number[]>([])
const busy = ref(false)
const busyPeers = ref(false)

const locked = computed(() => status.value === 'submitted')
const lockedPeerPick = computed(() => status.value !== 'empty' && status.value !== 'draft')

onMounted(async () => {
  const l = await api.get('/admin/settings/public')
  limits.value = l.data
  letterWords.value = l.data.letter_words
  const cycles = (await api.get('/reviews/cycles')).data
  cycle.value = cycles.find((c: any) => !['closed', 'imported'].includes(c.stage)) || cycles[0]
  if (!cycle.value) return
  const mine = (await api.get('/reviews/self/mine', { params: { cycle_id: cycle.value.id } })).data
  status.value = mine.status
  if (mine.achievements?.length) achievements.value = mine.achievements
  try {
    candidates.value = (await api.get('/reviews/peer-candidates', { params: { cycle_id: cycle.value.id } })).data
  } catch { /* кандидаты недоступны */ }
})

async function save(submit: boolean) {
  busy.value = true
  try {
    const r = await api.post('/reviews/self', {
      cycle_id: cycle.value.id, achievements: achievements.value, submit,
    })
    status.value = r.data.status
    toast.add({ severity: 'success', summary: submit ? 'Отправлено' : 'Черновик сохранён' })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Проверьте форму', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}

async function savePeers() {
  busyPeers.value = true
  try {
    await api.put('/reviews/peer-selections', { cycle_id: cycle.value.id, peer_ids: selectedPeers.value })
    toast.add({ severity: 'success', summary: 'Список пиров сохранён' })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busyPeers.value = false }
}
</script>

<style scoped>
.ach { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
.ach-head { display: flex; justify-content: space-between; align-items: center; }
.w100 { width: 100%; box-sizing: border-box; }
.counter { text-align: right; font-size: 0.75rem; color: #64748b; margin-top: 2px; }
.counter.over { color: #dc2626; font-weight: 700; }
.self-rating { display: flex; gap: 10px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
.actions { display: flex; gap: 10px; margin-top: 8px; align-items: center; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border-radius: 12px; }
</style>
