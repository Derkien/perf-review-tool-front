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
              <div class="kv"><span>Грейд</span><Tag :value="emp.grade" /></div>
              <div class="kv"><span>Команда</span><b>{{ emp.org_unit || '—' }}</b></div>
              <div class="kv">
                <span>Лин. рукль</span>
                <b>
                  <router-link v-if="emp.manager && canLinkManagers" :to="`/staff/${emp.manager_id}`"
                               class="person-link">{{ emp.manager }}</router-link>
                  <template v-else>{{ emp.manager || '—' }}</template>
                </b>
              </div>
              <div class="kv">
                <span>Функц. рукль</span>
                <b>
                  <router-link v-if="emp.functional_manager && canLinkManagers"
                               :to="`/staff/${emp.functional_manager_id}`"
                               class="person-link">{{ emp.functional_manager }}</router-link>
                  <template v-else>{{ emp.functional_manager || '—' }}</template>
                </b>
              </div>
              <div class="kv"><span>Дата найма</span><b>{{ emp.hire_date || '—' }}</b></div>
              <div class="kv" v-if="emp.intranet_url"><span>Интранет</span>
                <a :href="emp.intranet_url" target="_blank" class="person-link">
                  профиль <i class="pi pi-external-link" style="font-size:.7rem" /></a>
              </div>
              <template v-if="emp.sensitive">
                <div class="kv"><span>Зарплата (оклад)</span>
                  <b>{{ emp.sensitive.salary.toLocaleString('ru') }} ₽</b></div>
                <div class="kv"><span>Премия УУ</span>
                  <b>{{ Math.round(emp.sensitive.premium_pct * 100) }}%
                    ({{ Math.round(emp.sensitive.salary * emp.sensitive.premium_pct).toLocaleString('ru') }} ₽)</b></div>
                <div class="kv"><span>Квартальный бонус</span>
                  <b>{{ emp.quarterly_bonus ? emp.quarterly_bonus.toLocaleString('ru') + ' ₽' : '—' }}</b></div>
              </template>
            </template>
          </Card>
        </TabPanel>

        <!-- КОМПЕТЕНЦИИ: |паутинка|инсайты| / история -->
        <TabPanel value="comp">
          <div class="comp-head">
            <SelectButton v-model="compKind" :options="compKinds" option-label="label" option-value="value" />
            <div class="comp-actions">
              <Button v-if="perms.edit_marks || perms.is_self"
                      :label="markMode ? 'Закрыть разметку' : 'Внести разметку'"
                      :severity="markMode ? 'secondary' : 'primary'" size="small" @click="markMode = !markMode" />
            </div>
          </div>
          <div class="comp-grid">
            <div class="comp-radar">
              <div class="radar-toolbar">
                <span class="muted small">веса 1–10 · норма грейда — серая</span>
                <Button icon="pi pi-search-plus" severity="secondary" size="small" outlined
                        v-tooltip.bottom="'Увеличить'" @click="radarBig = true" />
              </div>
              <RadarChart v-if="radar && radar.axis?.length" :axis="radar.axis" :self="radar.self"
                          :manager="radar.manager" :norm="radar.norm"
                          :session1="sessionSeries[0]" :session2="sessionSeries[1]" height="620px" />
              <p v-else class="muted">Разметок по этому типу пока нет{{
                markMode ? '' : ' — нажмите «Внести разметку»' }}.</p>
            </div>
            <div class="comp-insights">
              <h2 style="margin-top:0">Комментарии и инсайты</h2>
              <Message v-if="radar?.summary" severity="info" :sticky="true">
                Средние веса (1–10): самооценка <b>{{ radar.summary.avg_self }}</b>,
                руководитель <b>{{ radar.summary.avg_manager }}</b>, норма грейда <b>{{ radar.norm }}</b>
              </Message>
              <Message v-if="radar?.summary?.overestimated?.length" severity="warn" :sticky="true">
                Переоценка (себе выше, чем рукль): {{ radar.summary.overestimated.join(', ') }}
              </Message>
              <Message v-if="radar?.summary?.growth_zones?.length" severity="success" :sticky="true">
                Зоны роста (рукль выше самооценки): {{ radar.summary.growth_zones.join(', ') }}
              </Message>
            </div>
          </div>

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
                            option-label="label" option-value="value" filter placeholder="—" size="small" />
                </div>
              </div>
              <Button label="Сохранить разметку" size="small" :loading="busy" @click="saveMarks" />
            </template>
          </Card>

          <!-- история разметок -->
          <h2>История разметок</h2>
          <p class="muted" style="margin-top:0">
            Клик по строке — добавить/убрать сессию на паутинку (до двух сравнений).
          </p>
          <DataTable :value="sessions" size="small" style="max-width: 860px"
                     :row-class="sessionRowClass" @row-click="toggleCompare($event.data)">
            <Column header="">
              <template #body="{ data: s }">
                <i v-if="s.assessor_kind === 'manager'" class="pi"
                   :style="{ color: seriesColor(s), cursor: 'pointer' }"
                   :class="compareKeys.includes(sessionKey(s)) ? 'pi-check-circle' : 'pi-circle'" />
                <span v-else class="muted small">self</span>
              </template>
            </Column>
            <Column field="date" header="Дата" />
            <Column field="kind" header="Тип">
              <template #body="{ data: s }">
                <Tag :value="s.kind" :severity="s.kind === 'hard' ? 'warn' : 'info'" />
              </template>
            </Column>
            <Column field="assessor_kind" header="Чья">
              <template #body="{ data: s }">{{ s.assessor_kind === 'self' ? 'самооценка' : 'руководитель' }}</template>
            </Column>
            <Column field="assessor" header="Кто заполнял" />
            <Column field="marks" header="Пунктов" />
            <Column header="Действия">
              <template #body="{ data: s }">
                <span class="acts">
                  <i class="pi pi-download act" v-tooltip.top="'Скачать XLSX'"
                     @click.stop="downloadSession(s)" />
                  <i v-if="perms.edit_marks" class="pi pi-pencil act" v-tooltip.top="'Редактировать'"
                     @click.stop="openSessionEdit(s)" />
                  <i v-if="perms.edit_marks || perms.isAdmin" class="pi pi-trash act danger"
                     v-tooltip.top="perms.isAdmin ? 'Удалить (soft/hard)' : 'Удалить (soft)'"
                     @click.stop="deleteSession(s)" />
                </span>
              </template>
            </Column>
          </DataTable>
        </TabPanel>

        <!-- ПРОПЛАЧЕННОСТЬ -->
        <TabPanel v-if="perms.pay" value="pay">
          <Card style="max-width: 760px">
            <template #content>
              <BandBar :band="emp.sensitive?.band" :position="emp.sensitive?.band_position"
                       :salary="emp.sensitive?.salary || 0"
                       :premium-pct="emp.sensitive?.premium_pct || 0"
                       :bonus="emp.quarterly_bonus || 0"
                       :salary-total="emp.sensitive?.salary_total || 0"
                       :advice="emp.sensitive?.band_advice" />
            </template>
          </Card>
          <Card style="margin-top: 12px; max-width: 760px">
            <template #title>История изменений</template>
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
          <div class="comp-head">
            <SelectButton v-model="effKind" :options="effKinds" option-label="label" option-value="value" />
            <Button v-if="effKind === 'traffic' && perms.edit_traffic" label="Внести значение"
                    size="small" @click="trafficDialog = true" />
          </div>
          <template v-if="effKind === 'efficiency'">
            <Card style="max-width: 820px">
              <template #title>Эффективность — помесячно</template>
              <template #content>
                <SparkLine v-if="effRows.length" :width="700" :height="100"
                           :points="effRows.map((e: any) => ({ label: e.month, value: e.value }))" />
                <div class="trend-line" v-if="effTrend">
                  Тренд: <b :style="{ color: effTrend.color }">{{ effTrend.arrow }} {{ effTrend.text }}</b>
                  ({{ effTrend.from }} → {{ effTrend.to }}, {{ effTrend.delta > 0 ? '+' : '' }}{{ effTrend.delta }})
                </div>
                <DataTable :value="[...effRows].reverse()" size="small" style="max-width: 360px">
                  <Column field="month" header="Месяц" />
                  <Column field="value" header="Result" />
                </DataTable>
                <p v-if="!effRows.length" class="muted">нет данных</p>
              </template>
            </Card>
            <Card v-if="effParams.length" style="margin-top: 12px; max-width: 820px">
              <template #title>Аналитика параметров</template>
              <template #content>
                <DataTable :value="effParams" size="small">
                  <Column header="Параметр">
                    <template #body="{ data: p }">{{ paramLabel(p.code) }}</template>
                  </Column>
                  <Column header="Динамика">
                    <template #body="{ data: p }">
                      <SparkLine v-if="p.series.length > 1" :width="160" :height="36"
                                 :color="p.dir === 'спад' ? '#dc2626' : '#16a34a'"
                                 :points="p.series.map((v: number, i: number) => ({ label: effRows[i]?.month || '', value: v }))" />
                      <span v-else class="muted">одно значение</span>
                    </template>
                  </Column>
                  <Column header="Тренд">
                    <template #body="{ data: p }">
                      <span :style="{ color: p.dir === 'рост' ? '#16a34a' : p.dir === 'спад' ? '#dc2626' : '#64748b', fontSize: '1.1rem' }">
                        {{ p.dir === 'рост' ? '↑' : p.dir === 'спад' ? '↓' : '=' }}
                      </span>
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
            <Card style="max-width: 640px">
              <template #title>Светофор</template>
              <template #content>
                <DataTable :value="[...trafficRows].reverse()" size="small" style="max-width: 320px">
                  <Column field="month" header="Дата" />
                  <Column header="Значение">
                    <template #body="{ data: t }">
                      <span class="traffic-dot" :class="trafficClass(t)" />
                      {{ trafficLabel(t) }}
                      <i v-if="t.source === 'manual'" class="pi pi-user-edit muted" style="font-size:.65rem;margin-left:4px"
                         v-tooltip.top="t.comment" />
                    </template>
                  </Column>
                </DataTable>
                <p v-if="!trafficRows.length" class="muted">нет данных — импортируйте файл светофора</p>
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
                  <div class="kv"><span>Харды (средний вес 1–10)</span><b>{{ result.comp_summary?.hard ?? '—' }}</b></div>
                  <div class="kv"><span>Софты (средний вес 1–10)</span><b>{{ result.comp_summary?.soft ?? '—' }}</b></div>
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

    <!-- большая паутинка -->
    <Dialog v-model:visible="radarBig" modal :header="`Паутинка: ${compKind === 'hard' ? 'харды' : 'софты'}`"
            :style="{ width: '96vw' }" :content-style="{ height: '88vh' }" :maximizable="true">
      <RadarChart v-if="radar && radar.axis?.length" :axis="radar.axis" :self="radar.self"
                  :manager="radar.manager" :norm="radar.norm"
                  :session1="sessionSeries[0]" :session2="sessionSeries[1]" height="84vh" />
    </Dialog>

    <!-- редактирование сессии -->
    <Dialog v-model:visible="sessionEditVisible" modal header="Редактирование разметки" style="width: 640px">
      <div class="mark-table" style="max-height: 420px">
        <div v-for="row in sessionEditRows" :key="row.item_id" class="mark-row">
          <span class="mark-name">{{ row.item }}</span>
          <Dropdown v-model="sessionEditDraft[row.item_id]" :options="gradeOptions"
                    option-label="label" option-value="value" filter size="small" />
        </div>
      </div>
      <Button label="Сохранить изменения" size="small" :loading="busy" @click="saveSessionEdit" />
    </Dialog>

    <!-- ручной светофор -->
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
import { api, errMsg } from '../api/http'
import { competenciesApi, reviewsApi, staffApi } from '../api/endpoints'
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

