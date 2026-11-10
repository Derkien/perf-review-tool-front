<template>
  <div class="page">
    <h1>Оценки</h1>
    <AssignmentGuide />

    <Tabs value="mine">
      <TabList>
        <Tab value="mine">Мои задания <Badge v-if="openCount" :value="openCount" /></Tab>
        <Tab v-if="subRows.length" value="subordinates">Анкеты подчинённых</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="mine">
          <div class="flex gap-8 align-center" style="margin-bottom: 10px">
            <ToggleSwitch v-model="showHistory" input-id="hist" />
            <label for="hist" class="muted">история выполненных</label>
          </div>

          <!-- карточка селф-ревью -->
          <AssignmentCard v-for="a in selfReviewRows" :key="a.id" :assignment="a"
                          title="Карточка селф-ревью" icon="pi pi-pencil"
                          @open="$router.push('/my-review')" />

          <!-- самооценка компетенций -->
          <AssignmentCard v-for="a in selfRows" :key="a.id" :assignment="a"
                          :title="`Самооценка компетенций — ${progressText(a)}`"
                          icon="pi pi-star" @open="goEmployee(myEmployeeId)" />

          <!-- руководительские: одна карточка на вид с прогрессбаром и раскрытием -->
          <div v-for="g in managerGroups" :key="g.key" class="card group-card">
            <div class="group-head" @click="g.open = !g.open">
              <i class="pi pi-users" />
              <div class="group-title">
                <b>Оценка подчинённых ({{ g.label }})</b>
                <div class="muted small">заполнено {{ g.done }} из {{ g.total }} сотрудников</div>
              </div>
              <ProgressBar :value="g.total ? Math.round((g.done * 100) / g.total) : 0"
                           :show-value="false" style="width: 160px" />
              <i :class="g.open ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="chev" />
            </div>
            <div v-if="g.open" class="group-rows">
              <div v-for="row in g.rows" :key="row.id" class="group-row">
                <span class="row-name">{{ row.subject?.name }}</span>
                <span class="muted small">{{ subjectProgress(row) }}</span>
                <Tag v-if="row.overdue" value="просрочено" severity="danger" />
                <Button label="Разметить" size="small" text
                        @click="goEmployee(row.subject?.id)" />
              </div>
            </div>
          </div>

          <!-- оценка коллег -->
          <div v-if="peerRows.length" class="card">
            <b>Оценка коллег</b>
            <div v-for="a in peerRows" :key="a.id" class="group-row">
              <span class="row-name">{{ a.subject?.name }}</span>
              <Tag :value="roleLabel(a.context?.assessor_role as string)" severity="info" />
              <Tag v-if="a.overdue" value="просрочено" severity="danger" />
              <Button label="Оценить" size="small" text @click="openPeer(a)" />
            </div>
          </div>

          <Message v-if="loaded && !openCount" severity="info" data-testid="empty-queue">
            Ничего не ждёт: всё заполнено или переоценка ещё не запускалась
          </Message>

          <!-- история -->
          <DataTable v-if="showHistory && historyRows.length" :value="historyRows" size="small" style="margin-top: 12px">
            <Column header="Тип"><template #body="{ data: a }">{{ a.kind_title }}</template></Column>
            <Column header="Кого"><template #body="{ data: a }">{{ a.subject?.name || a.assignee?.name }}</template></Column>
            <Column header="Статус"><template #body="{ data: a }">
              <Tag :value="a.status === 'done' ? 'выполнено' : 'отменено'"
                   :severity="a.status === 'done' ? 'success' : 'secondary'" />
            </template></Column>
          </DataTable>
        </TabPanel>

        <TabPanel v-if="subRows.length" value="subordinates">
          <div v-for="g in subGroups" :key="g.key" class="card group-card">
            <div class="group-head" @click="g.open = !g.open">
              <i class="pi pi-users" />
              <div class="group-title">
                <b>{{ g.title }}</b>
                <div class="muted small">{{ g.subtitle }}</div>
              </div>
              <i :class="g.open ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="chev" />
            </div>
            <div v-if="g.open" class="group-rows">
              <div v-for="row in g.rows" :key="row.id" class="group-row">
                <span class="row-name">{{ row.subject?.name || row.assignee?.name }}</span>
                <span class="muted small">{{ row.kind_title }}</span>
                <Tag v-if="row.overdue" value="просрочено" severity="danger" />
                <Button v-if="row.subject?.id" label="К анкете" size="small" text
                        @click="goEmployee(row.subject?.id)" />
              </div>
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <!-- форма оценки коллеги -->
    <Dialog v-model:visible="peerVisible" modal :header="peerCurrent?.subject?.name || 'Оценка коллеги'"
            style="width: 640px">
      <div v-for="(ach, i) in peerDetail?.achievements || []" :key="i" class="ach">
        <p class="ach-text">{{ ach.text }}</p>
        <div class="rate-row">
          <span class="muted">Оценка:</span>
          <SelectButton v-model="peerRatings[i]" :options="letterOptions" option-label="label"
                        option-value="value" :allow-empty="true" />
          <span v-if="peerRatings[i]" class="muted">{{ letterWords[peerRatings[i] as string] }}</span>
        </div>
      </div>
      <p v-if="!peerDetail?.achievements?.length" class="muted">
        Селф-ревью коллеги ещё не отправлено — оценка станет доступна после.
      </p>
      <h3>Свободная обратная связь</h3>
      <Textarea v-model="peerFreeText" :rows="4" class="w100"
                placeholder="Чем помог, что стоит продолжать, что улучшить…" />
      <div class="actions">
        <Button label="Закрыть" text @click="peerVisible = false" />
        <div style="flex: 1"></div>
        <Button label="Отправить оценку" :loading="peerBusy" :disabled="!peerDetail?.achievements?.length"
                @click="submitPeer" />
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import Badge from 'primevue/badge'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import SelectButton from 'primevue/selectbutton'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import AssignmentCard from '../components/AssignmentCard.vue'
import AssignmentGuide from '../components/AssignmentGuide.vue'
import { assignmentsApi, type AssignmentDto } from '../api/endpoints'
import { reviewsApi } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useAuth } from '../stores/auth'

