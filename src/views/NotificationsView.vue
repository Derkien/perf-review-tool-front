<template>
  <div class="page">
    <div class="head">
      <h1 style="margin:0">Уведомления</h1>
      <Button label="Прочитать все" text size="small" @click="readAll" />
    </div>
    <div v-if="items.length" class="list">
      <div v-for="n in items" :key="n.id" class="item" :class="{ unread: !n.is_read }" @click="read(n)">
        <i :class="icons[n.event] || 'pi pi-bell'" />
        <div>
          <div>{{ n.title }}</div>
          <div class="muted">{{ new Date(n.created_at).toLocaleString('ru') }}</div>
        </div>
      </div>
    </div>
    <p v-else class="muted">Пусто.</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import { api } from '../api'

const items = ref<any[]>([])
const icons: Record<string, string> = {
  'stage-started': 'pi pi-flag', 'peer-assignment': 'pi pi-star',
  'deadline-reminder': 'pi pi-clock', 'calibration-started': 'pi pi-balance',
  'host-assigned': 'pi pi-crown', 'nomination-decision': 'pi pi-arrow-circle-up',
}

onMounted(async () => { items.value = (await api.get('/notifications/mine')).data })

async function read(n: any) {
  if (n.is_read) return
  await api.post(`/notifications/${n.id}/read`)
  n.is_read = true
}
async function readAll() {
  await api.post('/notifications/read-all')
  items.value = items.value.map((i) => ({ ...i, is_read: true }))
}
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
.list { max-width: 640px; }
.item { display: flex; gap: 12px; padding: 10px 12px; border-radius: 8px; align-items: center; cursor: pointer; }
.item.unread { background: #eff6ff; }
.item:hover { background: #f1f5f9; }
</style>
