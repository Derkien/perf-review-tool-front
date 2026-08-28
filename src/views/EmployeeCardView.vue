<template>
  <div class="page" v-if="emp">
    <AppBreadcrumbs :items="[{ label: 'Сотрудники', to: '/staff' }, { label: emp.full_name }]" />
    <h1>{{ emp.full_name }}</h1>
    <Tabs value="overview">
      <TabList>
        <Tab value="overview"><i class="pi pi-id-card" />&nbsp; Обзор</Tab>
        <Tab value="comp"><i class="pi pi-bolt" />&nbsp; Компетенции</Tab>
        <Tab v-if="perms.pay" value="pay"><i class="pi pi-wallet" />&nbsp; Проплачен­ность</Tab>
        <Tab v-if="perms.efficiency" value="eff"><i class="pi pi-chart-line" />&nbsp; Эффективность</Tab>
        <Tab value="review"><i class="pi pi-history" />&nbsp; Ревью</Tab>
      </TabList>
      <TabPanels>
        <!-- ОБЗОР -->
        <TabPanel value="overview">
          <Card style="max-width: 640px">
            <template #title>Профиль</template>
            <template #content>
              <div class="kv"><span>Должность</span><b>{{ emp.position || '—' }}</b></div>
              <div class="kv">
                <span>Грейд</span>
                <span class="grade-cell">
                  <Tag :value="emp.grade" style="cursor: pointer" @click="openGradeModal(emp.grade)" />
                  <i class="pi pi-info-circle muted grade-info"
                     v-tooltip.top="'Требования грейда и матрица компетенций'"
                     @click="openGradeModal(emp.grade)" />
                </span>
              </div>
              <div class="kv"><span>Команда</span><b>{{ emp.org_unit || '—' }}</b></div>
              <div class="kv">
                <span>Лин. рукль</span>
                <b>
                  <router-link v-if="managerLink(emp.manager) && canLinkManagers"
                               :to="`/staff/${emp.manager_id}`" class="person-link">{{ emp.manager || '—' }}</router-link>
                  <template v-else>{{ emp.manager || '—' }}</template>
                </b>
              </div>
              <div class="kv">
                <span>Функц. рукль</span>
                <b>
                  <router-link v-if="managerLink(emp.functional_manager) && canLinkManagers"
                               :to="`/staff/${emp.functional_manager_id}`" class="person-link">{{ emp.functional_manager || '—' }}</router-link>
                  <template v-else>{{ emp.functional_manager || '—' }}</template>
                </b>
              </div>
              <div class="kv"><span>Дата найма</span><b>{{ emp.hire_date || '—' }}</b></div>
              <div class="kv" v-if="emp.intranet_url"><span>Интранет</span>
                <a :href="emp.intranet_url" target="_blank" class="person-link">профиль <i class="pi pi-external-link" style="font-size:.7rem" /></a>
              </div>
              <template v-if="emp.sensitive">
                <div class="kv"><span>Зарплата (оклад)</span>
                  <b>{{ emp.sensitive.salary.toLocaleString('ru') }} ₽</b></div>
                <div class="kv"><span>Премия УУ</span>
                  <b>{{ Math.round(emp.sensitive.premium_pct * 100) }}%
                    ({{ Math.round(emp.sensitive.salary * emp.sensitive.premium_pct).toLocaleString('ru') }} ₽)</b></div>
                <div class="kv"><span>Бонус (квартальный)</span>
                  <b>{{ emp.quarterly_bonus ? emp.quarterly_bonus.toLocaleString('ru') + ' ₽' : '—' }}</b></div>
              </template>
            </template>
          </Card>
        </TabPanel>

        <!-- КОМПЕТЕНЦИИ -->
        <TabPanel value="comp">
          <div class="comp-head">
            <SelectButton v-model="compKind" :options="compKinds" option-label="label" option-value="value" />
            <Button v-if="perms.edit_marks || perms.is_self" :label="markMode ? 'Закрыть разметку' : 'Внести разметку'"
                    :severity="markMode ? 'secondary' : 'primary'" size="small" @click="markMode = !markMode" />
          </div>
          <div v-if="radar && radar.axis?.length">
            <RadarChart :axis="radar.axis" :self="radar.self" :manager="radar.manager"
                        :norm="radar.norm" :session1="compare1" :session2="compare2" :height="compHeight" />
            <div v-if="radar.summary" class="radar-summary">
              <Message v-if="radar.summary.overestimated?.length" severity="warn" :sticky="true">
                Переоценка (сотрудник ставит себе выше рукля):
                {{ radar.summary.overestimated.join(', ') }}
              </Message>
              <Message v-if="radar.summary.growth_zones?.length" severity="info" :sticky="true">
                Зоны роста (рукль ставит выше самооценки): {{ radar.summary.growth_zones.join(', ') }}
              </Message>
            </div>
          </div>
          <p v-else class="muted">Разметок по этому типу пока нет{{
            markMode ? '' : ' — нажмите «Внести разметку»' }}.</p>

          <!-- форма разметки -->
          <Card v-if="markMode" style="margin-top: 12px">
            <template #title>Разметка ({{ perms.is_self && !perms.edit_marks ? 'самооценка' : 'руководитель' }})</template>
            <template #content>
              <div class="mark-form-head">
                <label>Дата <InputText v-model="markDate" type="date" size="small" /></label>
              </div>
              <div class="mark-table">
                <div v-for="row in matrixRows" :key="row.item_id" class="mark-row">
                  <span class="mark-name" v-tooltip.top="rowLevel(row)">{{ row.item }}</span>
                  <Dropdown v-model="markDraft[row.item_id]" :options="gradeOptions"
                            option-label="label" option-value="value" filter placeholder="—" size="small"
                            :virtual-scroller-options="{ itemSize: 30 }" />
                </div>
              </div>
              <Button label="Сохранить разметку" size="small" :loading="busy" @click="saveMarks" />
            </template>
          </Card>

          <!-- таблица разметки -->
          <h2>Текущая разметка</h2>
          <DataTable v-if="matrixRows.length" :value="matrixRows" size="small" scrollable scroll-height="320px">
            <Column field="item" header="Компетенция" />
            <Column header="Самооценка">
              <template #body="{ data: r }">
                <Tag v-if="r.self" :value="`${r.self.level} · ${r.self.weight}`" severity="warn" />
                <span v-else class="muted">—</span>
              </template>
            </Column>
            <Column header="Руководитель">
              <template #body="{ data: r }">
                <Tag v-if="r.manager" :value="`${r.manager.level} · ${r.manager.weight}`" severity="info" />
                <span v-else class="muted">—</span>
              </template>
            </Column>
            <Column header="Расхождение">
              <template #body="{ data: r }">
                <b v-if="r.self && r.manager"
                   :style="{ color: Math.abs(r.manager.weight - r.self.weight) >= 2 ? '#dc2626' : Math.abs(r.manager.weight - r.self.weight) >= 1 ? '#f59e0b' : '#16a34a' }">
                  {{ (r.manager.weight - r.self.weight > 0 ? '+' : '') + (r.manager.weight - r.self.weight) }}
                </b>
                <span v-else class="muted">—</span>
              </template>
            </Column>
          </DataTable>

          <!-- история сессий с чекбоксами сравнения -->
          <h2>История разметок (сравнение: отметьте до двух)</h2>
          <DataTable :value="sessions" size="small" style="max-width: 720px">
            <Column header="✓">
              <template #body="{ data: s }">
                <Checkbox :model-value="compareDates.includes(s.date)" :disabled="compareDates.length >= 2 && !compareDates.includes(s.date)"
                          binary @update:model-value="toggleCompare(s.date)" />
              </template>
            </Column>
            <Column field="date" header="Дата" />
            <Column field="kind" header="Тип">
              <template #body="{ data: s }">
                <Tag :value="s.kind" :severity="s.kind === 'hard' ? 'warn' : 'info'" />
              </template>
            </Column>
            <Column field="assessor_kind" header="Чья">
              <template #body="{ data: s }">
                {{ s.assessor_kind === 'self' ? 'самооценка' : 'руководитель' }}
              </template>
            </Column>
            <Column field="assessor" header="Кто заполнял" />
            <Column field="marks" header="Пунктов" />
          </DataTable>

          <h2>Динамика навыков (руководительская разметка)</h2>
          <div v-if="dynamics.length" style="max-width: 720px">
            <SparkLine :width="600" :height="80"
                       :points="dynamics.map((d: any) => ({ label: d.date, value: d.avg_weight }))" />
            <DataTable :value="dynamics" size="small" style="max-width: 360px">
              <Column field="date" header="Дата" />
              <Column field="avg_weight" header="Средний вес (1–10)" />
              <Column field="items" header="Пунктов" />
            </DataTable>
          </div>
          <p v-else class="muted">пока одна разметка — динамика появится после второй</p>
        </TabPanel>

        <!-- ПРОПЛАЧЕННОСТЬ -->
        <TabPanel v-if="perms.pay" value="pay">
          <Card style="max-width: 640px">
            <template #title>Вилка АМТ и положение</template>
            <template #content>
              <BandBar :band="emp.sensitive?.band" :position="emp.sensitive?.band_position"
                       :salary-total="emp.sensitive?.salary_total || 0"
                       :advice="emp.sensitive?.band_advice" />
              <div class="band-meta muted" v-if="emp.sensitive?.band?.amt_code">
                {{ emp.sensitive.band.amt_code }} · грейд AMT {{ emp.sensitive.band.amt_grade }}
                <span v-if="emp.sensitive.band.qualification"> · {{ emp.sensitive.band.qualification }}</span>
              </div>
            </template>
          </Card>
          <Card style="margin-top: 12px; max-width: 720px">
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

        <!-- ЭФФЕКТИВНОСТЬ -->
        <TabPanel v-if="perms.efficiency" value="eff">
          <SelectButton v-model="effKind" :options="[{label: 'Эффективность', value: 'efficiency'}, {label: 'Светофор', value: 'traffic'}]"
                        option-label="label" option-value="value" style="margin-bottom: 12px" />
          <template v-if="effKind === 'efficiency'">
            <Card style="max-width: 760px">
              <template #title>PersonalEfficiency — помесячно</template>
              <template #content>
                <SparkLine v-if="effRows.length" :width="640" :height="100"
                           :points="effRows.map((e: any) => ({ label: e.month, value: e.value }))" />
                <div class="trend-line" v-if="effTrend">
                  Тренд: <b :style="{ color: effTrend.color }">{{ effTrend.text }}</b>
                  ({{ effTrend.from }} → {{ effTrend.to }}, {{ effTrend.delta > 0 ? '+' : '' }}{{ effTrend.delta }})
                </div>
                <DataTable :value="effRows" size="small" style="max-width: 480px">
                  <Column field="month" header="Месяц" sortable />
                  <Column field="value" header="Result" sortable />
                </DataTable>
                <p v-if="!effRows.length" class="muted">нет данных</p>
              </template>
            </Card>
            <Card v-if="effParams.length" style="margin-top: 12px; max-width: 760px">
              <template #title>Аналитика параметров</template>
              <template #content>
                <DataTable :value="effParams" size="small">
                  <Column field="code" header="Код" />
                  <Column field="last" header="Последнее" />
                  <Column field="prev" header="Предыдущее" />
                  <Column header="Тренд">
                    <template #body="{ data: p }">
                      <Tag :value="p.dir" :severity="p.dir === 'рост' ? 'success' : p.dir === 'спад' ? 'danger' : 'secondary'" />
                    </template>
                  </Column>
                </DataTable>
                <div class="reco">
                  <b>Рекомендации:</b>
                  <ul>
                    <li v-for="(r, i) in effRecommendations" :key="i">{{ r }}</li>
                    <li v-if="!effRecommendations.length">в целом всё стабильно — значимых отклонений нет</li>
                  </ul>
                </div>
              </template>
            </Card>
          </template>
          <template v-else>
            <Card style="max-width: 760px">
              <template #title>Светофор — помесячно</template>
              <template #content>
                <div v-if="perms.edit_traffic" style="margin-bottom: 10px">
                  <Button label="Внести значение" size="small" @click="trafficDialog = true" />
                </div>
                <div class="traffic-chips">
                  <span v-for="t in trafficRows" :key="t.month" class="traffic-chip"
                        :class="trafficClass(t)" v-tooltip.top="t.comment || t.month">
                    {{ t.month }} · {{ t.value }}
                    <i v-if="t.source === 'manual'" class="pi pi-user-edit" style="font-size:.65rem" />
                  </span>
                </div>
                <p v-if="!trafficRows.length" class="muted">нет данных</p>
              </template>
            </Card>
          </template>
        </TabPanel>

        <!-- РЕВЬЮ -->
        <TabPanel value="review">
          <div class="cycle-list">
            <div v-for="c in cycles" :key="c.id" class="cycle-row"
                 :class="{ active: selectedCycle === c.id }" @click="openResult(c.id)">
              <i class="pi" :class="selectedCycle === c.id ? 'pi-chevron-down' : 'pi-chevron-right'" />
              <b>{{ c.name }}</b>
              <Tag :value="stageLabel(c.stage)" severity="secondary" />
            </div>
          </div>
          <div v-if="result" class="result">
            <div class="grid-2">
              <Card>
                <template #title>Достижения и оценки</template>
                <template #content>
                  <DataTable v-if="result.achievements_table?.length" :value="result.achievements_table" size="small">
                    <Column header="Достижение">
                      <template #body="{ data: a }"><span class="ach-text">{{ a.text }}</span></template>
                    </Column>
                    <Column header="Своя">
                      <template #body="{ data: a }"><b>{{ a.self_rating || '—' }}</b></template>
                    </Column>
                    <Column header="Пиры">
                      <template #body="{ data: a }">
                        <b v-if="a.peer_avg">{{ a.peer_letter }} ({{ a.peer_avg }})</b>
                        <span v-else class="muted">—</span>
                      </template>
                    </Column>
                    <Column header="Рукль">
                      <template #body="{ data: a }">
                        <b v-if="a.manager_avg">{{ a.manager_letter }} ({{ a.manager_avg }})</b>
                        <span v-else class="muted">—</span>
                      </template>
                    </Column>
                  </DataTable>
                  <p v-else class="muted">селф-ревью не отправлялось</p>
                  <div v-if="result.self_review?.can_edit || result.self_review?.can_request_edit" class="edit-line">
                    <Button v-if="result.self_review.can_edit" label="Поправить селф-ревью" size="small" text
                            @click="startSelfEdit" />
                    <template v-else-if="result.self_review.can_request_edit">
                      <InputText v-model="editRequestComment" placeholder="Что поправить и почему" size="small" />
                      <Button label="Запросить редактирование" size="small" severity="warn"
                              :disabled="!editRequestComment.trim()" :loading="busy" @click="requestEdit" />
                    </template>
                  </div>
                  <Message v-if="result.self_review?.status === 'edit-requested'" severity="info">
                    Запрос на редактирование отправлен — ждём руководителя.
                  </Message>
                </template>
              </Card>
              <Card>
                <template #title>Оценки и грейд</template>
                <template #content>
                  <div class="kv"><span>Грейд на момент ревью</span><b>{{ result.grade_at_review || '—' }}</b></div>
                  <div class="kv"><span>Харды (средний вес 1–10)</span>
                    <b>{{ result.comp_summary?.hard ?? '—' }}</b></div>
                  <div class="kv"><span>Софты (средний вес 1–10)</span>
                    <b>{{ result.comp_summary?.soft ?? '—' }}</b></div>
                  <div v-for="la in result.leader_assessments" :key="la.kind" class="kv">
                    <span>{{ la.kind === 'line' ? 'Линейный' : 'Функциональный' }}</span>
                    <b>{{ la.rating || '—' }} · софт {{ la.grade_soft || '—' }} / хард {{ la.grade_hard || '—' }}</b>
                  </div>
                </template>
              </Card>
            </div>
            <Card v-if="result.decision" style="margin-top: 12px">
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
                <div v-if="result.decision.final_comment" class="kv final-comment">
                  <span>Комментарий по итогу</span>
                  <b>{{ result.decision.final_comment }}</b>
                </div>
              </template>
            </Card>
            <!-- редактирование селф-ревью -->
            <Card v-if="selfEditing" style="margin-top: 12px">
              <template #title>Правка селф-ревью</template>
              <template #content>
                <AchievementEditor v-model="draftAchievements" :limits="limits" />
                <Button label="Сохранить и отправить" size="small" :loading="busy" @click="saveSelfEdit" />
              </template>
            </Card>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <!-- модалка требований грейда -->
    <Dialog v-model:visible="gradeModal" modal :header="`Грейд: ${gradeModalGrade}`" style="width: 720px">
      <DataTable :value="gradeDescriptions" size="small" scrollable scroll-height="420px">
        <Column field="specialty" header="Матрица" />
        <Column field="item" header="Компетенция" />
        <Column header="Требование">
          <template #body="{ data: g }">
            <span class="small">{{ g.description }}</span>
          </template>
        </Column>
      </DataTable>
    </Dialog>

    <!-- модалка ручного светофора -->
    <Dialog v-model:visible="trafficDialog" modal header="Внести значение светофора" style="width: 480px">
      <div class="traffic-form">
        <label>Месяц <InputText v-model="trafficForm.month" placeholder="2026-08" size="small" /></label>
        <label>Значение <InputNumber v-model="trafficForm.value" :min-fraction-digits="2" :max-fraction-digits="2" size="small" /></label>
        <label>Комментарий (обязателен) <Textarea v-model="trafficForm.comment" rows="2" class="w100" /></label>
        <label>План коррекции (при жёлтом) <Textarea v-model="trafficForm.correction_plan" rows="2" class="w100" /></label>
        <label>Дата расставания (при красном) <InputText v-model="trafficForm.dismissal_date" type="date" size="small" /></label>
        <Button label="Сохранить" size="small" :loading="busy" @click="saveTraffic" />
        <span class="muted small">Жёлтый требует план коррекции, красный — дату расставания. Всё фиксируется в аудите.</span>
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Checkbox from 'primevue/checkbox'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import AchievementEditor from '../components/AchievementEditor.vue'
import AppBreadcrumbs from '../components/AppBreadcrumbs.vue'
import BandBar from '../components/BandBar.vue'
import RadarChart from '../components/RadarChart.vue'
import SparkLine from '../components/SparkLine.vue'
import { api, errMsg } from '../api'
import { useToast } from 'primevue/usetoast'