const router = useRouter()
const toast = useToast()
const auth = useAuth()
const mineRows = ref<AssignmentDto[]>([])
const subRows = ref<AssignmentDto[]>([])
const showHistory = ref(false)
const loaded = ref(false)
const myEmployeeId = computed(() => (auth.me as any)?.employee_id)

const OPEN = ['pending', 'notified']
const isOpen = (a: AssignmentDto) => OPEN.includes(a.status)
const openCount = computed(() => mineRows.value.filter(isOpen).length)
const historyRows = computed(() => mineRows.value.filter((a) => !isOpen(a)))

const selfReviewRows = computed(() => mineRows.value.filter(
  (a) => a.kind === 'self-review' && isOpen(a)))
const selfRows = computed(() => mineRows.value.filter(
  (a) => a.kind === 'competency-self' && isOpen(a)))
const peerRows = computed(() => mineRows.value.filter(
  (a) => a.kind === 'peer-review' && isOpen(a)))

// группировка руководительских заданий: одна карточка на вид матрицы (реш. 12)
const managerGroups = computed(() => {
  const rows = mineRows.value.filter(
    (a) => a.kind === 'competency-manager' && a.status !== 'cancelled')
  const groups: Record<string, { id: number; status: string; subject: AssignmentDto['subject'];
                                 overdue: boolean; progress?: AssignmentDto['progress'] }[]> = {}
  for (const a of rows) {
    const key = String(a.context?.matrix_kind || 'soft')
    ;(groups[key] ||= []).push({ id: a.id, status: a.status, subject: a.subject,
                                 overdue: a.overdue, progress: a.progress })
  }
  return Object.entries(groups).map(([key, all]) => {
    const done = all.filter((r) => r.status === 'done').length
    return reactive({
      key, label: key, total: all.length, done,
      rows: all.filter((r) => r.status !== 'done'),
      open: false,
    })
  })
})

