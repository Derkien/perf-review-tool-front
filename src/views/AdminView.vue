<template>
  <div class="page">
    <h1>Админ</h1>
    <Tabs value="users">
      <TabList>
        <Tab value="users">Пользователи и роли</Tab>
        <Tab value="settings">Настройки цикла</Tab>
        <Tab value="rules">Правила повышений</Tab>
        <Tab value="activity">Активность и аудит</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="users">
          <DataTable :value="users" size="small" edit-mode="cell">
            <Column field="email" header="Email" />
            <Column field="full_name" header="Имя" />
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
import { onMounted, ref } from 'vue'
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
import ToggleSwitch from 'primevue/toggleswitch'
import { api } from '../api'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const users = ref<any[]>([])
const roles = ['admin', 'cto', 'line-manager', 'functional-manager', 'employee']
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

onMounted(async () => {
  users.value = (await api.get('/admin/users')).data
  const st = (await api.get('/admin/settings')).data
  s.value = { self_min_ach: st.self_min_ach, self_max_ach: st.self_max_ach,
    self_max_chars: st.self_max_chars, peers_min: st.peers_min, peers_max: st.peers_max }
  w.value = st.autocalibration_weights
  r.value = {
    ...st.raise_rules,
    max_raise_pct: { C: 10, B: 20, A: 30, ...(st.raise_rules?.max_raise_pct || {}) },
  }
  loadActivity()
})

async function loadActivity() {
  try {
    [activity.value, audit.value] = (await Promise.all([
      api.get('/admin/activity'), api.get('/admin/audit'),
    ])).map((x) => x.data)
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

async function patchUser(u: any) {
  await api.patch(`/admin/users/${u.id}`, { role: u.role })
  toast.add({ severity: 'success', summary: `${u.email} → ${u.role}` })
}
async function save(cur: any) {
  await api.put('/admin/settings', { values: {
    self_min_ach: cur.self_min_ach, self_max_ach: cur.self_max_ach,
    self_max_chars: cur.self_max_chars, peers_min: cur.peers_min, peers_max: cur.peers_max } })
}
async function saveWeights() {
  await api.put('/admin/settings', { values: { autocalibration_weights: w.value } })
}
async function saveRules() {
  await api.put('/admin/settings', { values: { raise_rules: r.value } })
}
</script>

<style scoped>
.settings { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.settings label { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; }
.head-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.small { font-size: 0.78rem; }
.diff { font-size: 0.72rem; max-width: 480px; overflow: auto; background: #f8fafc; padding: 6px; border-radius: 6px; }
</style>