const route = useRoute()
const toast = useToast()
const emp = ref<any>(null)
const perms = ref<any>({})
const cycles = ref<any[]>([])
const salaryHistory = ref<any[]>([])
const selectedCycle = ref<number | null>(null)
const result = ref<any>(null)
const busy = ref(false)
const editRequestComment = ref('')
const selfEditing = ref(false)
const draftAchievements = ref<any[]>([])
const limits = ref<any>({ self_min_ach: 2, self_max_ach: 4, self_max_chars: 300 })
const grades = ref<string[]>([])

// компетенции
const compKind = ref('hard')
const compKinds = [
  { label: 'Харды', value: 'hard' },
  { label: 'Софты', value: 'soft' },
]
const radar = ref<any>(null)
const matrixRows = ref<any[]>([])
const sessions = ref<any[]>([])
const dynamics = ref<any[]>([])
const compareDates = ref<string[]>([])
const markMode = ref(false)
const markDate = ref(new Date().toISOString().slice(0, 10))
const markDraft = ref<Record<number, string>>({})
const gradeOptions = ref<{ label: string; value: string }[]>([])
const compHeight = ref('360px')

// эффективность
const effKind = ref('efficiency')
const trafficDialog = ref(false)
const trafficForm = ref<any>({ month: '', value: null, comment: '', correction_plan: '', dismissal_date: '' })

