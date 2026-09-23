<template>
  <div class="review-wrap">
    <div class="review-selector">
      <Select :model-value="selectedCycle" :options="cycleOptions"
                option-label="label" option-value="id"
                placeholder="Цикл ревью" class="w100" @update:model-value="openResult" />
    </div>

    <div v-if="result" class="review-blocks">
      <!-- 1. Итоговая оценка и решение -->
      <Card>
        <template #title>Итоговая оценка и решение</template>
        <template #content>
          <template v-if="result.decision">
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
              <b>{{ result.decision.final_comment }}</b></div>
          </template>
          <p v-else class="muted">решение ещё не принято</p>
        </template>
      </Card>

      <!-- 2. Оценки и грейд -->
      <Card style="margin-top: 12px">
        <template #title>Оценки и грейд</template>
        <template #content>
          <div class="kv"><span>Грейд на момент ревью</span>
            <b>{{ result.grade_at_review || '—' }}</b></div>
          <div class="kv"><span>Харды (средний вес 1–10)</span>
            <b class="radar-link" @click="openRadar('hard')">
              {{ result.comp_summary?.hard ?? '—' }} <i class="pi pi-gauge" /></b></div>
          <div class="kv"><span>Софты (средний вес 1–10)</span>
            <b class="radar-link" @click="openRadar('soft')">
              {{ result.comp_summary?.soft ?? '—' }} <i class="pi pi-gauge" /></b></div>
          <div v-if="result.peer_stats" class="kv"><span>Средняя пиров</span>
            <b>{{ result.peer_stats.avg_rating || '—' }}
              {{ result.peer_stats.avg_rating_num ? `(${result.peer_stats.avg_rating_num})` : '' }}</b></div>
          <template v-if="result.leader_assessments?.length">
            <div v-for="la in result.leader_assessments" :key="la.kind" class="kv">
              <span>Оценка руководителя ({{ la.kind === 'line' ? 'линейный' : 'функц.' }})</span>
              <b>{{ la.rating || '—' }}
                <span v-if="la.grade_soft || la.grade_hard" class="muted small">
                  софт {{ la.grade_soft || '—' }} / хард {{ la.grade_hard || '—' }}</span></b>
            </div>
          </template>
        </template>
      </Card>

      <!-- 3. Достижения: текст + оценки (своя/пиры/рукль) -->
      <Card style="margin-top: 12px">
        <template #title>Достижения</template>
        <template #content>
          <DataTable v-if="result.achievements_table?.length"
                     :value="result.achievements_table" size="small">
            <Column header="Достижение">
              <template #body="{ data: a }"><span class="ach-text">{{ a.text }}</span></template>
            </Column>
            <Column header="Своя" style="width: 64px">
              <template #body="{ data: a }"><b>{{ a.self_rating || '—' }}</b></template>
            </Column>
            <Column header="Пиры" style="width: 96px">
              <template #body="{ data: a }">
                <b v-if="a.peer_avg">{{ a.peer_letter }} ({{ a.peer_avg }})</b>
                <span v-else class="muted">—</span>
              </template>
            </Column>
            <Column header="Рукль" style="width: 96px">
              <template #body="{ data: a }">
                <b v-if="a.manager_avg">{{ a.manager_letter }} ({{ a.manager_avg }})</b>
                <span v-else class="muted">—</span>
              </template>
            </Column>
          </DataTable>
          <p v-else class="muted">селф-ревью не отправлялось</p>
          <div v-if="result.self_review?.can_edit || result.self_review?.can_request_edit" class="edit-line">
            <Button v-if="result.self_review.can_edit" label="Поправить селф-ревью" size="small" text
                    @click="selfEditing = true" />
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

      <Card v-if="selfEditing" style="margin-top: 12px">
        <template #title>Правка селф-ревью</template>
        <template #content>
          <AchievementEditor v-model="draft" :limits="limits" />
          <Button label="Сохранить и отправить" size="small" :loading="busy"
                  @click="$emit('save-self-edit', draft)" />
        </template>
      </Card>
    </div>

    <!-- паутинка из блока «Оценки и грейд» -->
    <Dialog v-model:visible="radar.visible" modal
            :header="`Паутинка: ${radar.kind === 'hard' ? 'харды' : 'софты'}`"
            :style="{ width: '720px' }" :content-style="{ height: '560px' }">
      <RadarChart v-if="radar.data?.axis?.length"
                  :axis="radar.data.axis" :self="radar.data.self"
                  :manager="radar.data.manager" :norm="radar.data.norm"
                  height="520px" />
      <p v-else class="muted">разметки этого типа нет</p>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import AchievementEditor from './AchievementEditor.vue'
