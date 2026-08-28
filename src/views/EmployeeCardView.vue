<template>
  <div class="page" v-if="emp">
    <AppBreadcrumbs :items="[{ label: 'Сотрудники', to: '/staff' }, { label: emp.full_name }]" />
    <h1>{{ emp.full_name }}</h1>
    <Tabs value="overview">
      <TabList>
        <Tab value="overview"><i class="pi pi-id-card" />&nbsp; Обзор</Tab>
        <Tab value="comp"><i class="pi pi-bolt" />&nbsp; Компетенции</Tab>
        <Tab v-if="emp.sensitive?.band" value="pay"><i class="pi pi-wallet" />&nbsp; Проплачен­ность</Tab>
        <Tab value="eff"><i class="pi pi-chart-line" />&nbsp; Эффективность</Tab>
        <Tab value="review"><i class="pi pi-history" />&nbsp; Ревью</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="overview">
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
              <div v-if="emp.sensitive" class="kv"><span>Премия</span>
                <b>{{ Math.round(emp.sensitive.premium_pct * 100) }}%</b></div>
              <div v-if="emp.sensitive?.band" class="kv"><span>В вилке</span>
                <b :class="zoneClass">{{ emp.sensitive.band_position_label }}</b></div>
            </template>
          </Card>
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
              <template #body="{ data: d }">
                <Tag :value="d.kind" :severity="d.kind === 'soft' ? 'info' : 'warn'" />
              </template>
            </Column>
            <Column field="item" header="Компетенция" />
            <Column field="level" header="Уровень" />
            <Column field="assessor" header="Асессор" />
          </DataTable>
        </TabPanel>

        <TabPanel v-if="emp.sensitive?.band" value="pay">
          <Card>
            <template #title>Вилка АМТ и положение</template>
            <template #content>
              <BandBar :band="emp.sensitive.band" :position="emp.sensitive.band_position"
                       :salary-total="emp.sensitive.salary_total"
                       :advice="emp.sensitive.band_advice" />
              <div class="band-meta muted" v-if="emp.sensitive.band.amt_code">
                {{ emp.sensitive.band.amt_code }} · грейд AMT {{ emp.sensitive.band.amt_grade }}
                <span v-if="emp.sensitive.band.qualification"> · {{ emp.sensitive.band.qualification }}</span>
              </div>
            </template>
          </Card>
          <Card style="margin-top: 12px">
            <template #title>История изменений ЗП</template>
            <template #content>
              <DataTable :value="salaryHistory" size="small">
                <Column field="date" header="Дата" sortable />
                <Column field="salary" header="Оклад">
                  <template #body="{ data: h }">{{ h.salary.toLocaleString('ru') }} ₽</template>
                </Column>
                <Column header="Премия">
                  <template #body="{ data: h }">{{ Math.round(h.premium_pct * 100) }}%</template>
                </Column>
                <Column field="grade" header="Грейд" />
                <Column field="reason" header="Основание" />
                <Column field="source" header="Источник" />
              </DataTable>
              <p v-if="!salaryHistory.length" class="muted">истории пока нет</p>
            </template>
          </Card>
        </TabPanel>

        <TabPanel value="eff">
          <div class="grid-2">
            <Card>
              <template #title>Эффективность (PersonalEfficiency)</template>
              <template #content>
                <SparkLine v-if="emp.efficiency?.length" :width="300" :height="70"
                           :points="emp.efficiency.map((e: any) => ({ label: e.month, value: e.value }))" />
                <p v-else class="muted">нет данных — импортируйте месячный файл PersonalEfficiency</p>
              </template>
            </Card>
            <Card>
              <template #title>Светофор (Traffic Lights)</template>
              <template #content>
                <SparkLine v-if="emp.traffic?.length" :width="300" :height="70" color="#f59e0b"
                           :points="emp.traffic.map((e: any) => ({ label: e.month, value: e.value }))" />
                <p v-else class="muted">нет данных — импортируйте месячный файл светофора</p>
              </template>
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="review">
          <div class="cycle-list">
            <div v-for="c in cycles" :key="c.id"
                 class="cycle-row" :class="{ active: selectedCycle === c.id }"
                 @click="openResult(c.id)">
              <b>{{ c.name }}</b>
              <Tag :value="stageLabel(c.stage)" severity="secondary" />
              <i class="pi pi-angle-down muted" />
            </div>
            <p v-if="!cycles.length" class="muted">циклов пока нет</p>
          </div>
          <div v-if="result" class="result">
            <h2>{{ result.cycle.name }} — результат</h2>
            <div class="grid-2">
              <Card>
                <template #title>Оценка достижений (пиры)</template>
                <template #content>
                  <template v-if="result.peer_stats">
                    <div class="kv"><span>Ответов пиров</span>
                      <b>{{ result.peer_stats.num_of_answers }} / {{ result.peer_stats.num_of_peers }}</b></div>
                    <div class="kv"><span>Средняя по достижениям</span>
                      <b>{{ result.peer_stats.avg_rating_num }} ({{ result.peer_stats.avg_rating }})</b></div>
                  </template>
                  <p v-else class="muted">оценок пиров нет</p>
                </template>
              </Card>
              <Card>
                <template #title>Оценки руководителей</template>
                <template #content>
                  <div v-for="la in result.leader_assessments" :key="la.kind" class="kv">
                    <span>{{ la.kind === 'line' ? 'Линейный' : 'Функциональный' }}</span>
                    <b>{{ la.rating || '—' }} · софт {{ la.grade_soft || '—' }} / хард {{ la.grade_hard || '—' }}</b>
                  </div>
                  <p v-if="!result.leader_assessments.length" class="muted">нет</p>
                </template>
              </Card>
            </div>
            <Card style="margin-top: 12px" v-if="result.decision">
              <template #title>Итоговая оценка и решение</template>
              <template #content>
                <div class="kv"><span>Итоговая оценка</span>
                  <b :style="{ color: letterColor(result.decision.final_rating) }">
                    {{ result.decision.final_rating || '—' }}</b></div>
                <div class="kv"><span>Решение</span>
                  <b>{{ decisionLabels[result.decision.decision] || result.decision.decision }}</b></div>
                <div v-if="result.decision.target_grade" class="kv"><span>Целевой грейд</span>
                  <b>{{ result.decision.target_grade }}</b></div>
                <div v-if="result.decision.raise_pct" class="kv"><span>Повышение</span>
                  <b>{{ result.decision.raise_pct }}%</b></div>
                <div v-if="result.decision.target_salary" class="kv"><span>Целевая ЗП</span>
                  <b>{{ result.decision.target_salary.toLocaleString('ru') }} ₽</b></div>
                <p v-if="result.decision.rationale" class="muted">{{ result.decision.rationale }}</p>
              </template>
            </Card>
            <Card style="margin-top: 12px" v-if="result.self_review">
              <template #title>Селф-ревью</template>
              <template #content>
                <div v-for="(a, i) in result.self_review.achievements" :key="i" class="ach">
                  <b class="muted">#{{ i + 1 }}</b>
                  <span v-if="a.self_rating" class="muted"> · самооценка {{ a.self_rating }}</span>
                  <p>{{ a.text }}</p>
                </div>
                <div v-if="result.self_review.edit_log?.length" class="edit-log">
                  <div class="muted">Журнал редактирования:</div>
                  <div v-for="(e, i) in result.self_review.edit_log" :key="i" class="muted small">
                    {{ new Date(e.at).toLocaleString('ru') }} · {{ editActionLabels[e.action] || e.action }} · {{ e.by }}
                    <span v-if="e.comment"> — {{ e.comment }}</span>
                  </div>
                </div>
                <div v-if="result.self_review.can_edit" class="edit-actions">
                  <Message severity="info">Редактирование доступно — можно поправить и отправить заново.</Message>
                  <AchievementEditor v-model="draftAchievements" :limits="limits" />
                  <Button label="Сохранить и отправить" size="small" :loading="busy" @click="saveSelfEdit" />
                </div>
                <div v-else-if="result.self_review.can_request_edit" class="edit-actions">
                  <Message severity="warn">Пир-ревью началось — для правки нужен запрос руководителю.</Message>
                  <InputText v-model="editRequestComment" placeholder="Что нужно поправить и почему" size="small" />
                  <Button label="Запросить редактирование" size="small" severity="warn"
                          :disabled="!editRequestComment.trim()" :loading="busy" @click="requestEdit" />
                </div>
                <Message v-else-if="result.self_review.status === 'edit-requested'" severity="info">
                  Запрос на редактирование отправлен — ждём подтверждения руководителя.
                </Message>
                <Message v-else-if="result.self_review.status === 'edit-open'" severity="success">
                  Руководитель открыл редактирование.
                </Message>
              </template>
            </Card>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import Tag from 'primevue/tag'