// грейд-модалка
const gradeModal = ref(false)
const gradeModalGrade = ref('')
const gradeDescriptions = ref<any[]>([])

const decisionLabels: Record<string, string> = {
  keep: 'оставить как есть', 'next-cycle': 'рассмотреть в следующем цикле',
  'grade-nomination': 'номинация на грейд', 'raise-now': 'повышение сейчас',
  'raise-later': 'повышение позже',
}
const stageNames: Record<string, string> = {
  preparation: 'подготовка', 'self-review': 'сбор ачивок', 'peer-review': 'оценки пиров',
  'leader-assessment': 'предоценки', calibration: 'калибровки', decision: 'решения',
  closed: 'закрыт', imported: 'импортирован',
}

const canLinkManagers = computed(() => perms.value.is_manager_view || perms.value.is_self)
const effRows = computed(() => emp.value?.efficiency || [])
const trafficRows = computed(() => emp.value?.traffic || [])

const effTrend = computed(() => {
  const rows = effRows.value
  if (rows.length < 2) return null
  const from = rows[0].value, to = rows[rows.length - 1].value
  const delta = Math.round((to - from) * 100) / 100
  return {
    from, to, delta,
    text: delta > 0.3 ? 'рост' : delta < -0.3 ? 'спад' : 'стабильно',
    color: delta > 0.3 ? '#16a34a' : delta < -0.3 ? '#dc2626' : '#475569',
  }
})

