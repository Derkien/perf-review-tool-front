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
        <Toast />
        <div></div>
        <div class="flex gap-8 align-center">
          <Badge v-if="unread > 0" :value="unread" severity="warn">
            <i class="pi pi-bell" style="cursor: pointer" @click="$router.push('/notifications')" />
          </Badge>
          <i v-else class="pi pi-bell muted" style="cursor: pointer" @click="$router.push('/notifications')" />
          <Button label="Выйти" text size="small" @click="logout" />
        </div>
      </header>
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Badge from 'primevue/badge'
import Toast from 'primevue/toast'
import { useAuth } from '../stores/auth'
import { api } from '../api'

const auth = useAuth()
const router = useRouter()
const route = useRoute()
const unread = ref(0)

const roleLabel = computed(
  () => ({ admin: 'админ', cto: 'СТО', 'line-manager': 'лин. рукль', 'functional-manager': 'функц. рукль', employee: 'сотрудник' }[auth.role] || auth.role),
)

const allItems = [
  { to: '/dashboard', label: 'Дашборд цикла', icon: 'pi pi-chart-bar', roles: ['admin', 'cto', 'line-manager', 'functional-manager'] },
  { to: '/staff', label: 'Сотрудники', icon: 'pi pi-users', roles: ['admin', 'cto', 'line-manager', 'functional-manager'] },
  { to: '/my-review', label: 'Моё ревью', icon: 'pi pi-pencil', roles: ['admin', 'cto', 'line-manager', 'functional-manager', 'employee'] },
  { to: '/peer-review', label: 'Оценить коллег', icon: 'pi pi-star', roles: ['admin', 'cto', 'line-manager', 'functional-manager', 'employee'] },
  { to: '/peer-validation', label: 'Валидация пиров', icon: 'pi pi-check-square', roles: ['admin', 'cto', 'line-manager'] },
  { to: '/calibration', label: 'Калибровки', icon: 'pi pi-balance', roles: ['admin', 'cto', 'line-manager', 'functional-manager'] },
  { to: '/decisions', label: 'Решения и бюджет', icon: 'pi pi-wallet', roles: ['admin', 'cto'] },
  { to: '/nominations', label: 'Номинации', icon: 'pi pi-arrow-circle-up', roles: ['admin', 'cto', 'line-manager'] },
  { to: '/imports', label: 'Импорт', icon: 'pi pi-download', roles: ['admin'] },
  { to: '/admin', label: 'Админ', icon: 'pi pi-cog', roles: ['admin'] },
]
const items = computed(() => allItems.filter((i) => i.roles.includes(auth.role)))

async function refreshUnread() {
  if (!auth.isAuthed) return
  try {
    const r = await api.get('/notifications/unread-count')
    unread.value = r.data.count
  } catch { /* тихо */ }
}
watch(() => route.path, refreshUnread)
onMounted(refreshUnread)

function logout() {
  auth.logout()
  router.push('/login')
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