import AchievementEditor from '../components/AchievementEditor.vue'
import AppBreadcrumbs from '../components/AppBreadcrumbs.vue'
import BandBar from '../components/BandBar.vue'
import RadarChart from '../components/RadarChart.vue'
import SparkLine from '../components/SparkLine.vue'
import { api, errMsg } from '../api'
import { useAuth } from '../stores/auth'
import { useToast } from 'primevue/usetoast'

const route = useRoute()
const auth = useAuth()
const toast = useToast()
const emp = ref<any>(null)
const radar = ref<any>(null)
const dynamics = ref<any[]>([])
const cycles = ref<any[]>([])
const salaryHistory = ref<any[]>([])
const selectedCycle = ref<number | null>(null)
const result = ref<any>(null)
const busy = ref(false)
const editRequestComment = ref('')
const draftAchievements = ref<any[]>([])
const limits = ref<any>({ self_min_ach: 2, self_max_ach: 4, self_max_chars: 300 })

const decisionLabels: Record<string, string> = {
  keep: 'оставить как есть', 'next-cycle': 'рассмотреть в следующем цикле',
  'grade-nomination': 'номинация на грейд', 'raise-now': 'повышение сейчас',
  'raise-later': 'повышение позже',
}
const editActionLabels: Record<string, string> = {
  requested: 'запрошено', approved: 'подтверждено', declined: 'отклонено',
  'edited-before-peer-review': 'отредактировано до пир-ревью',
}
const stageNames: Record<string, string> = {
  preparation: 'подготовка', 'self-review': 'сбор ачивок', 'peer-review': 'оценки пиров',
  'leader-assessment': 'предоценки', calibration: 'калибровки', decision: 'решения',
  closed: 'закрыт', imported: 'импортирован',
}

