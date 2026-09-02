<template>
  <div class="page">
    <h1>Админ</h1>
    <Tabs value="users">
      <TabList>
        <Tab value="users">Пользователи и роли</Tab>
        <Tab value="settings">Настройки цикла</Tab>
        <Tab value="rules">Правила повышений</Tab>
        <Tab value="activity">Активность и аудит</Tab>
        <Tab value="rights">Права доступа</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="users">
          <div class="assign-row">
            <InputText v-model="assignEmail" placeholder="email сотрудника" size="small" />
            <Dropdown v-model="assignRole" :options="roles" size="small" />
            <Button label="Назначить роль" size="small" @click="assignByEmail" />
            <span class="muted">Пользователь создаётся заранее — при первом входе по SSO/email роль уже ждёт его.</span>
          </div>
          <DataTable :value="users" size="small" edit-mode="cell" paginator :rows="20"
                     scrollable scroll-height="560px" filter-display="menu">
            <Column field="full_name" header="Сотрудник" sortable>
              <template #body="{ data: u }">
                <router-link v-if="u.employee_id" :to="`/staff/${u.employee_id}`" class="ulink">{{ u.full_name }}</router-link>
                <span v-else>{{ u.full_name }}</span>
              </template>
            </Column>
            <Column field="email" header="Email" sortable />
            <Column field="position" header="Должность" />
            <Column field="team" header="Команда" />
            <Column header="Входил">
              <template #body="{ data: u }">
                <Tag :value="u.has_logged_in ? 'да' : 'ещё нет'"
                     :severity="u.has_logged_in ? 'success' : 'secondary'" />
              </template>
            </Column>
            <Column field="role" header="Роль">
              <template #editor="{ data: u }">
                <Dropdown v-model="u.role" :options="roles" @change="patchUser(u)" />
              </template>
              <template #body="{ data: u }"><Tag :value="u.role" severity="secondary" /></template>
            </Column>
            <Column field="is_active" header="Активен">
              <template #body="{ data: u }">
                <Tag :value="u.is_active ? 'да' : 'нет'" :severity="u.is_active ? 'success' : 'danger'" />
              </template>
            </Column>
          </DataTable>
        </TabPanel>
        <TabPanel value="settings">
          <h2 style="margin:0 0 6px">Схема цикла перф-ревью</h2>
          <p class="muted" style="font-size:.82rem; margin:0 0 8px">
            Стадии и переходы стейт-машины. Значок <b>i</b> у стадии — что на ней
            происходит и условия перехода дальше; гейты включаются блоком
            «Валидаторы переходов» ниже.
          </p>
          <WorkflowSchema />
          <h2 style="margin:18px 0 8px">Параметры форм</h2>
          <div class="settings">
            <label>Мин. достижений <InputNumber v-model="s.self_min_ach" @update:model-value="save(s)" /></label>
            <label>Макс. достижений <InputNumber v-model="s.self_max_ach" @update:model-value="save(s)" /></label>
            <label>Длина достижения <InputNumber v-model="s.self_max_chars" @update:model-value="save(s)" /></label>
            <label>Мин. пиров <InputNumber v-model="s.peers_min" @update:model-value="save(s)" /></label>
            <label>Макс. пиров <InputNumber v-model="s.peers_max" @update:model-value="save(s)" /></label>
            <label>Веса: пиры <InputNumber v-model="w.peers" :min-fraction-digits="2" :max-fraction-digits="2" @update:model-value="saveWeights" /></label>
            <label>лин. <InputNumber v-model="w.line" :min-fraction-digits="2" :max-fraction-digits="2" @update:model-value="saveWeights" /></label>
            <label>функц. <InputNumber v-model="w.functional" :min-fraction-digits="2" :max-fraction-digits="2" @update:model-value="saveWeights" /></label>
            <label>матрица <InputNumber v-model="w.matrix" :min-fraction-digits="2" :max-fraction-digits="2" @update:model-value="saveWeights" /></label>
            <label>эффективность <InputNumber v-model="w.efficiency" :min-fraction-digits="2" :max-fraction-digits="2" @update:model-value="saveWeights" /></label>
          </div>

          <h2 style="margin:18px 0 8px">Предоценки руководителей</h2>
          <div class="settings">
            <label>Оценка обязательна
              <ToggleSwitch :model-value="la.require_rating"
                            @update:model-value="la.require_rating = $event; saveLeaderAssessment()" />
            </label>
            <label>Отзыв обязателен
              <ToggleSwitch :model-value="la.require_feedback"
                            @update:model-value="la.require_feedback = $event; saveLeaderAssessment()" />
            </label>
          </div>
          <p class="muted" style="font-size:.82rem; margin:6px 0 0">
            Обязательность проверяется при отправке предоценки; заполнить может руководитель
            сотрудника, вышестоящий руководитель, админ или делегат (ниже).
          </p>

          <h2 style="margin:18px 0 8px">Валидаторы переходов цикла (стейт-машина)</h2>
          <div class="settings">
            <label>Ачивки у всех → пиры
              <ToggleSwitch :model-value="gates.self_review_gate"
                            @update:model-value="gates.self_review_gate = $event; saveGates()" />
            </label>
            <label>Предоценки у всех → калибровки
              <ToggleSwitch :model-value="gates.leader_assessment_gate"
                            @update:model-value="gates.leader_assessment_gate = $event; saveGates()" />
            </label>
            <label>Калибровки закрыты → решения
              <ToggleSwitch :model-value="gates.calibration_finished_gate"
                            @update:model-value="gates.calibration_finished_gate = $event; saveGates()" />
            </label>
          </div>

          <h2 style="margin:18px 0 8px">Делегирование</h2>
          <div class="delegate-block">
            <label>Заполнение предоценок за руководителей
              <MultiSelect v-model="delegation.leader_assessment_user_ids" :options="userOptions"
                           option-label="label" option-value="id" filter placeholder="Выбрать сотрудников"
                           class="w100" @change="saveDelegation" />
            </label>
            <label>Правка пиров сотрудников
              <MultiSelect v-model="delegation.peer_edit_user_ids" :options="userOptions"
                           option-label="label" option-value="id" filter placeholder="Выбрать сотрудников"
                           class="w100" @change="saveDelegation" />
            </label>
          </div>
          <p class="muted" style="font-size:.82rem; margin:6px 0 0">
            Делегаты работают вне матрицы подчинения: могут выполнять действие за любых
            руководителей. Роли при этом не меняются.
          </p>
        </TabPanel>
        <TabPanel value="activity">
          <div class="head-row">
            <h2 style="margin:0">Действия пользователей (навигация)</h2>
            <Button label="Обновить" size="small" text @click="loadActivity" />
          </div>
          <DataTable :value="activity" size="small" scrollable scroll-height="260px" paginator :rows="15">
            <Column field="at" header="Время">
              <template #body="{ data: a }">{{ a.at ? new Date(a.at).toLocaleString('ru') : '' }}</template>
            </Column>
            <Column field="user" header="Кто" />
            <Column field="section" header="Раздел" />
            <Column field="type" header="Тип" />
            <Column header="Детали">
              <template #body="{ data: a }">
                <span class="small">{{ JSON.stringify(a.detail) }}</span>
              </template>
            </Column>
            <Column field="user_agent" header="Устройство">
              <template #body="{ data: a }">
                <span class="small" v-tooltip.top="a.user_agent">{{ deviceLabel(a.user_agent) }}</span>
              </template>
            </Column>
          </DataTable>
          <h2>Аудит изменений (с diff)</h2>
          <DataTable :value="audit" size="small" scrollable scroll-height="300px" paginator :rows="15">
            <Column field="at" header="Время">
              <template #body="{ data: a }">{{ a.at ? new Date(a.at).toLocaleString('ru') : '' }}</template>
            </Column>
            <Column field="user" header="Кто" />
            <Column header="Что">
              <template #body="{ data: a }">{{ a.entity }}#{{ a.entity_id }} · {{ a.action }}</template>
            </Column>
            <Column header="Diff (было → стало)">
              <template #body="{ data: a }">
                <details v-if="a.before || a.after">
                  <summary class="muted small">показать</summary>
                  <pre class="diff">{{ JSON.stringify(a.before, null, 1) }} → {{ JSON.stringify(a.after, null, 1) }}</pre>
                </details>
                <span v-else class="muted">—</span>
              </template>
            </Column>
          </DataTable>
        </TabPanel>
        <TabPanel value="rights">
          <p class="muted">
            Матрица прав: роли × пермишены (fixes5). Роль <b>{{ superuserRole }}</b> — неявный
            суперпользователь (все права всегда) и в матрице не нуждается. Изменения применяются
            сразу и действуют со следующего входа пользователя.
          </p>
          <p v-if="!catalog" class="muted">Загрузка каталога прав…</p>
          <div v-for="group in permissionGroups" :key="group.name" class="rights-group">
            <h3 class="rights-title">{{ group.name }}</h3>
            <DataTable :value="matrixRows" size="small" scrollable>
              <Column field="role" header="Роль" class="role-col">
                <template #body="{ data: r }">
                  <Tag :value="roleLabels[r.role] || r.role" severity="secondary" />
                </template>
              </Column>
              <Column v-for="p in group.perms" :key="p.code" style="min-width:130px">
                <template #header>
                  <span v-tooltip.top="p.code">{{ p.title }}</span>
                </template>
                <template #body="{ data: r }">
                  <Checkbox :model-value="(matrix[r.role] || []).includes(p.code)" binary
                            :disabled="r.role === superuserRole"
                            @update:model-value="toggleRight(r.role, p.code)" />
                </template>
              </Column>
            </DataTable>
          </div>
        </TabPanel>
        <TabPanel value="rules">
          <div class="settings">
            <label>Кулдаун повышений (мес) <InputNumber v-model="r.raise_cooldown_months" @update:model-value="saveRules" /></label>
            <label>Запрет двух подряд
              <ToggleSwitch :model-value="r.no_two_in_row" @update:model-value="r.no_two_in_row = $event; saveRules()" />
            </label>
            <label>Кап % C <InputNumber v-model="r.max_raise_pct.C" @update:model-value="saveRules" /></label>
            <label>Кап % B <InputNumber v-model="r.max_raise_pct.B" @update:model-value="saveRules" /></label>
            <label>Кап % A <InputNumber v-model="r.max_raise_pct.A" @update:model-value="saveRules" /></label>
            <label>Лимит бюджета ФОТ % <InputNumber v-model="r.budget_fot_limit_pct" :min-fraction-digits="1" :max-fraction-digits="1" @update:model-value="saveRules" /></label>
            <label>Запрещённые к повышению оценки
              <span class="muted">{{ (r.forbidden_letters || []).join(', ') }}</span>
            </label>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Checkbox from 'primevue/checkbox'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dropdown from 'primevue/dropdown'