// компетенции
const compKind = ref('hard')
const compKinds = [{ label: 'Харды', value: 'hard' }, { label: 'Софты', value: 'soft' }]
const radar = ref<any>(null)
const matrixRows = ref<any[]>([])
const sessions = ref<any[]>([])
const markMode = ref(false)
const markDate = ref(new Date().toISOString().slice(0, 10))
const markDraft = ref<Record<number, string>>({})
const gradeOptions = ref<{ label: string; value: string }[]>([])
const radarBig = ref(false)
const compareKeys = ref<string[]>([])
const sessionSeries = ref<any[]>([null, null])
const sessionEditVisible = ref(false)
const sessionEditRows = ref<any[]>([])
const sessionEditDraft = ref<Record<number, string>>({})

// эффективность
const effKind = ref('efficiency')
const effKinds = [{ label: 'Эффективность', value: 'efficiency' }, { label: 'Светофор', value: 'traffic' }]
const trafficDialog = ref(false)
const trafficForm = ref<any>({ month: '', value: null, comment: '', correction_plan: '', dismissal_date: '' })
const effLabels = ref<Record<string, string>>({})

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
    arrow: delta > 0.3 ? '↑' : delta < -0.3 ? '↓' : '=',
    color: delta > 0.3 ? '#16a34a' : delta < -0.3 ? '#dc2626' : '#475569',
  }
})

