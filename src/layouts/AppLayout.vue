<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">PR Tool</div>
      <ul class="menu">
        <li v-for="item in items" :key="item.to">
          <router-link :to="item.to" :class="{ active: $route.path === item.to }">
            <i :class="item.icon" /> {{ item.label }}
          </router-link>
        </li>
      </ul>
      <div class="sidebar-footer muted">{{ auth.me?.email }} · {{ roleLabel }}</div>
    </aside>
    <main class="content">
      <header class="topbar">
        <div></div>
        <div class="flex gap-8 align-center">
          <Badge v-if="unread > 0" :value="unread" severity="warn">
            <i class="pi pi-bell" style="cursor: pointer" @click="$router.push('/notifications')" />
          </Badge>
          <i v-else class="pi pi-bell muted" style="cursor: pointer" @click="$router.push('/notifications')" />
          <Badge v-if="errCount > 0" :value="errCount" severity="danger">
            <i class="pi pi-exclamation-triangle" style="cursor: pointer" @click="errorLogVisible = true" />
          </Badge>
          <i v-else class="pi pi-exclamation-triangle muted" style="cursor: pointer"
             v-tooltip.bottom="'Журнал ошибок'" @click="errorLogVisible = true" />
          <div class="avatar" v-tooltip.bottom="'Мой профиль'" @click="goProfile">
            {{ initials }}
          </div>
          <Button label="Выйти" text size="small" @click="logout" />
        </div>
      </header>
      <router-view />
    </main>
    <Dialog v-model:visible="errorLogVisible" modal header="Журнал ошибок (сессия)" style="width: 780px">
      <p class="muted" style="font-size:.85rem">
        Последние {{ errorLog.length }} ошибок с контекстом. Скопируйте и отправьте в поддержку —
        без консоли разработчика.
      </p>
      <div style="display:flex; justify-content:flex-end; margin-bottom:8px">
        <Button label="Копировать всё" size="small" severity="secondary" @click="copyErrors" />
      </div>
      <div v-for="(e, i) in errorLog" :key="i" class="err-row">
        <div class="err-head">
          <b :class="'ek-' + e.kind">{{ e.kind }}</b>
          <span class="muted">{{ new Date(e.at).toLocaleString('ru') }}</span>
          <span v-if="e.status" class="muted">HTTP {{ e.status }}</span>
        </div>
        <div class="err-msg">{{ e.message }}</div>
        <div class="muted err-ctx">{{ e.user }} · {{ e.route }} · {{ e.url }}</div>
      </div>
      <p v-if="!errorLog.length" class="muted">ошибок нет 🎉</p>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Badge from 'primevue/badge'
import { useAuth } from '../stores/auth'
import { getErrorLog } from '../api/errors'
import { notificationsApi } from '../api/endpoints'

const auth = useAuth()
const router = useRouter()
const route = useRoute()
const unread = ref(0)
const errCount = ref(0)
const errorLogVisible = ref(false)
const errorLog = ref<any[]>([])

function refreshErrors() {
  errorLog.value = [...getErrorLog()]
  errCount.value = errorLog.value.length
}

function copyErrors() {
  const text = JSON.stringify(errorLog.value, null, 1)
  navigator.clipboard.writeText(text)
}

const roleLabel = computed(
  () => ({ admin: 'админ', cto: 'СТО', 'line-manager': 'лин. рукль', 'functional-manager': 'функц. рукль', employee: 'сотрудник' }[auth.role] || auth.role),
)

