<template>
  <div class="page">
    <h1>Дашборд цикла</h1>
    <div v-if="cycle" class="cards">
      <Card><template #title>{{ cycle.name }}</template><template #content>
        <Tag :value="stageName" severity="info" />
        <div v-for="(d, s) in cycle.stage_deadlines" :key="s" class="muted" style="margin-top:4px">
          {{ stageNames[s] || s }}: до {{ String(d).slice(0, 10) }}
        </div>
        <Button v-if="auth.isCto" label="Следующая стадия" size="small" style="margin-top:8px"
                :loading="busy" @click="advance" />
      </template></Card>
      <Card><template #title>Селф-ревью</template><template #content>
        <big>{{ t.self_done }} / {{ t.employees }}</big>
      </template></Card>
      <Card><template #title>Ответы пиров</template><template #content>
        <big>{{ t.peer_answers }} / {{ t.peer_assignments }}</big>
      </template></Card>
      <Card><template #title>Предоценки руклей</template><template #content>
        <big>{{ t.leader_done }} / {{ t.employees }}</big>
      </template></Card>
    </div>
    <div class="grid-2">
      <Card>
        <template #title>Распределение предварительных оценок</template>
        <template #content>
          <div class="dist">
            <div v-for="L in ['A','B','C','D','E']" :key="L" class="dist-row">
              <b>{{ L }}</b>
              <div class="dist-bar"><div :style="{ width: pct(L) + '%', background: colors[L] }" /></div>
              <span class="muted">{{ dist[L] || 0 }}</span>
            </div>
          </div>
        </template>
      </Card>
      <Card>
        <template #title>Прогресс по отделам</template>
        <template #content>
          <DataTable :value="deptRows" size="small" scrollable scroll-height="260px">
            <Column field="dept" header="Отдел" />
            <Column field="total" header="Чел." />
            <Column field="self_done" header="Селф" />
            <Column field="peer_answers" header="Ответы" />
            <Column field="peer_total" header="Задания" />
          </DataTable>
        </template>
      </Card>
    </div>
    <Card style="margin-top:16px">
      <template #title>Кого пушить</template>
      <template #content>
        <DataTable :value="data?.problems || []" size="small" scrollable scroll-height="300px"
                   paginator :rows="15">
          <Column field="employee" header="Сотрудник" />
          <Column field="team" header="Команда" />
          <Column field="issue" header="Проблема">
            <template #body="{ data: p }">
              <Tag :value="p.issue" :severity="p.issue.includes('не отправлено') ? 'danger' : 'warn'" />
            </template>
          </Column>
        </DataTable>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from 'primevue/card'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import { api, errMsg } from '../api/http'
import { useAuth } from '../stores/auth'
import { useToast } from 'primevue/usetoast'

const auth = useAuth()
const toast = useToast()
const data = ref<any>(null)
const busy = ref(false)

const cycle = computed(() => data.value?.cycle)
const t = computed(() => data.value?.totals || {})
const dist = computed(() => data.value?.letter_distribution || {})
const stageNames: Record<string, string> = {
  'self-review': 'Сбор ачивок', 'peer-review': 'Оценки пиров', 'leader-assessment': 'Предоценки',
  calibration: 'Калибровки', decision: 'Решения', closed: 'Закрыт', preparation: 'Подготовка',
}
const stageName = computed(() => stageNames[cycle.value?.stage] || cycle.value?.stage)
const colors: Record<string, string> = { A: '#16a34a', B: '#65a30d', C: '#3b82f6', D: '#f59e0b', E: '#dc2626' }

const deptRows = computed(() =>
  Object.entries(data.value?.by_department || {}).map(([dept, v]: [string, any]) => ({ dept, ...v })))

function pct(L: string) {
  const total = Object.values(dist.value).reduce((a: number, b: any) => a + (b as number), 0) || 1
  return Math.round(((dist.value[L] || 0) / total) * 100)
}

async function load() {
  const cycles = await api.get('/reviews/cycles')
  const active = cycles.data.find((c: any) => !['closed', 'imported'].includes(c.stage))
    || cycles.data[0]
  if (!active) return
  const r = await api.get(`/reviews/cycles/${active.id}/dashboard`)
  data.value = r.data
}

async function advance() {
  busy.value = true
  try {
    await api.post(`/reviews/cycles/${cycle.value.id}/advance-stage`)
    await load()
    toast.add({ severity: 'success', summary: 'Стадия переключена' })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}

onMounted(load)
</script>

<style scoped>
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1.4fr; gap: 12px; margin-top: 16px; }
.dist-row { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
.dist-row b { width: 16px; }
.dist-bar { flex: 1; background: #f1f5f9; border-radius: 4px; height: 14px; }
.dist-bar > div { height: 100%; border-radius: 4px; }
@media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
</style>
