<template>
  <div class="page">
    <div class="head">
      <h1 style="margin:0">Уведомления</h1>
      <div class="head-actions">
        <span v-if="unreadCount" class="muted">{{ unreadCount }} непрочитанных</span>
        <Button v-if="items.some((i) => !i.is_read)" label="Прочитать все" text size="small"
                @click="readAll" />
      </div>
    </div>

    <div v-if="items.length" class="list">
      <div v-for="n in items" :key="n.id" class="item" :class="{ unread: !n.is_read }"
           @click="read(n)">
        <i :class="icons[n.event] || 'pi pi-bell'" class="item-icon" />
        <div class="item-body">
          <div class="item-title" :class="{ bold: !n.is_read }">{{ n.title }}</div>
          <div v-if="n.body" class="item-text">{{ n.body }}</div>
        </div>
        <div class="item-meta">
          <span v-if="!n.is_read" class="dot" title="непрочитано" />
          <span class="muted small">{{ shortDate(n.created_at) }}</span>
        </div>
      </div>
    </div>
    <p v-else class="muted">Уведомлений нет.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import { notificationsApi } from '../api/endpoints'

const items = ref<any[]>([])
const icons: Record<string, string> = {
  'stage-started': 'pi pi-flag', 'peer-assignment': 'pi pi-star',
  'deadline-reminder': 'pi pi-clock', 'calibration-started': 'pi pi-balance',
  'host-assigned': 'pi pi-crown', 'nomination-decision': 'pi pi-arrow-circle-up',
  'leader-assessment-started': 'pi pi-pencil', 'cycle-cancelled': 'pi pi-ban',
  'cycle-closed': 'pi pi-check-circle', 'self-edit-request': 'pi pi-file-edit',
  'self-edit-decision': 'pi pi-file-check',
}
const unreadCount = computed(() => items.value.filter((i) => !i.is_read).length)

function shortDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  return sameDay ? time : `${d.toLocaleDateString('ru')} ${time}`
}

onMounted(async () => { items.value = await notificationsApi.mine() })

async function read(n: any) {
  if (n.is_read) return
  await notificationsApi.markRead(n.id)
  n.is_read = true
}
async function readAll() {
  await notificationsApi.readAll()
  items.value = items.value.map((i) => ({ ...i, is_read: true }))
}
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.head-actions { display: flex; align-items: center; gap: 12px; }
.list { max-width: 720px; display: flex; flex-direction: column; gap: 6px; }
.item {
  display: flex; gap: 12px; align-items: center; padding: 9px 12px;
  border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer;
  background: #fff;
}
.item:hover { background: #f8fafc; }
.item.unread { background: #eff6ff; border-color: #bfdbfe; }
.item-icon { font-size: 1.05rem; color: #2563eb; flex-shrink: 0; }
.item:not(.unread) .item-icon { color: #94a3b8; }
.item-body { flex: 1; min-width: 0; }
.item-title { font-size: 0.9rem; color: #334155; overflow-wrap: anywhere; }
.item-title.bold { font-weight: 600; color: #0f172a; }
.item:not(.unread) .item-title { color: #64748b; }
.item-text { font-size: 0.8rem; color: #64748b; margin-top: 2px; overflow-wrap: anywhere; }
.item-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #2563eb; display: inline-block; }
.small { font-size: 0.78rem; }
</style>