import InputNumber from 'primevue/inputnumber'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import Tag from 'primevue/tag'
import MultiSelect from 'primevue/multiselect'
import ToggleSwitch from 'primevue/toggleswitch'
import WorkflowSchema from '../components/WorkflowSchema.vue'
import { adminApi } from '../api/endpoints'
import type { PermissionsCatalog } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const users = ref<any[]>([])
const assignEmail = ref('')
const assignRole = ref('employee')
const roles = ['admin', 'cto', 'line-manager', 'functional-manager', 'employee']
const roleLabels: Record<string, string> = {
  admin: 'админ', cto: 'СТО', 'line-manager': 'лин. рукль',
  'functional-manager': 'функц. рукль', employee: 'сотрудник',
}
const s = ref<any>({})
const w = ref<any>({})
// дефолты сразу: шаблон рендерится до загрузки настроек с сервера
const r = ref<any>({
  raise_cooldown_months: 12, no_two_in_row: true,
  max_raise_pct: { C: 10, B: 20, A: 30 }, budget_fot_limit_pct: 5,
  forbidden_letters: ['D', 'E'],
})
const activity = ref<any[]>([])
const audit = ref<any[]>([])
// fixes6: предоценки/гейты/делегирование
const la = ref<{ require_rating: boolean; require_feedback: boolean }>(
  { require_rating: true, require_feedback: true })