const effParams = computed(() => {
  const rows = effRows.value
  if (!rows.length) return []
  const codes = new Set<string>()
  rows.forEach((r: any) => Object.keys(r.params || {}).forEach((c) => codes.add(c)))
  return Array.from(codes).map((code) => {
    const series = rows.map((r: any) => r.params?.[code]).filter((v: number | null) => v != null)
    const last = series[series.length - 1], prev = series[series.length - 2] ?? last
    const d = last - prev
    return { code, series, dir: d > 0.05 ? 'рост' : d < -0.05 ? 'спад' : 'ровно' }
  })
})

const effRecommendations = computed(() => {
  const out: string[] = []
  const downs = effParams.value.filter((p) => p.dir === 'спад')
  const ups = effParams.value.filter((p) => p.dir === 'рост')
  if (downs.length) out.push(`Подтянуть параметры со спадом: ${downs.map((p) => paramLabel(p.code)).join(', ')} — обсудить причины на 1-1`)
  if (ups.length) out.push(`Растущие параметры (${ups.map((p) => paramLabel(p.code)).join(', ')}) — закрепить успех`)
  if (effTrend.value?.text === 'спад') out.push('Общий тренд эффективности снижается — корректировка нагрузки/задач')
  if (effTrend.value?.text === 'рост') out.push('Общий тренд положительный — кандидат на повышенную сложность задач')
  return out
})