const effParams = computed(() => {
  const rows = effRows.value
  if (rows.length < 2) return []
  const codes = new Set<string>()
  rows.forEach((r: any) => Object.keys(r.params || {}).forEach((c) => codes.add(c)))
  return Array.from(codes).map((code) => {
    const vals = rows.map((r: any) => r.params?.[code]).filter((v: number | null) => v != null)
    const last = vals[vals.length - 1], prev = vals[vals.length - 2] ?? last
    const d = last - prev
    return { code, last, prev, dir: d > 0.05 ? 'рост' : d < -0.05 ? 'спад' : 'ровно' }
  })
})

const effRecommendations = computed(() => {
  const out: string[] = []
  const downs = effParams.value.filter((p) => p.dir === 'спад')
  const ups = effParams.value.filter((p) => p.dir === 'рост')
  if (downs.length) out.push(`Подтянуть параметры со спадом: ${downs.map((p) => p.code).join(', ')} — обсудить причины на 1-1`)
  if (ups.length) out.push(`Растущие параметры (${ups.map((p) => p.code).join(', ')}) — закрепить успех, использовать как сильные стороны`)
  if (effTrend.value?.text === 'спад') out.push('Общий тренд эффективности снижается — нужна корректировка нагрузки/задач')
  if (effTrend.value?.text === 'рост') out.push('Общий тренд положительный — кандидат на повышенную сложность задач')
  return out
})