const gates = ref<{ self_review_gate: boolean; leader_assessment_gate: boolean; calibration_finished_gate: boolean }>(
  { self_review_gate: false, leader_assessment_gate: true, calibration_finished_gate: true })
const delegation = ref<{ leader_assessment_user_ids: number[]; peer_edit_user_ids: number[] }>(
  { leader_assessment_user_ids: [], peer_edit_user_ids: [] })
const userOptions = computed(() =>
  users.value.filter((u: any) => u.id).map((u: any) => ({ id: u.id, label: `${u.full_name} (${u.email})` })))

// --- матрица прав (fixes5): каталог приезжает с бэкенда, никакие коды не хардкодятся ---
const catalog = ref<PermissionsCatalog | null>(null)
const matrix = ref<Record<string, string[]>>({})
const superuserRole = computed(() => catalog.value?.superuser_role || 'admin')
const matrixRows = computed(() =>
  (catalog.value?.roles || [])
    .filter((role) => role !== superuserRole.value)
    .map((role) => ({ role })))
const permissionGroups = computed(() => {
  const byGroup = new Map<string, { code: string; title: string }[]>()
  for (const p of catalog.value?.permissions || []) {
    if (!byGroup.has(p.group)) byGroup.set(p.group, [])
    byGroup.get(p.group)!.push({ code: p.code, title: p.title })
  }
  return [...byGroup.entries()].map(([name, perms]) => ({ name, perms }))
})

