<template>
  <div class="page">
    <h1>Моё ревью
      <i class="pi pi-info-circle muted guide-i" v-tooltip.top="'Правила оценки'"
         @click="guideVisible = true" />
    </h1>

    <template v-if="cycle">
      <!-- БЛОК 1: достижения -->
      <Card>
        <template #title>1. Достижения ({{ achievements.length }}/{{ limits.self_max_ach }})</template>
        <template #content>
          <Message v-if="status === 'submitted'" severity="success">
            Селф-ревью отправлено. Правка доступна на вкладке «Ревью» карточки.
          </Message>
          <AchievementEditor v-else v-model="achievements" :limits="limits" />
          <p v-if="status !== 'submitted'" class="muted small" style="margin-bottom:0">
            Хорошее достижение: что сделал + измеримый результат + польза бизнесу.
            Пример: «Ускорил прогоны на 20% — прогон сократился с 75 до 15 минут».
          </p>
        </template>
      </Card>

      <!-- БЛОК 2: пиры -->
      <Card style="margin-top: 14px">
        <template #title>2. Пиры: кого попросить оценить меня</template>
        <template #content>
          <Message v-if="noProfile" severity="warn">
            Ваш email не связан с профилем сотрудника — выберите пиров не получится.
            Обратитесь к администратору.
          </Message>
          <template v-else>
            <p class="muted" style="margin-top:0">Члены команды — обязательные пиры:</p>
            <div class="chips">
              <Tag v-for="m in candidates.mandatory" :key="m.id" :value="m.name"
                   severity="info" class="chip" icon="pi pi-lock" />
              <span v-if="!candidates.mandatory?.length" class="muted">в команде кроме вас никого</span>
            </div>
            <p class="muted">Дополнительные пиры ({{ selectedPeers.length }}/{{ limits.peers_max }}):</p>
            <MultiSelect v-model="selectedPeers" :options="candidates.others" option-label="name"
                         option-value="id" filter placeholder="Выберите коллег" class="w100" />
          </template>
        </template>
      </Card>

      <!-- БЛОК 3: действия -->
      <Card style="margin-top: 14px">
        <template #title>3. Действия</template>
        <template #content>
          <div v-if="status !== 'submitted'" class="actions-row">
            <Button label="Сохранить черновик" severity="secondary" :disabled="!dirty"
                    :loading="busy" @click="saveDraft" />
            <Button label="Отправить" :loading="busy" @click="confirmVisible = true" />
            <span v-if="dirty" class="muted small">есть несохранённые изменения</span>
          </div>
          <Message v-else severity="success">Отправлено. Спасибо!</Message>
        </template>
      </Card>
    </template>

    <Message v-else severity="warn">Активного цикла ревью нет — здесь появится форма, когда цикл запустится.</Message>

    <!-- гайд -->
    <Dialog v-model:visible="guideVisible" modal header="Гайд: как формулировать достижения" style="width: 640px">
      <div class="guide">
        <p><b>Хорошее достижение отвечает на три вопроса:</b> что сделал? какой результат? какую пользу принесло бизнесу?</p>
        <p><b>Хорошо:</b> «Ускорил мобильные прогоны на 20% за счёт рефакторинга — прогон сократился с 75 до 15 минут».</p>
        <p><b>Плохо:</b> «Участвовал в разработке», «Помогал команде» — без метрик и результата.</p>
        <p><b>Шкала самооценки:</b></p>
        <ul>
          <li>A — превосходит ожидания</li>
          <li>B — выше ожиданий</li>
          <li>C — соответствует ожиданиям</li>
          <li>D — ниже ожиданий</li>
          <li>E — не соответствует ожиданиям</li>
        </ul>
        <p class="muted">Чек-лист: есть цифры? понятна бизнес-ценность? ≤{{ limits.self_max_chars }} символов? личный вклад («я», не «мы»)? нет дублей?</p>
      </div>
    </Dialog>

    <!-- подтверждение отправки -->
    <Dialog v-model:visible="confirmVisible" modal header="Отправить селф-ревью?" style="width: 460px">
      <p>После отправки пиры увидят ваши достижения. Изменения до старта пир-ревью — свободно,
        после — только через запрос руководителю.</p>
      <div class="actions-row" style="justify-content:flex-end">
        <Button label="Отмена" severity="secondary" size="small" @click="confirmVisible = false" />
        <Button label="Да, отправить" size="small" :loading="busy" @click="submit" />
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import Tag from 'primevue/tag'
import AchievementEditor from '../components/AchievementEditor.vue'
import { reviewsApi } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const cycle = ref<any>(null)
const achievements = ref<any[]>([])
const status = ref('empty')
const limits = ref<any>({ self_min_ach: 2, self_max_ach: 4, self_max_chars: 300, peers_min: 3, peers_max: 8 })
const candidates = ref<any>({ mandatory: [], others: [] })
const selectedPeers = ref<number[]>([])
const busy = ref(false)
const dirty = ref(false)
const guideVisible = ref(false)
const confirmVisible = ref(false)
const noProfile = ref(false)

function markDirty() { dirty.value = true }

watch(achievements, markDirty, { deep: true })
watch(selectedPeers, markDirty, { deep: true })

function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value && status.value !== 'submitted') {
    e.preventDefault()
    e.returnValue = 'Есть несохранённые изменения — сохранить черновик перед уходом?'
  }
}

onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload)
  limits.value = await reviewsApi.publicSettings()
  const cycles = await reviewsApi.cycles()
  cycle.value = cycles.find((c: any) => !['closed', 'imported'].includes(c.stage)) || null
  if (!cycle.value) return
  const mine = await reviewsApi.mySelf(cycle.value.id)
  status.value = mine.status
  noProfile.value = mine.status === 'no-profile'
  if (mine.achievements?.length) achievements.value = mine.achievements
  else achievements.value = [{ text: '', self_rating: null }, { text: '', self_rating: null }]
  try {
    candidates.value = await reviewsApi.peerCandidates(cycle.value.id)
  } catch { /* нет доступа */ }
  // данные загрузились — сбрасываем dirty, зафиксировав чистое состояние
  setTimeout(() => { dirty.value = false }, 0)
})

onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

async function saveDraft() {
  busy.value = true
  try {
    const r = await reviewsApi.saveSelf({
      cycle_id: cycle.value.id, achievements: achievements.value, submit: false,
    })
    status.value = r.status
    dirty.value = false
    toast.add({  severity: 'success', summary: 'Черновик сохранён', life: 4000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Проверьте форму', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}

async function submit() {
  busy.value = true
  try {
    await reviewsApi.savePeers(cycle.value.id, selectedPeers.value)
    const r = await reviewsApi.saveSelf({
      cycle_id: cycle.value.id, achievements: achievements.value, submit: true,
    })
    status.value = r.status
    dirty.value = false
    confirmVisible.value = false
    toast.add({  severity: 'success', summary: 'Отправлено', life: 4000 })
  } catch (e) {
    confirmVisible.value = false
    toast.add({ severity: 'error', summary: 'Проверьте форму', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}
</script>

<style scoped>
.guide-i { cursor: pointer; margin-left: 8px; font-size: 1rem; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border-radius: 12px; }
.w100 { width: 100%; box-sizing: border-box; }
.actions-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.small { font-size: 0.8rem; }
.guide p { margin: 8px 0; }
.guide ul { margin: 6px 0 6px 18px; padding: 0; }
</style>
