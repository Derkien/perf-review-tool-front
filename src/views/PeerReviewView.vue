<template>
  <div class="page">
    <h1>Оценить коллег</h1>
    <div v-if="!current">
      <DataTable v-if="assignments.length" :value="assignments" size="small">
        <Column field="subject" header="Колlega">
          <template #body="{ data: a }">{{ a.subject }}</template>
        </Column>
        <Column field="role" header="Роль">
          <template #body="{ data: a }">
            <Tag :value="({ 'line-manager': 'как лин. рукль', 'functional-manager': 'как функц. рукль', peer: 'как пир' } as Record<string,string>)[a.role] || a.role"
                 :severity="a.role === 'peer' ? 'info' : 'warn'" />
          </template>
        </Column>
        <Column field="status" header="Статус">
          <template #body="{ data: a }">
            <Tag :value="a.status === 'submitted' ? 'отправлено' : 'ждёт оценки'"
                 :severity="a.status === 'submitted' ? 'success' : 'danger'" />
          </template>
        </Column>
        <Column>
          <template #body="{ data: a }">
            <Button v-if="a.status !== 'submitted' && a.achievements?.length"
                    label="Оценить" size="small" @click="open(a)" />
            <span v-else-if="!a.achievements?.length" class="muted">селф-ревью ещё не отправлено</span>
          </template>
        </Column>
      </DataTable>
      <Message v-else severity="info">Нет заданий на оценку — всё чисто 👌</Message>
    </div>
    <Card v-else>
      <template #title>{{ current.subject }}</template>
      <template #content>
        <div v-for="(a, i) in current.achievements" :key="i" class="ach">
          <p class="ach-text">{{ a.text }}</p>
          <div class="rate-row">
            <span class="muted">Оценка:</span>
            <SelectButton v-model="ratings[i]" :options="letterOptions" option-label="label"
                          option-value="value" :allow-empty="true" />
            <span v-if="ratings[i]" class="muted">{{ letterWords[ratings[i]] }}</span>
          </div>
        </div>
        <h2>Свободная обратная связь</h2>
        <Textarea v-model="freeText" :rows="4" class="w100"
                  placeholder="Чем помог, что стоит продолжать, что улучшить…" />
        <div class="actions">
          <Button label="Назад" text @click="current = null" />
          <div style="flex:1"></div>
          <Button label="Отправить оценку" :loading="busy" @click="submit" />
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { api, errMsg } from '../api/http'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const assignments = ref<any[]>([])
const current = ref<any>(null)
const ratings = ref<Record<number, string>>({})
const freeText = ref('')
const busy = ref(false)
const letterWords: Record<string, string> = {
  A: 'Превосходит ожидания', B: 'Выше ожиданий', C: 'Соответствует ожиданиям',
  D: 'Ниже ожиданий', E: 'Не соответствует ожиданиям',
}
const letterOptions = Object.entries(letterWords).map(([value, label]) => ({ value, label }))

onMounted(load)
async function load() {
  const cycles = (await api.get('/reviews/cycles')).data
  const active = cycles.find((c: any) => !['closed', 'imported'].includes(c.stage)) || cycles[0]
  if (!active) return
  assignments.value = (await api.get('/reviews/peer-assignments/mine', { params: { cycle_id: active.id } })).data
}

function open(a: any) {
  current.value = a
  ratings.value = {}
  freeText.value = ''
}

async function submit() {
  const expected = current.value.achievements.map((_: any, i: number) => i + 1)
  const payload = expected.filter((i: number) => ratings.value[i])
  if (payload.length !== expected.length) {
    toast.add({ severity: 'warn', summary: 'Оцените каждое достижение' })
    return
  }
  busy.value = true
  try {
    await api.post(`/reviews/peer-reviews/${current.value.assignment_id}`, {
      ratings: payload.map((i: number) => ({ ach_index: i, letter: ratings.value[i] })),
      free_text: freeText.value,
    })
    toast.add({ severity: 'success', summary: 'Оценка отправлена' })
    current.value = null
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}
</script>

<style scoped>
.ach { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
.ach-text { margin: 0 0 8px; white-space: pre-wrap; }
.rate-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.w100 { width: 100%; box-sizing: border-box; }
.actions { display: flex; gap: 10px; margin-top: 10px; }
</style>