const compare1 = computed(() => (compareDates.value[0] ? radar.value?.session_1 : null))
const compare2 = computed(() => (compareDates.value[1] ? radar.value?.session_2 : null))

function managerLink(name?: string | null): boolean {
  return !!name
}
function rowLevel(row: any): string {
  const lvl = row.manager?.level || row.self?.level
  return (lvl && row.descriptions?.[lvl]) || 'описания нет — справочник матрицы'
}
function stageLabel(s: string) { return stageNames[s] || s }
function letterColor(l?: string) {
  const c = (l || ' ')[0]
  return { A: '#16a34a', B: '#65a30d', C: '#3b82f6', D: '#f59e0b', E: '#dc2626' }[c] || '#334155'
}
function trafficClass(t: any): string {
  if (t.label) return t.label.startsWith('зел') ? 't-green' : t.label.startsWith('жёл') ? 't-yellow' : 't-red'
  return t.value >= 5.2 ? 't-green' : t.value >= 4.2 ? 't-yellow' : 't-red'
}

onMounted(async () => {
  const id = route.params.id
  const pub = (await api.get('/admin/settings/public')).data
  limits.value = pub
  grades.value = pub.grades || []
  gradeOptions.value = grades.value.map((g, i) => ({ label: `${g} · ${i + 1}`, value: g }))
  emp.value = (await api.get(`/staff/employees/${id}`)).data
  perms.value = emp.value.permissions || {}
  cycles.value = (await api.get('/reviews/cycles')).data
  if (perms.value.pay) {
    try { salaryHistory.value = (await api.get(`/staff/employees/${id}/salary-history`)).data } catch { /* нет */ }
  }
  await loadComp()
})