const zoneClass = computed(() => {
  const z = emp.value?.sensitive?.band_position_label || ''
  if (z.includes('ниже')) return 'z-below'
  if (z.includes('выше')) return 'z-above'
  return 'z-in'
})
function stageLabel(s: string) { return stageNames[s] || s }
function letterColor(l?: string) {
  const c = (l || ' ')[0]
  return { A: '#16a34a', B: '#65a30d', C: '#3b82f6', D: '#f59e0b', E: '#dc2626' }[c] || '#334155'
}

onMounted(async () => {
  const id = route.params.id
  limits.value = (await api.get('/admin/settings/public')).data
  emp.value = (await api.get(`/staff/employees/${id}`)).data
  try { radar.value = (await api.get(`/competencies/employees/${id}/radar`)).data } catch { /* нет доступа */ }
  try { dynamics.value = (await api.get(`/competencies/employees/${id}/dynamics`)).data } catch { /* пусто */ }
  cycles.value = (await api.get('/reviews/cycles')).data
  if (['admin', 'cto', 'line-manager', 'functional-manager'].includes(auth.role)) {
    try { salaryHistory.value = (await api.get(`/staff/employees/${id}/salary-history`)).data } catch { /* нет */ }
  }
})

async function openResult(cycleId: number) {
  selectedCycle.value = cycleId
  result.value = null
  try {
    result.value = (await api.get(`/reviews/cycles/${cycleId}/result`, {
      params: { employee_id: route.params.id },
    })).data
    if (result.value?.self_review) {
      draftAchievements.value = result.value.self_review.achievements || []
    }
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось открыть результат', detail: errMsg(e) })
  }
}

async function requestEdit() {
  busy.value = true
  try {
    await api.post(`/reviews/self/${result.value.self_review.id}/edit-request`, null, {
      params: { comment: editRequestComment.value },
    })
    toast.add({ severity: 'success', summary: 'Запрос отправлен руководителю' })
    editRequestComment.value = ''
    await openResult(selectedCycle.value!)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}

async function saveSelfEdit() {
  busy.value = true
  try {
    await api.post('/reviews/self', {
      cycle_id: selectedCycle.value, achievements: draftAchievements.value, submit: true,
    })
    toast.add({ severity: 'success', summary: 'Селф-ревью обновлено' })
    await openResult(selectedCycle.value!)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}
</script>

<style scoped>
.kv { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; }
.kv span { color: #64748b; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.z-below { color: #b45309; } .z-above { color: #b91c1c; } .z-in { color: #15803d; }
.cycle-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.cycle-row {
  display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 8px;
  border: 1px solid #e2e8f0; cursor: pointer; background: #fff;
}
.cycle-row:hover, .cycle-row.active { border-color: #3b82f6; background: #eff6ff; }
.cycle-row b { flex: 1; }
.result { margin-top: 6px; }
.ach { border-left: 3px solid #cbd5e1; padding: 4px 10px; margin: 8px 0; }
.ach p { margin: 4px 0; white-space: pre-wrap; }
.edit-log { margin-top: 10px; border-top: 1px dashed #e2e8f0; padding-top: 6px; }
.edit-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.band-meta { margin-top: 6px; }
.small { font-size: 0.78rem; }
@media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
</style>