import RadarChart from './RadarChart.vue'
import { competenciesApi, reviewsApi } from '../api/endpoints'
import type { Cycle, CycleResult, PublicSettings } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { stageLabel } from '../domain/cycle'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{ employeeId: string | number; limits: PublicSettings }>()
const emit = defineEmits<{
  (e: 'save-self-edit', draft: { text: string; self_rating?: string | null }[]): void
}>()

const toast = useToast()
const cycles = ref<Cycle[]>([])
const selectedCycle = ref<number | null>(null)
const result = ref<CycleResult | null>(null)
const busy = ref(false)
const selfEditing = ref(false)
const editRequestComment = ref('')

const decisionLabels: Record<string, string> = {
  keep: 'оставить', 'next-cycle': 'следующий цикл', 'grade-nomination': 'номинация на грейд',
  'raise-now': 'дать сейчас', 'raise-later': 'дать потом',
}

const cycleOptions = computed(() => cycles.value.map((c: any) => ({
  id: c.id,
  label: `${c.name}${c.period_end ? ' · ' + c.period_end.slice(0, 10) : ''} · ${stageLabel(c.stage)}`,
})))

function letterColor(l?: string | null): string {
  const c = (l || ' ')[0]
  return { A: '#16a34a', B: '#65a30d', C: '#3b82f6', D: '#f59e0b', E: '#dc2626' }[c] || '#334155'
}

async function openResult(cycleId: number) {
  selectedCycle.value = cycleId
  result.value = null
  selfEditing.value = false
  if (selectedCycle.value == null) return
  try {
    result.value = await reviewsApi.result(cycleId, props.employeeId)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось открыть результат', detail: errMsg(e), life: 8000 })
  }
}

const draft = ref<{ text: string; self_rating?: string | null }[]>([])

watch(result, (r) => {
  draft.value = r?.self_review?.achievements ? [...r.self_review.achievements] : []
})

async function requestEdit() {
  if (!result.value?.self_review || !editRequestComment.value.trim()) return
  busy.value = true
  try {
    await reviewsApi.requestSelfEdit(result.value.self_review.id, editRequestComment.value)
    toast.add({ severity: 'success', summary: 'Запрос отправлен руководителю', life: 4000 })
    editRequestComment.value = ''
    await openResult(selectedCycle.value!)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  } finally { busy.value = false }
}

const radar = ref<{ visible: boolean; kind: 'hard' | 'soft'; data: any }>(
  { visible: false, kind: 'hard', data: null })

async function openRadar(kind: 'hard' | 'soft') {
  radar.value = { visible: true, kind, data: null }
  try {
    radar.value.data = await competenciesApi.radar(props.employeeId, kind)
  } catch {
    radar.value.data = null
  }
}

onMounted(async () => {
  cycles.value = await reviewsApi.cycles()
  const finished = cycles.value.filter((c: any) => ['closed', 'imported'].includes(c.stage))
  await openResult((finished[0] || cycles.value[0])?.id)
})
</script>

<style scoped>
.review-wrap { max-width: 640px; }
.review-selector { margin-bottom: 12px; }
.radar-link { color: #2563eb; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
.radar-link:hover { text-decoration: underline; color: #1d4ed8; }
.ach-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.kv { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; }
.kv span { color: #64748b; flex-shrink: 0; }
.edit-line { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.w100 { width: 100%; box-sizing: border-box; }
.small { font-size: 0.78rem; }
</style>