async function loadComp() {
  const id = route.params.id
  try {
    radar.value = (await api.get(`/competencies/employees/${id}/radar`, { params: { kind: compKind.value } })).data
  } catch { radar.value = null }
  try {
    matrixRows.value = (await api.get(`/competencies/employees/${id}/matrix`, { params: { kind: compKind.value } })).data
    matrixRows.value.forEach((r) => {
      markDraft.value[r.item_id] = (perms.value.edit_marks ? r.manager?.level : r.self?.level) || ''
    })
  } catch { matrixRows.value = [] }
  try {
    sessions.value = (await api.get(`/competencies/employees/${id}/sessions`, { params: { kind: compKind.value } })).data
  } catch { sessions.value = [] }
  try {
    dynamics.value = (await api.get(`/competencies/employees/${id}/dynamics`, { params: { kind: compKind.value } })).data
  } catch { dynamics.value = [] }
}

watch(compKind, () => { compareDates.value = []; loadComp() })

async function toggleCompare(date: string) {
  if (compareDates.value.includes(date)) {
    compareDates.value = compareDates.value.filter((d) => d !== date)
  } else {
    compareDates.value = [...compareDates.value, date].slice(-2)
  }
  if (compareDates.value.length) {
    const joined = compareDates.value.join('|')
    radar.value = (await api.get(`/competencies/employees/${route.params.id}/radar`, {
      params: { kind: compKind.value, compare_sessions: joined },
    })).data
  } else {
    await loadComp()
  }
}

