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

        <TabPanel value="comp">
          <CompetenciesTab :employee-id="String(route.params.id)" :perms="perms"
                           :grade-options="gradeOptions" />
        </TabPanel>

        <TabPanel v-if="perms.pay" value="pay">
          <PayTab :card="emp" />
        </TabPanel>

        <TabPanel v-if="perms.efficiency" value="eff">
          <EfficiencyTab :card="emp" :perms="perms" :eff-labels="effLabels"
                         @card-refresh="reloadCard" />
        </TabPanel>

        <TabPanel value="review">
          <ReviewTab :employee-id="String(route.params.id)" :limits="limits"
                     @save-self-edit="saveSelfEdit" />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Card from 'primevue/card'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import Tag from 'primevue/tag'
import AppBreadcrumbs from '../components/AppBreadcrumbs.vue'
import CompetenciesTab from '../components/CompetenciesTab.vue'
import EfficiencyTab from '../components/EfficiencyTab.vue'
import PayTab from '../components/PayTab.vue'
import ReviewTab from '../components/ReviewTab.vue'
import { reviewsApi, staffApi } from '../api/endpoints'
import type { PublicSettings } from '../api/endpoints'
import { errMsg } from '../api/errors'
import { isActiveCycle } from '../domain/cycle'
import { useToast } from 'primevue/usetoast'

const route = useRoute()
const toast = useToast()
const emp = ref<any>(null)
const perms = ref<any>({})
const cycles = ref<any[]>([])
const limits = ref<any>({ self_min_ach: 2, self_max_ach: 4, self_max_chars: 300 })
const gradeOptions = ref<{ label: string; value: string }[]>([])
const effLabels = ref<Record<string, string>>({})

const canLinkManagers = computed(() => perms.value.is_manager_view || perms.value.is_self)

onMounted(async () => {
  const id = String(route.params.id)
  const pub = await reviewsApi.publicSettings()
  limits.value = pub
  gradeOptions.value = (pub.grades || []).map((g: string, i: number) => ({ label: `${g} · ${i + 1}`, value: g }))
  effLabels.value = pub.eff_param_labels || {}
  emp.value = await staffApi.card(id)
  perms.value = emp.value.permissions || {}
  cycles.value = await reviewsApi.cycles()
})

async function reloadCard() {
  emp.value = await staffApi.card(String(route.params.id))
  perms.value = emp.value.permissions || {}
}

/** Сигнал из ReviewTab: правка селф-ревью уходит активным циклом. */
async function saveSelfEdit(draft: { text: string; self_rating?: string | null }[]) {
  const active = cycles.value.find((c: any) => isActiveCycle(c.stage))
  if (!active) return
  try {
    await reviewsApi.saveSelf({
      cycle_id: active.id, achievements: draft, submit: true,
    })
    toast.add({ severity: 'success', summary: 'Селф-ревью обновлено', life: 4000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: errMsg(e), life: 8000 })
  }
}
</script>

<style scoped>
.kv { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; }
.kv span { color: #64748b; flex-shrink: 0; }
.person-link { color: #2563eb; text-decoration: none; }
.person-link:hover { text-decoration: underline; }
</style>