function paramLabel(code: string): string {
  return effLabels.value[code] || `код ${code}`
}
function sessionKey(s: any): string {
  return `${s.kind}|${s.date}`
}
function seriesColor(s: any): string {
  const idx = compareKeys.value.indexOf(sessionKey(s))
  return idx === 0 ? '#9333ea' : idx === 1 ? '#0d9488' : '#94a3b8'
}
function sessionRowClass(data: any) {
  if (data.assessor_kind !== 'manager') return 'row-disabled'
  return compareKeys.value.includes(sessionKey(data)) ? 'row-selected' : ''
}
function rowLevel(row: any): string {
  const lvl = row.manager?.level || row.self?.level
  return (lvl && row.descriptions?.[lvl]) || 'описания нет'
}
function stageLabel(s: string) { return stageNames[s] || s }
function letterColor(l?: string) {
  const c = (l || ' ')[0]
  return { A: '#16a34a', B: '#65a30d', C: '#3b82f6', D: '#f59e0b', E: '#dc2626' }[c] || '#334155'
}
function trafficClass(t: any): string {
  return trafficLabel(t).startsWith('зел') ? 't-green' : trafficLabel(t).startsWith('жёл') ? 't-yellow' : 't-red'
}
function trafficLabel(t: any): string {
  if (t.label) return t.label
  return t.value >= 5.2 ? 'зелёный' : t.value >= 4.2 ? 'жёлтый' : 'красный'
}

onMounted(async () => {
  const id = String(route.params.id)
  const pub = await reviewsApi.publicSettings()
  limits.value = pub
  gradeOptions.value = (pub.grades || []).map((g: string, i: number) => ({ label: `${g} · ${i + 1}`, value: g }))
  effLabels.value = pub.eff_param_labels || {}
  emp.value = (await api.get(`/staff/employees/${id}`)).data
  perms.value = emp.value.permissions || {}
  cycles.value = (await api.get('/reviews/cycles')).data
  if (perms.value.pay) {
    try { salaryHistory.value = await staffApi.salaryHistory(id) } catch { /* нет */ }
  }
  await loadComp()
})

async function loadComp() {
  const id = String(route.params.id)
  try {
    radar.value = await competenciesApi.radar(id, compKind.value as 'hard' | 'soft')
  } catch { radar.value = null }
  try {
    matrixRows.value = await competenciesApi.matrix(id, compKind.value as 'hard' | 'soft')
    matrixRows.value.forEach((r) => {
      markDraft.value[r.item_id] = (perms.value.edit_marks ? r.manager?.level : r.self?.level) || ''
    })
  } catch { matrixRows.value = [] }
  try {
    sessions.value = await competenciesApi.sessions(id, compKind.value as 'hard' | 'soft')
  } catch { sessions.value = [] }
  compareKeys.value = []
  sessionSeries.value = [null, null]
}

watch(compKind, loadComp)

async function toggleCompare(s: any) {
  // самооценки на сравнение не добавляются — строки визуально недоступны (см. row-class)
  if (s.assessor_kind !== 'manager') return
  const key = sessionKey(s)
  if (compareKeys.value.includes(key)) {
    compareKeys.value = compareKeys.value.filter((k) => k !== key)
  } else {
    compareKeys.value = [...compareKeys.value, key].slice(-2)
  }
  await refreshCompareSeries()
}