// меню динамически зависит от пермишенов (fixes5): пункты без perm — всем аутентифицированным
const allItems = [
  { to: '/dashboard', label: 'Дашборд цикла', icon: 'pi pi-chart-bar', perm: 'ROLE_R_DASHBOARD' },
  { to: '/staff', label: 'Сотрудники', icon: 'pi pi-users', perm: 'ROLE_R_STAFF' },
  { to: '/my-review', label: 'Моё ревью', icon: 'pi pi-pencil' },
  { to: '/peer-review', label: 'Оценить коллег', icon: 'pi pi-star' },
  { to: '/peer-validation', label: 'Валидация пиров', icon: 'pi pi-check-square', perm: 'ROLE_C_PEER_ASSIGNMENT' },
  { to: '/calibration', label: 'Калибровки', icon: 'pi pi-balance', perm: 'ROLE_V_REVIEW_RESULT' },
  { to: '/decisions', label: 'Решения и бюджет', icon: 'pi pi-wallet', perm: 'ROLE_R_DECISION_ANY' },
  { to: '/nominations', label: 'Номинации', icon: 'pi pi-arrow-circle-up', perm: 'ROLE_R_NOMINATION' },
  { to: '/imports', label: 'Импорт', icon: 'pi pi-download', perm: 'ROLE_C_IMPORT' },
  { to: '/admin', label: 'Админ', icon: 'pi pi-cog', perm: 'ROLE_U_SETTINGS' },
]
const items = computed(() => allItems.filter((i) => !i.perm || auth.can(i.perm)))

async function refreshUnread() {
  if (!auth.isAuthed) return
  try {
    unread.value = (await notificationsApi.unreadCount()).count
  } catch { /* тихо */ }
}
watch(() => route.path, refreshUnread)
watch(() => errorLogVisible.value, refreshErrors)
onMounted(() => window.addEventListener('prtool:error-logged', refreshErrors))
onMounted(refreshUnread)

function logout() {
  auth.logout()
  router.push('/login')
}

const initials = computed(() => {
  const name = auth.me?.full_name || auth.me?.email || '?'
  return name.split(/[\s._@]+/).filter(Boolean).slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase()).join('')
})

async function goProfile() {
  const me = auth.me as any
  if (me?.employee_id) {
    router.push(`/staff/${me.employee_id}`)
    return
  }
  // без профиля сотрудника — обновляем me (employee_id мог появиться после импорта кадровой)
  try {
    await auth.fetchMe()
    const fresh = auth.me as any
    if (fresh?.employee_id) router.push(`/staff/${fresh.employee_id}`)
    else router.push('/notifications')
  } catch { /* тихо */ }
}
</script>

<style scoped>
.layout { display: flex; min-height: 100vh; }
.sidebar {
  width: 230px; background: #1e293b; color: #e2e8f0; display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh;
}
.brand { font-weight: 700; font-size: 1.1rem; padding: 18px 16px; color: #fff; }
.menu { list-style: none; padding: 0; margin: 8px 0; flex: 1; }
.menu a {
  display: flex; align-items: center; gap: 10px; padding: 10px 16px; color: #cbd5e1;
  text-decoration: none; font-size: 0.92rem;
}
.menu a.active, .menu a:hover { background: #334155; color: #fff; }
.sidebar-footer { padding: 14px 16px; }
.avatar {
  width: 34px; height: 34px; border-radius: 50%; background: #3b82f6; color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 0.8rem;
  font-weight: 700; cursor: pointer; user-select: none; flex-shrink: 0;
}
.avatar:hover { background: #2563eb; }
.err-row { border: 1px solid #f1f5f9; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
.err-head { display: flex; gap: 10px; align-items: center; font-size: .78rem; }
.ek-api { color: #b91c1c; } .ek-render { color: #b45309; } .ek-unhandled { color: #6d28d9; }
.err-msg { font-family: monospace; font-size: .8rem; margin: 4px 0; word-break: break-all; }
.err-ctx { font-size: .72rem; }
.content { flex: 1; min-width: 0; }
.topbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 20px; background: #fff; border-bottom: 1px solid #e2e8f0;
}
.flex { display: flex; } .gap-8 { gap: 12px; } .align-center { align-items: center; }
@media (max-width: 800px) {
  .sidebar { width: 60px; }
  .sidebar .brand { font-size: 0.8rem; padding: 14px 8px; }
  .menu a span, .menu a { font-size: 0; }
  .menu a i { font-size: 1rem; }
  .sidebar-footer { display: none; }
}
</style>
