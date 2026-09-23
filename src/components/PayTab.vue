<template>
  <div>
    <Card style="max-width: 760px">
      <template #content>
        <BandBar :band="card.sensitive?.band" :position="card.sensitive?.band_position"
                 :salary="card.sensitive?.salary || 0"
                 :premium-pct="card.sensitive?.premium_pct || 0"
                 :bonus="card.quarterly_bonus || 0"
                 :salary-total="card.sensitive?.salary_total || 0"
                 :advice="card.sensitive?.band_advice" />
      </template>
    </Card>
    <Card style="margin-top: 12px; max-width: 760px">
      <template #title>История изменений</template>
      <template #content>
        <DataTable v-if="salaryHistory.length" :value="salaryHistory" size="small">
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
        <p v-else class="muted">истории пока нет</p>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Card from 'primevue/card'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import BandBar from './BandBar.vue'
import { staffApi } from '../api/endpoints'

const props = defineProps<{ card: any }>()
const salaryHistory = ref<{ date: string; salary: number; premium_pct: number
  grade: string | null; reason: string; source: string }[]>([])

onMounted(async () => {
  try {
    // загрузка истории — право на неё уже проверено бэком; ошибка = нет доступа
    salaryHistory.value = await staffApi.salaryHistory(String(props.card.id))
  } catch { salaryHistory.value = [] }
})
</script>
