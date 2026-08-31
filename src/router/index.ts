import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuth } from '../stores/auth'

const Login = () => import('../views/LoginView.vue')
const Layout = () => import('../layouts/AppLayout.vue')

// роли, которым доступен раздел; employee пускается везде, где не указан meta.roles
const routes = [
  { path: '/login', component: Login },
  {
    path: '/',
    component: Layout,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: () => import('../views/CycleDashboardView.vue'),
        meta: { roles: ['admin', 'cto', 'line-manager', 'functional-manager'] } },
      { path: 'staff', component: () => import('../views/StaffListView.vue'),
        meta: { roles: ['admin', 'cto', 'line-manager', 'functional-manager'] } },
      { path: 'staff/:id', component: () => import('../views/EmployeeCardView.vue') },
      { path: 'my-review', component: () => import('../views/MyReviewView.vue') },
      { path: 'peer-review', component: () => import('../views/PeerReviewView.vue') },
      { path: 'peer-validation', component: () => import('../views/PeerValidationView.vue'),
        meta: { roles: ['admin', 'cto', 'line-manager'] } },
      { path: 'calibration', component: () => import('../views/CalibrationListView.vue'),
        meta: { roles: ['admin', 'cto', 'line-manager', 'functional-manager'] } },
      { path: 'calibration/:id', component: () => import('../views/CalibrationSessionView.vue'),
        meta: { roles: ['admin', 'cto', 'line-manager', 'functional-manager'] } },
      { path: 'decisions', component: () => import('../views/DecisionsView.vue'),
        meta: { roles: ['admin', 'cto'] } },
      { path: 'nominations', component: () => import('../views/NominationsView.vue'),
        meta: { roles: ['admin', 'cto', 'line-manager'] } },
      { path: 'imports', component: () => import('../views/ImportsView.vue'),
        meta: { roles: ['admin'] } },
      { path: 'admin', component: () => import('../views/AdminView.vue'),
        meta: { roles: ['admin'] } },
      { path: 'notifications', component: () => import('../views/NotificationsView.vue') },
    ],
  },
]

const router = createRouter({ history: createWebHashHistory(), routes })

// куда попадает роль после логина (dashboard сотруднику закрыт)
export function homeForRole(role: string): string {
  return ['admin', 'cto', 'line-manager', 'functional-manager'].includes(role)
    ? '/dashboard' : '/my-review'
}

// трек навигации для админ-аналитики (тихий, не блокирует и не ломает выход)
router.afterEach((to) => {
  document.getElementById('fatal-error')?.remove()
  const token = localStorage.getItem('token')
  if (!token) return
  import('../api').then(({ api }) =>
    api.post('/admin/activity', {
      type: 'page-view', section: to.path, detail: { to: to.fullPath },
    }).catch(() => undefined),
  )
})

router.beforeEach((to) => {
  const auth = useAuth()
  if (to.path !== '/login' && !auth.isAuthed) return '/login'
  if (to.path === '/login' && auth.isAuthed) return homeForRole(auth.role)
  // раздел закрыт для роли → её домашняя страница (никаких красных экранов и «задних» входов)
  const allowed = to.meta?.roles as string[] | undefined
  if (allowed && !allowed.includes(auth.role)) return homeForRole(auth.role)
})

export default router