// анкеты подчинённых: мои manager-задания + очереди подчинённых, тоже с группировкой
const subGroups = computed(() => {
  const groups: { key: string; title: string; subtitle: string; rows: AssignmentDto[] }[] = []
  const mineManager = subRows.value.filter((a) => a.kind === 'competency-manager' && isOpen(a))
  for (const [kind, label] of [['soft', 'soft'], ['hard', 'hard']] as const) {
    const rows = mineManager.filter((a) => a.context?.matrix_kind === kind)
    if (rows.length) {
      groups.push({ key: `mine-${kind}`, title: `Оценка подчинённых (${label}) — мои задания`,
                    subtitle: `${rows.length} незаполненных`, rows })
    }
  }
  const others = subRows.value.filter((a) => a.kind !== 'competency-manager' || !isOpen(a))
  const openOthers = others.filter(isOpen)
  if (openOthers.length) {
    groups.push({ key: 'sub-queues', title: 'Очереди подчинённых',
                  subtitle: 'открытые задания команды', rows: openOthers })
  }
  return groups.map((g) => reactive({ ...g, open: g.key === 'sub-queues' }))
})

function progressText(a: AssignmentDto): string {
  const parts = (a.progress?.matrices || []).map((m) =>
    m.complete ? `${m.kind} — заполнено` : `${m.kind} — осталось ${m.total - m.covered} п.`)
  return parts.join('; ') || 'нет активных схем'
}

function subjectProgress(a: { progress?: AssignmentDto['progress'] }): string {
  const parts = (a.progress?.matrices || []).map((m) =>
    m.complete ? '✓' : `${m.covered}/${m.total}`)
  return parts.join(' · ')
}

function roleLabel(role: unknown): string {
  return ({ 'line-manager': 'как лин. рукль', 'functional-manager': 'как функц. рукль', peer: 'как пир' } as Record<string, string>)[String(role)] || String(role || '')
}

function goEmployee(id?: number | null) {
  if (id) router.push(`/staff/${id}`)
}

// ---- форма оценки коллеги ----
const peerVisible = ref(false)
const peerCurrent = ref<AssignmentDto | null>(null)
const peerDetail = ref<AssignmentDto | null>(null)
const peerRatings = ref<Record<number, string>>({})
const peerFreeText = ref('')
const peerBusy = ref(false)
const letterWords: Record<string, string> = {
  A: 'Превосходит ожидания', B: 'Выше ожиданий', C: 'Соответствует ожиданиям',
  D: 'Ниже ожиданий', E: 'Не соответствует ожиданиям',
}
const letterOptions = Object.entries(letterWords).map(([value, label]) => ({ value, label }))

async function openPeer(a: AssignmentDto) {
  peerCurrent.value = a
  peerRatings.value = {}
  peerFreeText.value = ''
  peerDetail.value = await assignmentsApi.detail(a.id)
  peerVisible.value = true
}

async function submitPeer() {
  if (!peerCurrent.value || !peerDetail.value?.achievements) return
  const expected = peerDetail.value.achievements.map((_: unknown, i: number) => i + 1)
  const payload = expected.filter((i: number) => peerRatings.value[i])
  if (payload.length !== expected.length) {
    toast.add({ severity: 'warn', summary: 'Оцените каждое достижение', life: 6000 })
    return
  }
  peerBusy.value = true
  try {
    await reviewsApi.submitPeerReview(peerCurrent.value.id, {
      ratings: payload.map((i: number) => ({ ach_index: i, letter: peerRatings.value[i] })),
      free_text: peerFreeText.value,
    })
    toast.add({ severity: 'success', summary: 'Оценка отправлена · задание выполнено', life: 4000 })
    peerVisible.value = false
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  } finally {
    peerBusy.value = false
  }
}

async function load() {
  const [mine, subs] = await Promise.all([
    assignmentsApi.mine(),
    assignmentsApi.subordinates().catch(() => []),
  ])
  mineRows.value = mine
  subRows.value = subs
  loaded.value = true
}

onMounted(load)
</script>

<style scoped>
.card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 10px; background: #fff; }
.group-card .group-head { display: flex; gap: 10px; align-items: center; cursor: pointer; }
.group-title { flex: 1; }
.chev { color: #94a3b8; }
.group-rows { margin-top: 10px; border-top: 1px solid #f1f5f9; padding-top: 8px; }
.group-row { display: flex; gap: 10px; align-items: center; padding: 4px 0; }
.row-name { min-width: 180px; }
.ach { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
.ach-text { margin: 0 0 8px; white-space: pre-wrap; }
.rate-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.w100 { width: 100%; box-sizing: border-box; }
.actions { display: flex; gap: 10px; margin-top: 10px; }
</style>