async function saveMarks() {
  busy.value = true
  const kind = perms.value.is_self && !perms.value.edit_marks ? 'self' : 'manager'
  try {
    let saved = 0
    for (const row of matrixRows.value) {
      const level = markDraft.value[row.item_id]
      if (!level) continue
      await api.post('/competencies/marks', {
        employee_id: Number(route.params.id), item_id: row.item_id, level,
        assessed_on: markDate.value, assessor_kind: kind,
      })
      saved++
    }
    toast.add({ severity: 'success', summary: `Разметка сохранена (${saved} пунктов)` })
    markMode.value = false
    await loadComp()
    emp.value = (await api.get(`/staff/employees/${route.params.id}`)).data
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}

async function openGradeModal(grade: string) {
  gradeModalGrade.value = grade
  gradeModal.value = true
  try {
    gradeDescriptions.value = (await api.get(`/competencies/employees/${route.params.id}/matrix`)).data
      .map((r: any) => ({ specialty: r.specialty, item: r.item, description: r.descriptions?.[grade] || '—' }))
      .filter((r: any) => r.description !== '—')
  } catch { gradeDescriptions.value = [] }
  if (!gradeDescriptions.value.length) {
    gradeDescriptions.value = [{ specialty: '—', item: 'нет описания', description: `Для грейда «${grade}» описаний в матрицах пока нет — импортируйте актуальную матрицу компетенций` }]
  }
}

async function saveTraffic() {
  busy.value = true
  try {
    await api.post(`/staff/employees/${route.params.id}/traffic`, trafficForm.value)
    toast.add({ severity: 'success', summary: 'Светофор сохранён' })
    trafficDialog.value = false
    trafficForm.value = { month: '', value: null, comment: '', correction_plan: '', dismissal_date: '' }
    emp.value = (await api.get(`/staff/employees/${route.params.id}`)).data
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}

async function openResult(cycleId: number) {
  selectedCycle.value = selectedCycle.value === cycleId ? null : cycleId
  result.value = null
  selfEditing.value = false
  if (selectedCycle.value == null) return
  try {
    result.value = (await api.get(`/reviews/cycles/${cycleId}/result`, {
      params: { employee_id: route.params.id },
    })).data
    if (result.value?.self_review) draftAchievements.value = result.value.self_review.achievements || []
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось открыть результат', detail: errMsg(e) })
  }
}

function startSelfEdit() { selfEditing.value = true }

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
    selfEditing.value = false
    await openResult(selectedCycle.value!)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}
</script>

<style scoped>
.kv { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; }
.kv span { color: #64748b; flex-shrink: 0; }
.grid-2 { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; }
.grade-cell { display: inline-flex; gap: 6px; align-items: center; }
.grade-info { cursor: pointer; }
.person-link { color: #2563eb; text-decoration: none; }
.person-link:hover { text-decoration: underline; }
.comp-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.radar-summary { display: flex; flex-direction: column; gap: 6px; max-width: 760px; }
.mark-form-head { margin-bottom: 8px; }
.mark-table { max-height: 380px; overflow: auto; margin-bottom: 10px; }
.mark-row { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px dashed #f1f5f9; }
.mark-name { font-size: 0.85rem; cursor: help; }
.cycle-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; max-width: 640px; }
.cycle-row {
  display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 8px;
  border: 1px solid #e2e8f0; cursor: pointer; background: #fff;
}
.cycle-row:hover, .cycle-row.active { border-color: #3b82f6; background: #eff6ff; }
.cycle-row b { flex: 1; }
.ach-text { font-size: 0.82rem; }
.edit-line { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
.trend-line { margin: 8px 0 12px; font-size: 0.9rem; }
.reco { margin-top: 10px; font-size: 0.88rem; }
.reco ul { margin: 6px 0 0 18px; padding: 0; }
.traffic-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.traffic-chip { padding: 4px 10px; border-radius: 14px; font-size: 0.8rem; cursor: default; }
.t-green { background: #dcfce7; color: #14532d; }
.t-yellow { background: #fef9c3; color: #713f12; }
.t-red { background: #fee2e2; color: #7f1d1d; }
.traffic-form { display: flex; flex-direction: column; gap: 10px; }
.traffic-form label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; }
.w100 { width: 100%; box-sizing: border-box; }
.final-comment b { font-weight: 500; text-align: right; }
.small { font-size: 0.78rem; }
.band-meta { margin-top: 6px; }
@media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
</style>
