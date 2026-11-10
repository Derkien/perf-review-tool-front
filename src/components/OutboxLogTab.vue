<template>
  <div class="head-row">
    <h2 style="margin:0">Лог рассылки</h2>
    <Button label="Обновить" size="small" text @click="load" />
  </div>
  <p class="muted small">
    Все доставки уведомлений (in-app и email): канал, событие, адресат, статус, попытки, ошибка.
  </p>
  <div class="filters">
    <Select v-model="channel" :options="CHANNELS" placeholder="Канал" show-clear
            data-testid="filter-channel" @change="load" />
    <Select v-model="status" :options="STATUSES" placeholder="Статус" show-clear
            data-testid="filter-status" @change="load" />
    <span class="muted small">всего: {{ total }}</span>
  </div>
  <DataTable :value="items" size="small" paginator :rows="20" :loading="loading"
             data-testid="outbox-table">
    <Column header="Время">
      <template #body="{ data: m }">{{ m.created_at ? new Date(m.created_at).toLocaleString('ru') : '' }}</template>
    </Column>
    <Column header="Канал">
      <template #body="{ data: m }">
        <Tag :value="m.channel"
             :severity="m.channel === 'email' || m.channel === 'mattermost' ? 'warn' : 'info'" />
      </template>
    </Column>
    <Column field="event" header="Событие" />
    <Column field="recipient" header="Адресат" />
    <Column header="Статус">
      <template #body="{ data: m }">
        <Tag :value="m.status" :severity="STATUS_SEVERITY[m.status] || 'secondary'"
             v-tooltip.top="m.last_error || undefined" />
      </template>
    </Column>
    <Column field="attempts" header="Попытки" />
    <Column header="Ошибка">
      <template #body="{ data: m }">
        <span class="small muted">{{ m.last_error || '—' }}</span>
      </template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { deliveryApi } from '../api/endpoints'

const CHANNELS = ['inapp', 'log', 'email', 'mattermost']
const STATUSES = ['sent', 'pending', 'failed', 'skipped']
const STATUS_SEVERITY: Record<string, string> = {
  sent: 'success', pending: 'info', failed: 'danger', skipped: 'warn',
}

const channel = ref<string | null>(null)
const status = ref<string | null>(null)
const items = ref<Awaited<ReturnType<typeof deliveryApi.outbox>>['items']>([])
const total = ref(0)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await deliveryApi.outbox({ channel: channel.value || undefined,
                                            status: status.value || undefined })
    items.value = res.items
    total.value = res.total
  } finally {
    loading.value = false
  }
}

onMounted(() => { load().catch(() => undefined) })
</script>

<style scoped>
.head-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.filters { display: flex; gap: 8px; align-items: center; margin: 8px 0; }
</style>
