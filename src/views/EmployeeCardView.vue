<template>
  <div class="page" v-if="emp">
    <h1>{{ emp.full_name }}</h1>
    <Tabs value="0">
      <TabList>
        <Tab value="overview"><i class="pi pi-id-card" /> Обзор</Tab>
        <Tab value="comp"><i class="pi pi-bolt" /> Компетенции</Tab>
        <Tab value="history"><i class="pi pi-history" /> Ревью</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="overview">
          <div class="grid-2">
            <Card>
              <template #title>Профиль</template>
              <template #content>
                <div class="kv"><span>Должность</span><b>{{ emp.position || '—' }}</b></div>
                <div class="kv"><span>Грейд</span><Tag :value="emp.grade" /></div>
                <div class="kv"><span>Команда</span><b>{{ emp.org_unit || '—' }}</b></div>
                <div class="kv"><span>Лин. рукль</span><b>{{ emp.manager || '—' }}</b></div>
                <div class="kv"><span>Функц. рукль</span><b>{{ emp.functional_manager || '—' }}</b></div>
                <div class="kv"><span>Дата найма</span><b>{{ emp.hire_date || '—' }}</b></div>
                <div v-if="emp.sensitive" class="kv"><span>Зарплата (оклад)</span>
                  <b>{{ emp.sensitive.salary.toLocaleString('ru') }} ₽</b></div>
                <div v-if="emp.sensitive" class="kv"><span>Премия</span><b>{{ Math.round(emp.sensitive.premium_pct * 100) }}%</b></div>
              </template>
            </Card>
            <Card>
              <template #title>Вилка и динамика</template>
              <template #content>
                <BandBar v-if="emp.sensitive?.band" :band="emp.sensitive.band"
                         :position="emp.sensitive.band_position"
                         :salary-total="emp.sensitive.salary_total" />
                <p v-else-if="emp.sensitive" class="muted">Вилка не отображается для вашей роли</p>
                <div class="grid-2" style="margin-top: 18px">
                  <div>
                    <h2>Эффективность</h2>
                    <SparkLine v-if="emp.efficiency?.length"
                               :points="emp.efficiency.map((e: any) => ({ label: e.month, value: e.value }))" />
                    <p v-else class="muted">нет данных</p>
                  </div>
                  <div>
                    <h2>Светофор</h2>
                    <SparkLine v-if="emp.traffic?.length" color="#f59e0b"
                               :points="emp.traffic.map((e: any) => ({ label: e.month, value: e.value }))" />
                    <p v-else class="muted">нет данных</p>
                  </div>
                </div>
              </template>
            </Card>
          </div>
        </TabPanel>
        <TabPanel value="comp">
          <div v-if="radar && radar.axis.length">
            <RadarChart :axis="radar.axis" :current="radar.current" :prev="radar.prev ?? []" :norm="radar.norm" />
          </div>
          <p v-else class="muted">Оценок по матрице компетенций пока нет.</p>
          <h2>История разметок</h2>
          <DataTable :value="dynamics" size="small" scrollable scroll-height="260px">
            <Column field="date" header="Дата" sortable />
            <Column field="kind" header="Тип">
              <template #body="{ data: d }"><Tag :value="d.kind" :severity="d.kind === 'soft' ? 'info' : 'warn'" /></template>
            </Column>
            <Column field="item" header="Компетенция" />
            <Column field="level" header="Уровень" />
            <Column field="assessor" header="Асессор" />
          </DataTable>
        </TabPanel>
        <TabPanel value="history">
          <div v-for="c in cycles" :key="c.id" class="cycle-row">
            <b>{{ c.name }}</b> <Tag :value="c.stage" severity="secondary" />
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Card from 'primevue/card'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import Tag from 'primevue/tag'
import BandBar from '../components/BandBar.vue'
import SparkLine from '../components/SparkLine.vue'
import RadarChart from '../components/RadarChart.vue'
import { api } from '../api'

const route = useRoute()
const emp = ref<any>(null)
const radar = ref<any>(null)
const dynamics = ref<any[]>([])
const cycles = ref<any[]>([])

onMounted(async () => {
  const id = route.params.id
  emp.value = (await api.get(`/staff/employees/${id}`)).data
  try { radar.value = (await api.get(`/competencies/employees/${id}/radar`)).data } catch { /* нет доступа */ }
  try { dynamics.value = (await api.get(`/competencies/employees/${id}/dynamics`)).data } catch { /* пусто */ }
  try { cycles.value = (await api.get('/reviews/cycles')).data } catch { /* пусто */ }
})
</script>

<style scoped>
.kv { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.cycle-row { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
@media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
</style>