onMounted(async () => {
  users.value = await adminApi.users()
  const st = await adminApi.settings()
  s.value = { self_min_ach: st.self_min_ach, self_max_ach: st.self_max_ach,
    self_max_chars: st.self_max_chars, peers_min: st.peers_min, peers_max: st.peers_max }
  w.value = st.autocalibration_weights as Record<string, number>
  r.value = {
    ...st.raise_rules as Record<string, unknown>,
    max_raise_pct: { C: 10, B: 20, A: 30, ...((st.raise_rules as any)?.max_raise_pct || {}) },
  } as any
  la.value = { require_rating: true, require_feedback: true, ...(st.leader_assessment as any) }
  gates.value = { self_review_gate: false, leader_assessment_gate: true, calibration_finished_gate: true,
                  ...(st.workflow_gates as any) }
  delegation.value = { leader_assessment_user_ids: [], peer_edit_user_ids: [],
                       ...(st.delegation as any) }
  await loadRights()
  loadActivity()
})

async function loadRights() {
  catalog.value = await adminApi.permissionsCatalog()
  matrix.value = { ...catalog.value.matrix }
}

async function toggleRight(role: string, perm: string) {
  const cur = new Set(matrix.value[role] || [])
  const enabled = !cur.has(perm)
  if (enabled) cur.add(perm)
  else cur.delete(perm)
  matrix.value = { ...matrix.value, [role]: Array.from(cur) }
  try {
    await adminApi.putSettings({ role_permissions: matrix.value })
    toast.add({  severity: 'success',
      summary: `${roleLabels[role] || role}: ${perm} ${enabled ? 'включено' : 'выключено'}`, life: 4000 })
  } catch (e) {
    toast.add({  severity: 'error', summary: 'Не сохранено', detail: errMsg(e), life: 8000 })
    await loadRights()
  }
}

async function loadActivity() {
  try {
    [activity.value, audit.value] = await Promise.all([adminApi.activity(), adminApi.audit()])
  } catch { /* недоступно */ }
}

function deviceLabel(ua: string): string {
  if (!ua) return '—'
  if (/iPhone|iPad|Android|Mobile/i.test(ua)) return 'мобильное'
  if (/Macintosh|Mac OS/i.test(ua)) return 'macOS'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  return ua.slice(0, 40)
}

async function assignByEmail() {
  if (!assignEmail.value.trim()) return
  try {
    await adminApi.ensureUser(assignEmail.value.trim().toLowerCase(), assignRole.value)
    toast.add({  severity: 'success', summary: `Роль назначена: ${assignEmail.value}`, life: 4000 })
    assignEmail.value = ''
    users.value = await adminApi.users()
  } catch (e) {
    toast.add({  severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  }
}

async function patchUser(u: any) {
  await adminApi.patchUser(u.id, { role: u.role })
  toast.add({  severity: 'success', summary: `${u.email} → ${u.role}`, life: 4000 })
}
async function save(cur: any) {
  await adminApi.putSettings({
    self_min_ach: cur.self_min_ach, self_max_ach: cur.self_max_ach,
    self_max_chars: cur.self_max_chars, peers_min: cur.peers_min, peers_max: cur.peers_max })
}
async function saveWeights() {
  await adminApi.putSettings({ autocalibration_weights: w.value })
}
async function saveLeaderAssessment() {
  await adminApi.putSettings({ leader_assessment: la.value })
}
async function saveGates() {
  await adminApi.putSettings({ workflow_gates: gates.value })
}
async function saveDelegation() {
  await adminApi.putSettings({ delegation: delegation.value })
}
async function saveRules() {
  await adminApi.putSettings({ raise_rules: r.value })
}
</script>

<style scoped>
.assign-row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.ulink { color: #2563eb; text-decoration: none; }
.ulink:hover { text-decoration: underline; }
.settings { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.settings label { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; }
.head-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.small { font-size: 0.78rem; }
.diff { font-size: 0.72rem; max-width: 480px; overflow: auto; background: #f8fafc; padding: 6px; border-radius: 6px; }
.rights-group { margin-bottom: 18px; }
.delegate-block { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.delegate-block label { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; }
.rights-title { margin: 10px 0 6px; font-size: 0.95rem; }
.role-col { min-width: 120px; }
</style>