async function refreshCompareSeries() {
  if (!compareKeys.value.length) {
    sessionSeries.value = [null, null]
    return
  }
  // контракт API: compare_sessions = ISO-даты через | (kind передаётся отдельным параметром)
  const dates = compareKeys.value.map((k) => k.split('|')[1])
  const r = await competenciesApi.radar(String(route.params.id), compKind.value as 'hard' | 'soft', dates)
  sessionSeries.value = [r.session_1 || null, r.session_2 || null]
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
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}

async function downloadSession(s: any) {
  const url = competenciesApi.sessionXlsxUrl(String(route.params.id), s.kind, s.date)
  const a = document.createElement('a')
  a.href = url
  a.download = `marking-${route.params.id}-${s.kind}-${s.date}.xlsx`
  a.click()
}

async function openSessionEdit(s: any) {
  sessionEditDraft.value = {}
  const rows = (await api.get(`/competencies/employees/${route.params.id}/matrix`, {
    params: { kind: s.kind },
  })).data
  sessionEditRows.value = rows
  rows.forEach((r: any) => {
    const lvl = s.assessor_kind === 'self' ? r.self?.level : r.manager?.level
    if (lvl && r.self?.date === s.date || r.manager?.date === s.date) sessionEditDraft.value[r.item_id] = lvl
  })
  sessionEditVisible.value = true
}

async function saveSessionEdit() {
  const key = compareKeys.value // сессия редактируется последней открытой? берём первую из выбранных или последнюю сессию
  const s = sessions.value.find((x) => sessionKey(x) === key[0]) || sessions.value[0]
  if (!s) return
  busy.value = true
  try {
    const r = await api.patch(
      `/competencies/employees/${route.params.id}/sessions/${s.kind}/${s.date}`,
      { levels: sessionEditDraft.value })
    toast.add({ severity: 'success', summary: `Изменено пунктов: ${Object.keys(r.data.changed || {}).length} (аудит записан)` })
    sessionEditVisible.value = false
    await loadComp()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  } finally { busy.value = false }
}

async function deleteSession(s: any) {
  const hard = perms.value.isAdmin && window.confirm(
    `OK — soft delete (скрыть).\nОтмена — окончательное удаление (hard).\n${s.kind} ${s.date}`)
  const useHard = hard ? window.confirm('Точно удалить НАВСЕГДА?') : false
  try {
    await api.delete(`/competencies/employees/${route.params.id}/sessions/${s.kind}/${s.date}`,
                     { params: { hard: useHard } })
    toast.add({ severity: 'success', summary: useHard ? 'Удалено навсегда' : 'Скрыто (soft delete)' })
    await loadComp()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e) })
  }
}

async function saveTraffic() {
  busy.value = true
  try {
    await api.post(`/staff/employees/${route.params.id}/traffic`, trafficForm.value)
    toast.add({ severity: 'success', summary: 'Светофор сохранён' })
    trafficDialog.value = false
    trafficForm.value = { month: '', value: null, comment: '', correction_plan: '', dismissal_date: '' }
    emp.value = await staffApi.card(String(route.params.id))
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
    result.value = await reviewsApi.result(cycleId, String(route.params.id))
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
.person-link { color: #2563eb; text-decoration: none; }
.person-link:hover { text-decoration: underline; }
.comp-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.comp-actions { display: flex; gap: 8px; align-items: center; }
.comp-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; align-items: start; }
.radar-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
.radar-toolbar .small { font-size: 0.75rem; }
.mark-form-head { margin-bottom: 8px; }
.mark-table { max-height: 380px; overflow: auto; margin-bottom: 10px; }
.mark-row { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px dashed #f1f5f9; }
.mark-name { font-size: 0.85rem; cursor: help; }
:deep(.row-selected) { background: #f5f3ff !important; }
:deep(.row-disabled) { color: #94a3b8; cursor: default; }
.acts { display: inline-flex; gap: 10px; }
.act { cursor: pointer; color: #2563eb; }
.act.danger { color: #dc2626; }
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
.traffic-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
.t-green { background: #22c55e; }
.t-yellow { background: #eab308; }
.t-red { background: #ef4444; }
.traffic-form { display: flex; flex-direction: column; gap: 10px; }
.traffic-form label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; }
.w100 { width: 100%; box-sizing: border-box; }
.final-comment b { font-weight: 500; text-align: right; }
.small { font-size: 0.78rem; }
@media (max-width: 1000px) { .comp-grid, .grid-2 { grid-template-columns: 1fr; } }
</style>
